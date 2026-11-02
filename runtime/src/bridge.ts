import fs from 'node:fs';
import path from 'node:path';
import type * as T from './api/types.ts';
import type { Repo } from './store/repo.ts';
import { BridgeIngest, REPLIES_MARKER, type IngestResult } from './bridge-ingest.ts';

// The team still works in community/threads and inboxes. The bridge mirrors a
// job's dossier into a thread file and drops inbox notes for assigned agents.
// It is opt-in (settings bridge.enabled) and never writes canonical state back.

export interface BridgeOptions {
  repo: Repo;
  teamRepo: string | null;
  /** Override for tests; defaults to <teamRepo>/community. */
  communityRoot?: string;
}

export interface BridgeStatus {
  configured: boolean;
  enabled: boolean;
  teamRepo: string | null;
  threadsDir: string | null;
  proposalsDir: string | null;
  inboxDir: string | null;
  lastMirrorAt: string | null;
  lastIngestAt: string | null;
  lastSyncAt: string | null;
  ingested: number;
  lastError: string | null;
}

export class Bridge {
  private readonly repo: Repo;
  private readonly teamRepo: string | null;
  private readonly root: string | null;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private lastMirrorAt: string | null = null;
  private lastIngestAt: string | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private readonly ingest: BridgeIngest | null;
  private ingestTimer: NodeJS.Timeout | null = null;
  private initialIngestTimer: NodeJS.Timeout | null = null;

  constructor(opts: BridgeOptions) {
    this.repo = opts.repo;
    this.teamRepo = opts.teamRepo ? path.resolve(expand(opts.teamRepo)) : null;
    this.root = opts.communityRoot ?? (this.teamRepo ? path.join(this.teamRepo, 'community') : null);
    this.ingest = this.root ? new BridgeIngest({ repo: this.repo, communityRoot: this.root }) : null;
  }

  /** Starts the periodic ingest of legacy thread replies and inbox notes. */
  start(): void {
    if (!this.root || this.ingestTimer) return;
    this.initialIngestTimer = setTimeout(() => this.runIngest(), 2000);
    this.initialIngestTimer.unref?.();
    this.ingestTimer = setInterval(() => this.runIngest(), 20_000);
    this.ingestTimer.unref?.();
  }

  private runIngest(): void {
    try {
      if (!this.settings().enabled) return;
      this.ingestNow();
    } catch (e) {
      this.lastError = (e as Error).message;
    }
  }

  /** Imports any new inbox notes / thread replies now; returns the counts. */
  ingestNow(): IngestResult {
    if (!this.ingest) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const result = this.ingest.scan();
    this.lastIngestAt = new Date().toISOString();
    if (result.errors.length) this.lastError = result.errors[0]!;
    return result;
  }

  private settings(): { enabled: boolean; inbox: boolean } {
    const settings = this.repo.getSettings();
    const bridge = settings.bridge as { enabled?: unknown; inbox?: unknown } | undefined;
    return { enabled: bridge?.enabled === true, inbox: bridge?.inbox !== false };
  }

  status(): BridgeStatus {
    return {
      configured: Boolean(this.root),
      enabled: this.settings().enabled,
      teamRepo: this.teamRepo,
      threadsDir: this.root ? path.join(this.root, 'threads', 'desktop') : null,
      proposalsDir: this.root ? path.join(this.root, 'proposals') : null,
      inboxDir: this.root ? path.join(this.root, 'inboxes') : null,
      lastMirrorAt: this.lastMirrorAt,
      lastIngestAt: this.lastIngestAt,
      lastSyncAt: this.lastSyncAt,
      ingested: this.repo.bridgeIngestCount(),
      lastError: this.lastError,
    };
  }

