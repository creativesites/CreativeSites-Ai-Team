import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type * as T from '../api/types.ts';
import type { Repo } from '../store/repo.ts';
import { stripCoordinationBoilerplate } from './session-manager.ts';
import { evaluateRenewal, type RenewalBand, type RenewalEvaluation } from './renewal.ts';

export interface BatonPolicy {
  softContextTokens: number;
  hardContextTokens: number;
  softLogicalTurns: number;
  taskSwitchTokens: number;
}

export const DEFAULT_BATON_POLICY: BatonPolicy = {
  softContextTokens: 36_000,
  hardContextTokens: 64_000,
  softLogicalTurns: 10,
  taskSwitchTokens: 12_000,
};

export function getBatonPolicy(repo: Repo): BatonPolicy {
  try {
    const s = repo.getSettings();
    return {
      softContextTokens:
        typeof s.sessionSoftContextTokens === 'number' && s.sessionSoftContextTokens > 0
          ? s.sessionSoftContextTokens
          : DEFAULT_BATON_POLICY.softContextTokens,
      hardContextTokens:
        typeof s.sessionHardContextTokens === 'number' && s.sessionHardContextTokens > 0
          ? s.sessionHardContextTokens
          : DEFAULT_BATON_POLICY.hardContextTokens,
      softLogicalTurns:
        typeof s.sessionMaxTurns === 'number' && s.sessionMaxTurns > 0
          ? s.sessionMaxTurns
          : DEFAULT_BATON_POLICY.softLogicalTurns,
      taskSwitchTokens: DEFAULT_BATON_POLICY.taskSwitchTokens,
    };
  } catch {
    return DEFAULT_BATON_POLICY;
  }
}

export interface RotationCheck {
  rotate: boolean;
  reason: 'healthy' | 'context_tokens_threshold' | 'context_pct_threshold' | 'turn_count_threshold' | 'task_boundary' | 'manual';
  contextTokens: number;
  logicalTurns: number;
  policy: BatonPolicy;
  /** K7: the renewal band (monitor/prepare/renew/block) the session is in; 'healthy' below monitor. */
  band: RenewalBand;
  /** Context utilisation %, only when the context window is known; otherwise null. */
  pct: number | null;
  /** 'estimated' whenever the window or the token count is not reported by the adapter. */
  measurement: 'actual' | 'estimated';
  contextWindow: number | null;
  /** At the block band: a normal prompt must not go to this session. */
  blocked: boolean;
}

/**
 * The single renewal decision (K7). Known context window: percentage bands from the resolved policy.
 * Unknown window: the absolute token thresholds, labelled 'estimated'. Turn count and task boundary
 * still apply as before.
 */
export function shouldRotateSession(repo: Repo, session: T.Session, nextTaskId?: string | null): RotationCheck {
  const policy = getBatonPolicy(repo);
  const entries = repo.listTranscript(session.id, 0, 5000);
  const logicalTurns = entries.filter((e) => e.kind === 'prompt').length;
  const fallbackTokens = Math.max(
    session.contextTokens ?? 0,
    session.usage?.inputTokens ?? 0,
    estimateTranscriptTokens(entries)
  );
  const ev: RenewalEvaluation = evaluateRenewal(repo, session, { fallbackTokens, policy });
  const contextTokens = ev.tokens;
  const common = {
    contextTokens,
    logicalTurns,
    policy,
    band: ev.band,
    pct: ev.pct,
    measurement: ev.measurement,
    contextWindow: ev.window,
    blocked: ev.band === 'block' && repo.getSetting('renewal.allowOverBlock') !== true,
  };

  if (ev.rank >= 3) {
    return { rotate: true, reason: ev.window ? 'context_pct_threshold' : 'context_tokens_threshold', ...common };
  }
  if (logicalTurns >= policy.softLogicalTurns) {
    return { rotate: true, reason: 'turn_count_threshold', ...common };
  }
  const taskSwitchHit = ev.window ? ev.rank >= 1 : contextTokens >= policy.taskSwitchTokens;
  if (nextTaskId && session.taskId && nextTaskId !== session.taskId && taskSwitchHit) {
    return { rotate: true, reason: 'task_boundary', ...common };
  }
  return { rotate: false, reason: 'healthy', ...common };
}