  /** Called for every committed runtime event; cheap unless the bridge is enabled. */
  onEvent(event: T.RuntimeEvent): void {
    if (!this.root || !this.settings().enabled) return;
    const jobId = event.subjectId;
    if (!jobId || !['job', 'approval', 'eval', 'council'].includes(String(event.subjectType ?? ''))) {
      // approval/evidence events carry the job id as subjectId
      if (!jobId) return;
    }
    try {
      const mirrorEvents = new Set([
        'job.created',
        'job.stage_changed',
        'job.plan_set',
        'job.plan_accepted',
        'job.updated',
        'job.shipped',
        'evidence.recorded',
        'evidence.verified',
        'approval.requested',
        'approval.decided',
        'approval.escalated',
        'approval.expired',
        'task.created',
      ]);
      if (mirrorEvents.has(event.type)) this.scheduleMirror(jobId);
      if (['council.verdict', 'council.accepted'].includes(event.type)) {
        const payload = event.payload as { councilId?: string } | undefined;
        if (payload?.councilId) {
          try {
            this.exportCouncilVerdict(payload.councilId);
          } catch (e) {
            this.lastError = (e as Error).message;
          }
        }
      }
      if (event.type === 'job.shipped' && jobId) {
        try {
          this.exportShippedJob(jobId);
        } catch (e) {
          this.lastError = (e as Error).message;
        }
      }
      if (event.type === 'task.created' && this.settings().inbox) {
        const payload = event.payload as { taskId?: string } | undefined;
        if (payload?.taskId) {
          const job = this.repo.getJob(jobId);
          const task = job.tasks.find((t) => t.id === payload.taskId);
          if (task?.assigneeId) {
            this.notifyAgent(task.assigneeId, {
              type: 'task.assigned',
              priority: 'normal',
              job,
              title: `Task assigned: ${task.title}`,
              body: `JOB-${job.number} — ${job.title}\n\nTask: ${task.title}\nCheck: ${task.checkCommand ?? '(none)'}\nGate: ${task.gate ?? '(none)'}\n\nWorktree and session are owned by the MyaOS runtime. Reply in the thread; the runtime imports replies as Claimed.`,
            });
          }
        }
      }
      if (event.type === 'approval.requested' && this.settings().inbox) {
        const payload = event.payload as { approvalId?: string } | undefined;
        if (payload?.approvalId) {
          const approval = this.repo.getApproval(payload.approvalId);
          if (approval.assignedTo && approval.assignedKind === 'agent') {
            const job = this.repo.getJob(jobId);
            this.notifyAgent(approval.assignedTo, {
              type: 'approval.requested',
              priority: approval.risk === 'high' || approval.risk === 'critical' ? 'high' : 'normal',
              job,
              title: `Approval requested: ${approval.title}`,
              body: `JOB-${job.number} — ${job.title}\n\n${approval.consequence}\n\nRisk: ${approval.risk}\nReversible: ${approval.reversible == null ? 'unknown' : approval.reversible ? 'yes' : 'no'}\nExpires: ${approval.expiresAt ?? 'unknown'}\n\nDecide it in MyaOS (approval ${approval.id}) or reply in the thread.`,
            });
          }
        }
      }
    } catch (e) {
      this.lastError = (e as Error).message;
    }
  }

  private scheduleMirror(jobId: string): void {
    const existing = this.timers.get(jobId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(jobId);
      try {
        this.mirrorJob(jobId);
      } catch (e) {
        this.lastError = (e as Error).message;
      }
    }, 800);
    timer.unref?.();
    this.timers.set(jobId, timer);
  }

  mirrorJob(jobId: string): { path: string } {
    if (!this.root) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const job = this.repo.getJob(jobId);
    const room = this.repo.getRoom(job.roomId);
    const project = job.projectId ? this.repo.getProject(job.projectId) : null;
    const threadDir = path.join(this.root, 'threads', 'desktop');
    fs.mkdirSync(threadDir, { recursive: true });
    const file = path.join(threadDir, `JOB-${job.number}-${slugify(job.title)}.md`);
    const rendered = renderJob(job, room, project);
    let replies = `${REPLIES_MARKER}\n\n_Replies below this line are imported as Claimed._\n`;
    try {
      const existing = fs.readFileSync(file, 'utf8');
      const marker = existing.indexOf(REPLIES_MARKER);
      if (marker >= 0) replies = existing.slice(marker);
    } catch {
      /* first write */
    }
    const head = rendered.slice(0, rendered.indexOf(REPLIES_MARKER));
    fs.writeFileSync(file, `${head}${replies}`, { mode: 0o644 });
    this.lastMirrorAt = new Date().toISOString();
    return { path: file };
  }

  /** Exports a Council verdict as a formal proposal markdown document into community/proposals/. */
  exportCouncilVerdict(councilId: string): { path: string } {
    if (!this.root) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const council = this.repo.getCouncil(councilId);
    let verdict: T.CouncilVerdict;
    try {
      verdict = council.verdict ?? this.repo.getVerdict(councilId);
    } catch {
      throw new Error(`Council ${councilId} has no verdict yet`);
    }
    const job = this.repo.getJob(council.jobId);
    const proposalsDir = path.join(this.root, 'proposals');
    fs.mkdirSync(proposalsDir, { recursive: true });
    const slug = slugify(council.title || council.decision || 'verdict');
    const file = path.join(proposalsDir, `COUNCIL-JOB-${job.number}-${slug}.md`);
    const rendered = renderCouncilVerdict(council, verdict, job);
    fs.writeFileSync(file, rendered, { mode: 0o644 });
    this.lastMirrorAt = new Date().toISOString();
    return { path: file };
  }

  /** Exports a shipped job to community/threads/desktop/ and community/proposals/. */
  exportShippedJob(jobId: string): { threadPath: string; proposalPath: string } {
    if (!this.root) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const job = this.repo.getJob(jobId);
    const room = this.repo.getRoom(job.roomId);
    const project = job.projectId ? this.repo.getProject(job.projectId) : null;
    const mirrored = this.mirrorJob(jobId);
    const proposalsDir = path.join(this.root, 'proposals');
    fs.mkdirSync(proposalsDir, { recursive: true });
    const propFile = path.join(proposalsDir, `SHIPPED-JOB-${job.number}-${slugify(job.title)}.md`);
    const rendered = renderShippedJobProposal(job, room, project);
    fs.writeFileSync(propFile, rendered, { mode: 0o644 });
    this.lastMirrorAt = new Date().toISOString();
    return { threadPath: mirrored.path, proposalPath: propFile };
  }

  /** Exports all shipped jobs across all projects. */
  exportShippedJobs(): { exported: number; paths: string[] } {
    if (!this.root) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const jobs = this.repo.listJobs();
    const shipped = jobs.filter((j) => j.shipStatus != null || j.stage === 'done');
    const paths: string[] = [];
    for (const s of shipped) {
      try {
        const res = this.exportShippedJob(s.id);
        paths.push(res.threadPath, res.proposalPath);
      } catch (e) {
        this.lastError = (e as Error).message;
      }
    }
    return { exported: shipped.length, paths };
  }

  /** Exports all council verdicts across all jobs into community/proposals/. */
  exportAllVerdicts(): { exported: number; paths: string[] } {
    if (!this.root) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const councils = this.repo.listAllCouncils(200);
    const withVerdict = councils.filter((c) => c.verdict != null || c.status === 'verdict' || c.status === 'accepted');
    const paths: string[] = [];
    for (const c of withVerdict) {
      try {
        const res = this.exportCouncilVerdict(c.id);
        paths.push(res.path);
      } catch (e) {
        this.lastError = (e as Error).message;
      }
    }
    return { exported: withVerdict.length, paths };
  }

  /**
   * Performs an immediate manual sync:
   * 1. Exports all council verdicts into community/proposals/
   * 2. Exports and mirrors all shipped and active jobs into community/threads/desktop/ and community/proposals/
   * 3. Ingests any replies / incoming notes from community/inboxes/
   */
  syncAll(): T.BridgeSyncResult {
    if (!this.root) throw new Error('No team repo configured (settings.teamRepo / config teamRepo)');
    const vRes = this.exportAllVerdicts();
    const sRes = this.exportShippedJobs();
    for (const j of this.repo.listJobs()) {
      try {
        this.mirrorJob(j.id);
      } catch {
        /* skip broken jobs */
      }
    }
    let ingested = 0;
    if (this.ingest) {
      try {
        const ingRes = this.ingestNow();
        ingested = ingRes.imported;
      } catch (e) {
        this.lastError = (e as Error).message;
      }
    }
    const syncedAt = new Date().toISOString();
    this.lastSyncAt = syncedAt;
    return {
      ok: true,
      syncedAt,
      verdictsExported: vRes.exported,
      jobsExported: sRes.exported,
      ingested,
      paths: [...vRes.paths, ...sRes.paths],
    };
  }

  notifyAgent(agentId: string, input: { type: string; priority: string; job: T.JobDetail; title: string; body: string }): { path: string } {
    if (!this.root) throw new Error('No team repo configured');
    const dir = path.join(this.root, 'inboxes', agentId);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `${stamp}_job-${input.job.number}-${slugify(input.title)}.md`);
    const frontmatter = [
      '---',
      'from: myaos-runtime',
      `to: ${agentId}`,
      `type: ${input.type}`,
      `priority: ${input.priority}`,
      `related_job: JOB-${input.job.number}`,
      `job_id: ${input.job.id}`,
      `created_at: ${new Date().toISOString()}`,
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(file, `${frontmatter}${input.title}\n\n${input.body}\n`, { mode: 0o644 });
    return { path: file };
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.initialIngestTimer) {
      clearTimeout(this.initialIngestTimer);
      this.initialIngestTimer = null;
    }
    if (this.ingestTimer) clearInterval(this.ingestTimer);
    this.ingestTimer = null;
  }
}