export function estimateTranscriptTokens(entries: T.TranscriptEntry[]): number {
  let chars = 0;
  for (const e of entries) {
    if (
      e.kind === 'prompt' ||
      e.kind === 'message' ||
      e.kind === 'agent_message_chunk' ||
      e.kind === 'thought' ||
      e.kind === 'tool'
    ) {
      const p = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>;
      const t = typeof p.text === 'string' ? p.text : JSON.stringify(p);
      chars += t.length;
    }
  }
  return Math.ceil(chars / 3.8);
}

/**
 * Extracts `[STATE] ... [/STATE]` or `[STATE: ...]` checkpoint block from an assistant message.
 */
export function extractAgentStateBlock(text: string): string | null {
  const blockMatch = text.match(/\[STATE\]([\s\S]*?)\[\/STATE\]/i);
  if (blockMatch?.[1]?.trim()) {
    return blockMatch[1].trim();
  }
  const inlineMatch = text.match(/\[STATE:\s*([^\]]+)\]/i);
  if (inlineMatch?.[1]?.trim()) {
    return inlineMatch[1].trim();
  }
  return null;
}

function readGitWorktreeDigest(worktree: string | null): string {
  if (!worktree || !fs.existsSync(worktree)) return 'Worktree: none';
  try {
    const status = execFileSync('git', ['-C', worktree, 'status', '--short'], {
      encoding: 'utf8',
      timeout: 1500,
    }).trim();
    const diffStat = execFileSync('git', ['-C', worktree, 'diff', '--stat'], {
      encoding: 'utf8',
      timeout: 1500,
    }).trim();
    const recentCommits = execFileSync('git', ['-C', worktree, 'log', '-n', '3', '--oneline'], {
      encoding: 'utf8',
      timeout: 1500,
    }).trim();
    const lines: string[] = [`Worktree Path: ${worktree}`];
    if (recentCommits) {
      lines.push(`Recent Commits:\n${recentCommits.split('\n').map((l) => `  ${l}`).join('\n')}`);
    }
    if (status) {
      lines.push(`Uncommitted Files (git status -s):\n${status.split('\n').slice(0, 20).map((l) => `  ${l}`).join('\n')}`);
    } else {
      lines.push('Working Tree Status: clean');
    }
    if (diffStat) {
      lines.push(`Diff Summary:\n${diffStat.split('\n').slice(0, 15).map((l) => `  ${l}`).join('\n')}`);
    }
    return lines.join('\n');
  } catch {
    return `Worktree Path: ${worktree} (non-git or clean)`;
  }
}

export interface TurnBucket {
  promptText: string;
  assistantText: string;
  tools: string[];
  commits: string[];
}