function renderJob(job: T.JobDetail, room: T.Room, project: T.Project | null): string {
  const lines: string[] = [
    '---',
    `job_id: ${job.id}`,
    `job_number: ${job.number}`,
    `title: ${JSON.stringify(job.title)}`,
    `room: ${room.name}`,
    `project: ${project?.name ?? 'unknown'}`,
    `stage: ${job.stage}`,
    `risk: ${job.risk ?? 'low'}`,
    `owner: ${job.ownerId ?? 'unknown'}`,
    `updated_at: ${job.updatedAt}`,
    'source: myaos-runtime',
    '---',
    '',
    `# JOB-${job.number} — ${job.title}`,
    '',
    `> Mirrored from the MyaOS runtime store. The runtime owns this job; this thread is the team-readable copy. Replies here are imported as Claimed, not Observed.`,
    '',
    '## Brief',
    '',
    job.brief || '_(no brief)_',
    '',
    '## Plan',
    '',
    job.plan?.summary || '_No plan accepted yet._',
    job.plan?.chosen ? `\nChosen option: **${job.plan.chosen}**` : '',
    '',
    '## Done means',
    '',
    ...(job.criteria.length
      ? job.criteria.map((c) => `- [${c.evidenceClass}] ${c.text}`)
      : ['_No acceptance criteria._']),
    '',
    '## Tasks',
    '',
    ...(job.tasks.length
      ? [
          '| # | Task | Assignee | Check | Gate | Status |',
          '|---|---|---|---|---|---|',
          ...job.tasks.map(
            (t) =>
              `| ${t.planTaskId ?? t.position ?? ''} | ${escapePipe(t.title)} | ${t.assigneeId ?? '—'} | \`${escapePipe(t.checkCommand ?? '')}\` | ${escapePipe(t.gate ?? '')} | ${t.status} |`
          ),
        ]
      : ['_No tasks yet._']),
    '',
    '## Approvals',
    '',
    ...(job.approvals.length
      ? job.approvals.map(
          (a) =>
            `- **${a.status}** · ${a.title} · risk ${a.risk ?? 'low'} · assigned ${a.assignedTo ?? '—'} · expires ${a.expiresAt ?? '—'}\n  ${a.consequence}`
        )
      : ['_No approvals yet._']),
    '',
    '## Evidence',
    '',
    ...(job.evidence.length
      ? job.evidence
          .slice()
          .reverse()
          .map(
            (e) =>
              `- \`${e.createdAt}\` **[${e.class}]** ${e.kind} — ${e.summary} _(by ${e.recordedBy})_${e.command ? `\n  \`${e.command}\`${e.exitCode == null ? '' : ` → exit ${e.exitCode}`}` : ''}`
          )
      : ['_No evidence yet._']),
    '',
    '## Stage history',
    '',
    ...(job.history ?? []).map(
      (h) => `- \`${h.createdAt}\` ${h.fromStage ?? '∅'} → ${h.toStage} by ${h.actorId}${h.note ? ` — ${h.note}` : ''}`
    ),
    '',
    ...(job.shipStatus || job.shipSha
      ? [
          '## Shipped',
          '',
          `- **Status**: ${job.shipStatus ?? 'shipped'}`,
          `- **Commit SHA**: \`${job.shipSha ?? 'unknown'}\``,
          `- **Strategy**: \`${String(job.shipPayload?.strategy ?? 'merge')}\``,
          `- **Target Branch**: \`${String(job.shipPayload?.targetBranch ?? 'main')}\``,
          `- **Shipped By**: ${String(job.shipPayload?.shippedBy ?? 'runtime')}`,
          `- **Shipped At**: \`${String(job.shipPayload?.shippedAt ?? job.updatedAt)}\``,
          '',
        ]
      : []),
    '## Links',
    '',
    `- Job: myaos://jobs/${job.id}`,
    project ? `- Project: ${project.name}` : '',
    `- Room: #${room.name}`,
    '',
    REPLIES_MARKER,
    '',
    '_Replies below this line are imported as Claimed._',
    '',
  ];
  return `${lines.filter((line) => line !== '').join('\n')}\n`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'job';
}

function escapePipe(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function expand(p: string): string {
  return p.startsWith('~/') ? path.join(process.env.HOME ?? '', p.slice(2)) : p;
}

function renderCouncilVerdict(council: T.Council, verdict: T.CouncilVerdict, job: T.JobDetail): string {
  const p = (verdict.payload ?? {}) as Partial<T.CouncilResult>;
  const scores = p.scores ?? [];
  const lines: string[] = [
    '---',
    `proposal_id: ${council.id}`,
    `council_id: ${council.id}`,
    `job_id: ${job.id}`,
    `job_number: ${job.number}`,
    `title: ${JSON.stringify(council.title || council.decision || `Council for JOB-${job.number}`)}`,
    `label: ${verdict.label}`,
    `score: ${verdict.score ?? 0}`,
    `spread: ${verdict.spread ?? 0}`,
    `confidence: ${verdict.confidence ?? 0}`,
    `support: ${verdict.support ?? 0}`,
    `status: ${council.status}`,
    `created_at: ${verdict.createdAt}`,
    'source: myaos-runtime',
    '---',
    '',
    `# Council Verdict: ${council.title || council.decision || `JOB-${job.number}`}`,
    '',
    `> **Deliberated in MyaOS Roast-Room Council for [JOB-${job.number}: ${job.title}](myaos://jobs/${job.id})**  `,
    `> **Verdict**: **${verdict.label}** · Score: **${verdict.score ?? 0}/100** · Support: **${verdict.support ?? 0}%** · Confidence: **${verdict.confidence ?? 0}%** · Spread: **${verdict.spread ?? 0}**  `,
    `> **Date**: \`${verdict.createdAt}\`  `,
    '',
    '## 1. Decision & Call',
    '',
    `**${p.call || verdict.label}**`,
    '',
    p.recommended ? `Recommended Option: **${p.recommended}**` : '',
    p.override_note ? `\n> **Override Note**: ${p.override_note}` : '',
    '',
    '## 2. Option Scorecard',
    '',
    scores.length
      ? [
          '| Option | Label | Weighted Score |',
          '|---|---|---|',
          ...scores.map((s) => `| **${s.id}** | ${escapePipe(s.label)} | **${s.score}/100** |`),
        ].join('\n')
      : '_No option scores recorded._',
    '',
    ...(p.rules
      ? [
          '### Rule Evaluation',
          `- Disaster Cap Applied: ${p.rules.disasterCapApplied ? '⚠️ Yes' : 'No'}`,
          `- Irreversible Action (Cannot Undo): ${p.rules.cannotUndo ? '⚠️ Yes' : 'No'}`,
          `- Unanimity / Too Fast Agreement: ${p.rules.tooFastAgreement ? '⚠️ Flagged' : 'No'}`,
          '',
        ]
      : []),
    ...(Array.isArray(p.why) && p.why.length
      ? [
          '## 3. Top Arguments ("Why")',
          '',
          ...p.why.map((w) => `- **${w.seat}** (${w.framework}): ${w.point}`),
          '',
        ]
      : []),
    ...(Array.isArray(p.fights) && p.fights.length
      ? [
          '## 4. Fault Lines & Cruxes',
          '',
          ...p.fights.map((f) => `### Crux: ${f.crux}\n${f.story}`),
          '',
        ]
      : []),
    ...(p.minority
      ? [
          '## 5. Minority Report ("Watch Out")',
          '',
          `> "${p.minority.quote}" — **${p.minority.seat}**`,
          '',
          `*Would have to be true to flip*: ${p.minority.would_have_to_be_true}`,
          '',
        ]
      : []),
    ...(Array.isArray(p.conditions) && p.conditions.length
      ? [
          '## 6. Conditions for Approval',
          '',
          ...p.conditions.map((c) => `- [ ] ${c}`),
          '',
        ]
      : []),
    ...(Array.isArray(p.amendments) && p.amendments.length
      ? [
          '## 7. Adopted & Considered Amendments',
          '',
          ...p.amendments.map(
            (a) => `- **${a.adopted ? 'ADOPTED' : 'REJECTED'}** (${a.seat}): ${a.amendment}${a.reason ? ` — _${a.reason}_` : ''}`
          ),
          '',
        ]
      : []),
    ...(p.cheapest_test || p.kill_criteria
      ? [
          '## 8. Verification & Kill Criteria',
          '',
          p.cheapest_test ? `- **Cheapest Test**: ${p.cheapest_test}` : '',
          p.kill_criteria ? `- **Kill Criteria**: ${p.kill_criteria}` : '',
          p.revisit ? `- **Revisit When**: ${p.revisit}` : '',
          '',
        ]
      : []),
    ...(Array.isArray(p.tasks) && p.tasks.length
      ? [
          '## 9. Planned Tasks',
          '',
          '| # | Task | Check Command | Gate | Assignee |',
          '|---|---|---|---|---|',
          ...p.tasks.map(
            (t, idx) =>
              `| ${idx + 1} | ${escapePipe(t.title)} | \`${escapePipe(t.checkCommand ?? '')}\` | ${escapePipe(t.gate ?? '')} | ${t.assigneeId ?? '—'} |`
          ),
          '',
        ]
      : []),
    '## Links',
    '',
    `- Job: myaos://jobs/${job.id}`,
    `- Council: myaos://jobs/${job.id}/councils/${council.id}`,
    '',
  ];
  return `${lines.filter((line) => line !== '').join('\n')}\n`;
}

function renderShippedJobProposal(job: T.JobDetail, room: T.Room, project: T.Project | null): string {
  const p = (job.shipPayload ?? {}) as Record<string, unknown>;
  const lines: string[] = [
    '---',
    `proposal_id: job-${job.number}-shipped`,
    `job_id: ${job.id}`,
    `job_number: ${job.number}`,
    `title: ${JSON.stringify(`Shipped: JOB-${job.number} — ${job.title}`)}`,
    `room: ${room.name}`,
    `project: ${project?.name ?? 'unknown'}`,
    `stage: ${job.stage}`,
    `ship_status: ${job.shipStatus ?? 'shipped'}`,
    `ship_sha: ${job.shipSha ?? 'unknown'}`,
    `shipped_at: ${String(p.shippedAt ?? job.updatedAt)}`,
    'source: myaos-runtime',
    '---',
    '',
    `# Shipped: JOB-${job.number} — ${job.title}`,
    '',
    `> **Status**: **${String(job.shipStatus ?? 'SHIPPED').toUpperCase()}**  `,
    `> **Commit SHA**: \`${job.shipSha ?? 'unknown'}\`  `,
    `> **Target Branch**: \`${String(p.targetBranch ?? 'main')}\`  `,
    `> **Strategy**: \`${String(p.strategy ?? 'merge')}\`  `,
    `> **Shipped By**: ${String(p.shippedBy ?? 'runtime')}  `,
    `> **Shipped At**: \`${String(p.shippedAt ?? job.updatedAt)}\`  `,
    '',
    '## Brief',
    '',
    job.brief || '_(no brief)_',
    '',
    '## Accepted Plan',
    '',
    job.plan?.summary || '_No plan record._',
    job.plan?.chosen ? `\nChosen Option: **${job.plan.chosen}**` : '',
    '',
    '## Acceptance Criteria',
    '',
    ...(job.criteria.length
      ? job.criteria.map((c) => `- [x] [${c.evidenceClass}] ${c.text}`)
      : ['_No criteria recorded._']),
    '',
    '## Completed Tasks',
    '',
    ...(job.tasks.length
      ? [
          '| # | Task | Assignee | Check | Status |',
          '|---|---|---|---|---|',
          ...job.tasks.map(
            (t) =>
              `| ${t.planTaskId ?? t.position ?? ''} | ${escapePipe(t.title)} | ${t.assigneeId ?? '—'} | \`${escapePipe(t.checkCommand ?? '')}\` | ${t.status} |`
          ),
        ]
      : ['_No tasks._']),
    '',
    '## Verified Evidence',
    '',
    ...(job.evidence.length
      ? job.evidence
          .slice()
          .reverse()
          .map(
            (e) =>
              `- \`${e.createdAt}\` **[${e.class}]** ${e.kind} — ${e.summary} _(by ${e.recordedBy})_${e.command ? `\n  \`${e.command}\`${e.exitCode == null ? '' : ` → exit ${e.exitCode}`}` : ''}`
          )
      : ['_No evidence recorded._']),
    '',
    '## Links',
    '',
    `- Job: myaos://jobs/${job.id}`,
    project ? `- Project: ${project.name}` : '',
    `- Thread: community/threads/desktop/JOB-${job.number}-${slugify(job.title)}.md`,
    '',
  ];
  return `${lines.filter((line) => line !== '').join('\n')}\n`;
}