function groupTranscriptIntoTurns(entries: T.TranscriptEntry[]): TurnBucket[] {
  const turns: TurnBucket[] = [];
  let current: TurnBucket = { promptText: '', assistantText: '', tools: [], commits: [] };

  for (const e of entries) {
    const p = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>;
    if (e.kind === 'prompt') {
      if (current.promptText || current.assistantText || current.tools.length > 0) {
        turns.push(current);
        current = { promptText: '', assistantText: '', tools: [], commits: [] };
      }
      current.promptText = stripCoordinationBoilerplate(typeof p.text === 'string' ? p.text : '');
    } else if (e.kind === 'message' || e.kind === 'agent_message_chunk') {
      if (typeof p.text === 'string') {
        current.assistantText += p.text;
      }
    } else if (e.kind === 'tool') {
      const title = typeof p.title === 'string' ? p.title : e.title ?? 'tool';
      const status = typeof p.status === 'string' ? p.status : '';
      const raw = (p.rawInput && typeof p.rawInput === 'object' ? p.rawInput : {}) as Record<string, unknown>;
      const target = typeof raw.file_path === 'string' ? raw.file_path : typeof raw.path === 'string' ? raw.path : typeof raw.command === 'string' ? raw.command : '';
      const label = `[${title}${target ? `: ${target}` : ''}${status ? ` (${status})` : ''}]`;
      if (!current.tools.includes(label)) {
        current.tools.push(label);
      }
    } else if (e.kind === 'commit') {
      const sha = typeof p.commitSha === 'string' ? p.commitSha.slice(0, 8) : '';
      if (sha) current.commits.push(sha);
    }
  }
  if (current.promptText || current.assistantText || current.tools.length > 0) {
    turns.push(current);
  }
  return turns;
}

export interface ContinuationPackage {
  generatedAt: string;
  sessionId: string;
  discoveries: string[];
  decisions: string[];
  commits: string[];
  blockers: string[];
  acceptanceCriteria: { text: string; evidence: string }[];
  nextActions: string[];
}

const clip = (v: string, n: number) => v.replace(/\s+/g, ' ').trim().slice(0, n);

function stateLines(block: string | null, keys: string[]): string[] {
  if (!block) return [];
  const re = new RegExp(`^\\s*(?:${keys.join('|')})\\s*:\\s*(.+)$`, 'i');
  return block.split('\n').map((l) => l.match(re)?.[1]?.trim() ?? '').filter(Boolean);
}

/**
 * K7 continuation package: what a fresh session needs to carry on, taken from evidence, blockers,
 * criteria and the transcript. No LLM call; every field is a verbatim or truncated record.
 */
export function buildContinuationPackage(
  repo: Repo,
  session: T.Session,
  entries: T.TranscriptEntry[],
  turns: TurnBucket[],
  latestStateBlock: string | null
): ContinuationPackage {
  const job = session.jobId ? repo.getJob(session.jobId) : null;
  const discoveries: string[] = stateLines(latestStateBlock, ['done']);
  const decisions: string[] = stateLines(latestStateBlock, ['decision', 'decisions']);
  const commits: string[] = [];
  const blockers: string[] = [];
  const nextActions: string[] = stateLines(latestStateBlock, ['next']);

  for (const ev of (job?.evidence ?? []).filter((e) => e.kind !== 'command' && e.kind !== 'test' && e.class !== 'UNKNOWN').slice(-6)) {
    discoveries.push(clip(`[${ev.class}] ${ev.summary}`, 200));
  }
  for (const d of job?.plan?.humanDecisions ?? []) decisions.push(clip(d, 200));
  for (const t of turns) {
    for (const m of t.assistantText.split(/(?<=[.!?])\s+/)) {
      if (/\b(decided|decision|we chose|chose to|will use)\b/i.test(m) && decisions.length < 8) decisions.push(clip(m, 200));
    }
  }
  for (const e of entries) {
    if (e.kind !== 'commit') continue;
    const p = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>;
    if (typeof p.commitSha === 'string') commits.push(p.commitSha.slice(0, 8));
  }
  if (job) {
    for (const b of repo.listBlockers({ status: 'open', jobId: job.id })) {
      blockers.push(clip(`${b.summary}${b.needs ? ` (needs: ${b.needs})` : ''}`, 220));
    }
    for (const t of job.tasks) {
      if (['done', 'verified', 'cancelled'].includes(t.status)) continue;
      nextActions.push(clip(`${t.title} (${t.status})${t.checkCommand ? ` check: ${t.checkCommand}` : ''}`, 200));
    }
  }
  const uniq = (xs: string[], max: number) => [...new Set(xs)].slice(-max);
  return {
    generatedAt: new Date().toISOString(),
    sessionId: session.id,
    discoveries: uniq(discoveries, 8),
    decisions: uniq(decisions, 8),
    commits: uniq(commits, 10),
    blockers: uniq(blockers, 6),
    acceptanceCriteria: (job?.criteria ?? []).slice(0, 10).map((c) => ({ text: clip(c.text, 200), evidence: c.evidenceClass })),
    nextActions: uniq(nextActions, 8),
  };
}

function renderContinuationPackage(pkg: ContinuationPackage): string {
  const list = (title: string, xs: string[]) => (xs.length ? [`${title}:`, ...xs.map((x) => `  - ${x}`)] : [`${title}: none recorded`]);
  return [
    '\n[CONTINUATION PACKAGE]',
    ...list('Discoveries', pkg.discoveries),
    ...list('Decisions', pkg.decisions),
    ...list('Commits', pkg.commits),
    ...list('Open blockers', pkg.blockers),
    ...list('Acceptance criteria', pkg.acceptanceCriteria.map((c) => `${c.text} [evidence: ${c.evidence}]`)),
    ...list('Next actions', pkg.nextActions),
  ].join('\n');
}

/**
 * Deterministically compiles a 3-Tier Baton Capsule (~1,500–2,000 tokens) from SQLite + Git
 * with zero LLM calls, preserving 100% of recent working memory while shedding older token bloat.
 */
export function compileBatonCapsule(repo: Repo, sessionId: string): { capsule: string; previousContextTokens: number; capsuleTokens: number; continuation: ContinuationPackage } {
  const session = repo.getSession(sessionId);
  const agent = repo.getIdentity(session.agentId);
  const job = session.jobId ? repo.getJob(session.jobId) : null;
  const task = session.taskId ? repo.getTask(session.taskId) : null;
  const entries = repo.listTranscript(sessionId, 0, 10000);
  const previousContextTokens = Math.max(
    session.contextTokens ?? 0,
    session.usage?.inputTokens ?? 0,
    estimateTranscriptTokens(entries)
  );

  const turns = groupTranscriptIntoTurns(entries);
  const olderTurns = turns.length > 2 ? turns.slice(0, turns.length - 2) : [];
  const hotTurns = turns.slice(-2);

  // Extract the latest [STATE] block if the agent emitted one
  let latestStateBlock: string | null = null;
  for (let i = turns.length - 1; i >= 0; i--) {
    const found = extractAgentStateBlock(turns[i]!.assistantText);
    if (found) {
      latestStateBlock = found;
      break;
    }
  }

  // Carry forward prior baton summary if this is Gen 2+ and this session only had 1 turn
  const sections: string[] = [
    `=== MYAOS ROLE SESSION BATON HANDOFF (Gen ${session.generation ?? 1} -> Gen ${(session.generation ?? 1) + 1}) ===`,
    `You are continuing your work as ${agent.name} (${agent.id}, role: ${agent.role ?? 'specialist'}) in a fresh, token-lean session.`,
    `Previous Session ID: ${session.id} (shed ~${Math.max(0, previousContextTokens)} accumulated context tokens).`,
  ];

  // --- TIER 1: Role & Job Anchor ---
  const tier1: string[] = ['\n[TIER 1: ROLE & ARCHITECTURAL ANCHOR]'];
  if (job) {
    tier1.push(`Job #${job.number}: ${job.title} (stage: ${job.stage}, kind: ${job.kind ?? 'code'})`);
    if (job.plan?.summary) tier1.push(`Accepted Plan: ${job.plan.summary.slice(0, 400)}`);
  }
  if (task) {
    tier1.push(`Assigned Task: ${task.title} (status: ${task.status})`);
    if (task.checkCommand) tier1.push(`Verification Check Command: ${task.checkCommand}`);
  }
  sections.push(tier1.join('\n'));

  // --- TIER 2: Episodic Archive of Older Turns ---
  if (olderTurns.length > 0 || session.batonCapsule) {
    const tier2: string[] = ['\n[TIER 2: EPISODIC LEDGER OF EARLIER TURNS]'];
    const allOlderCommits = olderTurns.flatMap((t) => t.commits);
    const allOlderTools = [...new Set(olderTurns.flatMap((t) => t.tools))].slice(-12);
    if (allOlderCommits.length > 0) {
      tier2.push(`Earlier Commits: ${allOlderCommits.join(', ')}`);
    }
    if (allOlderTools.length > 0) {
      tier2.push(`Earlier Tools/Files Touched: ${allOlderTools.join(', ')}`);
    }
    olderTurns.slice(-5).forEach((t, idx) => {
      const pShort = t.promptText.replace(/\s+/g, ' ').slice(0, 140);
      const aShort = t.assistantText.replace(/\s+/g, ' ').slice(-220);
      tier2.push(`- Turn ${idx + 1}: Prompt="${pShort}" -> Outcome="${aShort}"`);
    });
    sections.push(tier2.join('\n'));
  }

  // --- TIER 3: Hot Working Memory (Most Recent Work + Live Git + Latest Check) ---
  const tier3: string[] = ['\n[TIER 3: HOT WORKING MEMORY — MOST RECENT WORK (HIGH PRIORITY)]'];
  if (latestStateBlock) {
    tier3.push(`Agent Self-Checkpoint [STATE]:\n${latestStateBlock}`);
  }

  hotTurns.forEach((t, idx) => {
    const label = hotTurns.length === 2 && idx === 0 ? 'Penultimate Turn (Turn N-1)' : 'Most Recent Turn (Turn N)';
    const maxAssistantChars = idx === hotTurns.length - 1 ? 1800 : 800;
    const cleanAssistant = t.assistantText.trim();
    const assistantExcerpt =
      cleanAssistant.length > maxAssistantChars
        ? `...${cleanAssistant.slice(-maxAssistantChars)}`
        : cleanAssistant || '(no assistant text)';
    tier3.push(
      `--- ${label} ---`,
      `Instruction: ${t.promptText.slice(0, 500)}`,
      t.tools.length > 0 ? `Tools Executed: ${t.tools.slice(-8).join(', ')}` : '',
      t.commits.length > 0 ? `Commits Recorded: ${t.commits.join(', ')}` : '',
      `Your Response:\n${assistantExcerpt}`
    );
  });

  // Live Git Worktree state
  tier3.push('\nLive Workspace / Git State:', readGitWorktreeDigest(session.worktree));

  // Latest task/job command evidence (especially if a check recently ran)
  if (job) {
    const recentCheckEvidence = (job.evidence ?? [])
      .filter((e) => e.kind === 'command' || e.kind === 'test')
      .slice(-2);
    if (recentCheckEvidence.length > 0) {
      tier3.push('\nRecent Verification / Check Evidence:');
      for (const ev of recentCheckEvidence) {
        const p = (ev.payload && typeof ev.payload === 'object' ? ev.payload : {}) as Record<string, unknown>;
        const stderr = typeof p.stderr === 'string' && p.stderr.trim() ? `\n  stderr: ${p.stderr.trim().slice(-400)}` : '';
        tier3.push(`- [${ev.class}] ${ev.summary} (cmd: ${ev.command ?? 'n/a'}, exit: ${ev.exitCode ?? 'n/a'})${stderr}`);
      }
    }
  }

  sections.push(tier3.filter(Boolean).join('\n'));
  const continuation = buildContinuationPackage(repo, session, entries, turns, latestStateBlock);
  sections.push(renderContinuationPackage(continuation));
  sections.push('=== END OF BATON CAPSULE — CONTINUE SEAMLESSLY FROM TIER 3 ===\n');

  const capsule = sections.join('\n');
  const capsuleTokens = Math.ceil(capsule.length / 3.8);
  return { capsule, previousContextTokens, capsuleTokens, continuation };
}
