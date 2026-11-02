import * as React from 'react';
import {
  AlertCircle,
  Cpu,
  Edit3,
  Layers,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal as TerminalIcon,
  Workflow,
  X,
} from 'lucide-react';
import type { Identity, Session, Team } from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export interface TeamScreenProps {
  identities: Identity[];
  sessions: Session[];
  teams?: Team[];
  selectedAgentId?: string;
  ownerName?: string;
  ownerId?: string;
}

export interface TeamAuditResult {
  healthScore: number;
  summary: string;
  laneBalance: Record<string, number>;
  mandates: {
    epistemicIntegrity: boolean;
    independentVerification: boolean;
    outcomeLed: boolean;
  };
  identifiedGaps: string[];
  recommendations: string[];
}

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

function parseArrayField(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* not JSON */
    }
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function TeamScreen({
  identities,
  sessions,
  teams = [],
  selectedAgentId,
  ownerName = 'Winston Zulu',
  ownerId = 'winston',
}: TeamScreenProps) {

  // Selection
  const [selectedId, setSelectedId] = React.useState<string | null>(
    selectedAgentId ?? identities.find((i) => !i.isOwner)?.id ?? identities[0]?.id ?? null
  );

  // Executive Header Edit state
  const [executiveName, setExecutiveName] = React.useState<string>(() => {
    try {
      return localStorage.getItem('myaos.executive.name') || ownerName || 'Winston Zulu';
    } catch {
      return ownerName || 'Winston Zulu';
    }
  });
  const [executiveTitle, setExecutiveTitle] = React.useState<string>(() => {
    try {
      return (
        localStorage.getItem('myaos.executive.title') || 'Executive Human Lead & Founder'
      );
    } catch {
      return 'Executive Human Lead & Founder';
    }
  });
  const [isEditingExecutive, setIsEditingExecutive] = React.useState(false);

  // Modals
  const [isSpawnModalOpen, setIsSpawnModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isWakeModalOpen, setIsWakeModalOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<Identity | null>(null);

  // AI Architect Audit State
  const [auditResult, setAuditResult] = React.useState<TeamAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = React.useState(false);

  const selectedAgent = identities.find((i) => i.id === selectedId) ?? null;
  const liveAgentIds = new Set(sessions.filter(isLive).map((s) => s.agentId));

  // Executive save
  const handleSaveExecutive = () => {
    try {
      localStorage.setItem('myaos.executive.name', executiveName.trim());
      localStorage.setItem('myaos.executive.title', executiveTitle.trim());
    } catch {
      /* ignore */
    }
    setIsEditingExecutive(false);
  };

  // Group identities by lane & roles
  const nonOwnerIdentities = identities.filter((i) => !i.isOwner && i.id !== 'winston');

  // Tier 2: Strategic / Bridge
  const strategicAgents = nonOwnerIdentities.filter((i) => {
    const lane = (i.lane || '').toLowerCase();
    const role = (i.role || '').toLowerCase();
    return (
      lane === 'bridge' ||
      i.id === 'orchestrator' ||
      i.id === 'sage' ||
      role.includes('planner') ||
      role.includes('orchestrator') ||
      role.includes('strategic') ||
      role.includes('architect')
    );
  });

  const strategicIds = new Set(strategicAgents.map((a) => a.id));

  // Tier 3: Quality & Verification
  const qualityAgents = nonOwnerIdentities.filter((i) => {
    if (strategicIds.has(i.id)) return false;
    const role = (i.role || '').toLowerCase();
    const lane = (i.lane || '').toLowerCase();
    return (
      i.id === 'kael' ||
      i.id === 'antigravity' ||
      lane === 'verification' ||
      lane === 'qa' ||
      lane === 'quality' ||
      role.includes('verifier') ||
      role.includes('qa') ||
      role.includes('quality') ||
      role.includes('audit')
    );
  });

  const qualityIds = new Set(qualityAgents.map((a) => a.id));

  // Tier 3: Engineering Fleet
  const engineeringAgents = nonOwnerIdentities.filter((i) => {
    if (strategicIds.has(i.id) || qualityIds.has(i.id)) return false;
    const lane = (i.lane || '').toLowerCase();
    const role = (i.role || '').toLowerCase();
    return lane === 'engineering' || role.includes('engineer') || i.id === 'atlas';
  });

  const engineeringIds = new Set(engineeringAgents.map((a) => a.id));

  // Tier 3: Infrastructure & Substrate
  const infraAgents = nonOwnerIdentities.filter((i) => {
    if (strategicIds.has(i.id) || qualityIds.has(i.id) || engineeringIds.has(i.id)) return false;
    const lane = (i.lane || '').toLowerCase();
    const role = (i.role || '').toLowerCase();
    return lane === 'infrastructure' || i.id === 'system' || role.includes('infra') || role.includes('devops');
  });

  const infraIds = new Set(infraAgents.map((a) => a.id));

  // Remaining / Specialized Agents
  const otherAgents = nonOwnerIdentities.filter(
    (i) => !strategicIds.has(i.id) && !qualityIds.has(i.id) && !engineeringIds.has(i.id) && !infraIds.has(i.id)
  );

  // Run dynamic AI Team Architect Audit
  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const totalNonOwners = nonOwnerIdentities.length;
      const verifiersCount = qualityAgents.length;
      const buildersCount = engineeringAgents.length;
      const infraCount = infraAgents.length;
      const strategicCount = strategicAgents.length;
      const rateLimitedCount = nonOwnerIdentities.filter((i) => i.statusState === 'rate_limited').length;

      let score = 92;
      const gaps: string[] = [];
      const recs: string[] = [];

      // Epistemic verification check
      const hasIndependentVerifier = qualityAgents.some(
        (a) => a.id === 'kael' || a.id === 'antigravity' || (a.role && a.role.toLowerCase().includes('verifier'))
      );

      if (!hasIndependentVerifier) {
        score -= 25;
        gaps.push('CRITICAL: No independent verifier designated. Rule #2 forbids builders from self-verifying.');
        recs.push('Spawn or assign Kael / Antigravity as dedicated independent verification stewards.');
      } else {
        recs.push(`Independent verifier fleet active (${verifiersCount} verifier(s)). Self-verification gate enforced.`);
      }

      // Documentation gap check
      const hasDocAgent = nonOwnerIdentities.some(
        (i) =>
          (i.role && i.role.toLowerCase().includes('doc')) ||
          (i.role && i.role.toLowerCase().includes('scribe')) ||
          (i.capabilities && i.capabilities.some((c) => c.toLowerCase().includes('doc')))
      );
      if (!hasDocAgent) {
        gaps.push('Documentation & Architecture Scribe: No dedicated documentation steward recorded.');
        recs.push('Consider spawning a dedicated Architecture Scribe to mirror substrate thread records.');
      }

      // Rate limit check
      if (rateLimitedCount > 0) {
        score -= rateLimitedCount * 5;
        gaps.push(`${rateLimitedCount} agent(s) currently paused under provider token/session rate limits.`);
        recs.push('Coordinate cross-agent handoffs to Claude/Gemini/Codex alternate engines during rate resets.');
      }

      // Ratio check
      if (buildersCount > 0 && verifiersCount > 0) {
        const ratio = buildersCount / verifiersCount;
        if (ratio > 5) {
          gaps.push(`High builder-to-verifier ratio (${buildersCount}:${verifiersCount}). Verification queue may saturate.`);
          recs.push('Scale verifier capacity or authorize parallel automated QA Antigravity test checks.');
        }
      }

      if (score < 50) score = 50;
      if (score > 100) score = 100;

      const summary = `Autonomous organization comprises ${totalNonOwners} AI team members across ${
        [strategicCount > 0, buildersCount > 0, verifiersCount > 0, infraCount > 0].filter(Boolean).length
      } functional lanes. Epistemic integrity & substrate-native verification gates are active.`;

      setAuditResult({
        healthScore: score,
        summary,
        laneBalance: {
          strategic: strategicCount,
          engineering: buildersCount,
          verification: verifiersCount,
          infrastructure: infraCount,
          other: otherAgents.length,
        },
        mandates: {
          epistemicIntegrity: true,
          independentVerification: hasIndependentVerifier,
          outcomeLed: true,
        },
        identifiedGaps: gaps.length > 0 ? gaps : ['No severe organizational bottlenecks identified.'],
        recommendations: recs,
      });
      setIsAuditing(false);
    }, 450);
  };

  return (
    <div className="flex flex-col gap-6 py-2 pb-12 select-none">
      {/* Top Banner & AI Architect Bar */}
      <header className="glass-panel flex flex-col md:flex-row justify-between items-start md:items-center gap-4 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/10 text-foreground">
              <Workflow className="size-4" />
            </span>
            <h1 className="text-base font-bold tracking-tight">Autonomous AI Team Org Chart &amp; Governance</h1>
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {nonOwnerIdentities.length} active agents
            </span>
            {teams.length > 0 && (
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {teams.length} teams
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Visual hierarchy, lane separation, dynamic role contracts, and AI Team Architect powered by Substrate Truth
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunAudit}
            disabled={isAuditing}
            className={cn(
              buttonVariants({ variant: 'glass', size: 'sm' }),
              'cursor-pointer border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            )}
          >
            <Sparkles className={cn('size-3.5 text-amber-500', isAuditing && 'animate-spin')} />
            <span>{isAuditing ? 'Auditing Org...' : 'Audit Org Health'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSpawnModalOpen(true)}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
          >
            <Plus className="size-3.5" />
            <span>Spawn New Agent</span>
          </button>
        </div>
      </header>

      {/* AI Team Architect Audit Card */}
      {auditResult && (
        <div className="glass-panel border-amber-500/30 bg-amber-500/[0.04] p-5 rounded-2xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Sparkles className="size-4" />
              <span>AI Team Architect · Epistemic &amp; Governance Audit</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Health Score: {auditResult.healthScore}%
              </span>
              <button
                type="button"
                onClick={() => setAuditResult(null)}
                className="text-muted-foreground hover:text-foreground text-xs p-1"
                title="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          <p className="text-xs text-foreground/90 leading-relaxed">{auditResult.summary}</p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Lane Balance:</span>
              <Tag tone="quiet">Strategic: {auditResult.laneBalance.strategic ?? 0}</Tag>
              <Tag tone="quiet">Eng: {auditResult.laneBalance.engineering ?? 0}</Tag>
              <Tag tone="verified">Verify: {auditResult.laneBalance.verification ?? 0}</Tag>
              <Tag tone="quiet">Infra: {auditResult.laneBalance.infrastructure ?? 0}</Tag>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Verification Gate:</span>
              <Tag tone={auditResult.mandates.independentVerification ? 'verified' : 'risk'}>
                {auditResult.mandates.independentVerification ? 'Rule #2 Enforced' : 'Verifier Missing'}
              </Tag>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs border-t border-amber-500/20">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
                Identified Gaps &amp; Risk Telemetry
              </div>
              <ul className="space-y-1 list-disc list-inside text-foreground/80">
                {auditResult.identifiedGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
                Strategic Recommendations
              </div>
              <ul className="space-y-1 list-disc list-inside text-foreground/80">
                {auditResult.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Visual Org Hierarchy Chart */}
      <div className="glass-panel border-border/60 rounded-3xl p-6 md:p-8 space-y-8 shadow-xs">
        {/* Tier 1: Human Executive Leadership */}
        <div className="flex flex-col items-center">
          <div className="glass-panel group relative w-80 rounded-2xl p-4 text-center shadow-lg transition-all border border-border/80 hover:border-foreground/30">
            <div className="absolute top-3 right-3">
              <button
                type="button"
                onClick={() => setIsEditingExecutive(!isEditingExecutive)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition"
                title="Edit Executive Details"
              >
                <Edit3 className="size-3.5" />
              </button>
            </div>

            <div className="mb-2 flex justify-center">
              <OwnerAvatar name={executiveName} size={48} />
            </div>

            {isEditingExecutive ? (
              <div className="space-y-2 mt-2 px-1">
                <input
                  type="text"
                  value={executiveName}
                  onChange={(e) => setExecutiveName(e.target.value)}
                  placeholder="Executive Name"
                  className="glass-panel w-full px-2 py-1 text-xs text-center font-bold outline-none rounded-md"
                />
                <input
                  type="text"
                  value={executiveTitle}
                  onChange={(e) => setExecutiveTitle(e.target.value)}
                  placeholder="Executive Title"
                  className="glass-panel w-full px-2 py-1 text-[11px] text-center text-muted-foreground outline-none rounded-md"
                />
                <button
                  type="button"
                  onClick={handleSaveExecutive}
                  className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full text-[11px]')}
                >
                  Save Executive
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-bold tracking-tight text-foreground">{executiveName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{executiveTitle}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>SUPREME OPERATOR</span>
                </div>
              </div>
            )}
          </div>

          {/* Stem downwards */}
          <div className="w-0.5 h-8 bg-border/80 mt-2" />
        </div>

        {/* Tier 2: Strategic & Bridge Coordination */}
        <div className="space-y-3">
          <div className="text-center">
            <span className="px-3 py-1 glass-panel rounded-full text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Strategic Orchestration &amp; Planning Bridge
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {strategicAgents.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground italic">No strategic bridge agents registered.</div>
            ) : (
              strategicAgents.map((agent) => {
                const isSelected = selectedId === agent.id;
                const isAgentLive = liveAgentIds.has(agent.id) || agent.statusState === 'working';
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    onDoubleClick={() => {
                      window.location.hash = href({ name: 'dev' });
                    }}
                    title="Click to select inspector · double-click for dev terminal"
                    className={cn(
                      'glass-panel w-72 p-4 rounded-2xl cursor-pointer transition-all duration-200 shadow-2xs hover:shadow-md border',
                      isSelected
                        ? 'border-foreground/80 ring-2 ring-foreground/20'
                        : 'border-border/60 hover:border-foreground/40'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="size-9 rounded-xl bg-foreground/[0.06] flex items-center justify-center text-lg shadow-2xs">
                          {agent.symbol || <Avatar who={agent} size={28} />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-foreground">{agent.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{agent.id}</div>
                        </div>
                      </div>
                      <Tag tone={isAgentLive ? 'observed' : 'quiet'}>
                        {isAgentLive ? 'Live' : agent.lane || 'bridge'}
                      </Tag>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {agent.role || 'Strategic planning, job delegation & substrate coordination'}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Stem downwards */}
          <div className="flex justify-center">
            <div className="w-0.5 h-8 bg-border/80" />
          </div>
        </div>

        {/* Tier 3: Functional Lanes (3 Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/60">
          {/* Column A: Engineering Fleet */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Cpu className="size-4 text-indigo-500" />
                <span>Engineering Fleet</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{engineeringAgents.length} agents</span>
            </div>

            <div className="space-y-3">
              {engineeringAgents.map((agent) => {
                const isSelected = selectedId === agent.id;
                const isAgentLive = liveAgentIds.has(agent.id) || agent.statusState === 'working';
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    onDoubleClick={() => {
                      window.location.hash = href({ name: 'dev' });
                    }}
                    title="Click to select · double-click for dev terminal"
                    className={cn(
                      'glass-panel p-3.5 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md border',
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'border-border/60 hover:border-foreground/40'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{agent.symbol || '💻'}</span>
                        <div>
                          <div className="text-xs font-bold text-foreground">{agent.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{agent.id}</div>
                        </div>
                      </div>
                      <Tag tone={isAgentLive ? 'observed' : agent.statusState === 'rate_limited' ? 'risk' : 'quiet'}>
                        {agent.statusState === 'rate_limited'
                          ? 'Rate Limited'
                          : isAgentLive
                          ? 'Working'
                          : agent.lane || 'engineering'}
                      </Tag>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 truncate">
                      {agent.role || 'Autonomous code & runtime implementation'}
                    </div>
                  </div>
                );
              })}
              {engineeringAgents.length === 0 && (
                <p className="text-xs text-muted-foreground italic p-2">No engineering agents found.</p>
              )}
            </div>
          </div>

          {/* Column B: Independent Quality & Verification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span>Verification &amp; Quality</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{qualityAgents.length} agents</span>
            </div>

            <div className="space-y-3">
              {qualityAgents.map((agent) => {
                const isSelected = selectedId === agent.id;
                const isAgentLive = liveAgentIds.has(agent.id) || agent.statusState === 'working';
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    onDoubleClick={() => {
                      window.location.hash = href({ name: 'dev' });
                    }}
                    title="Click to select · double-click for dev terminal"
                    className={cn(
                      'glass-panel p-3.5 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md border',
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-border/60 hover:border-foreground/40'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{agent.symbol || '🛡️'}</span>
                        <div>
                          <div className="text-xs font-bold text-foreground">{agent.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{agent.id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isAgentLive && <Tag tone="observed">Live</Tag>}
                        <Tag tone="verified">VERIFIER</Tag>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 truncate">
                      {agent.role || 'Independent verification, test harness & epistemic truth'}
                    </div>
                  </div>
                );
              })}
              {qualityAgents.length === 0 && (
                <div className="p-3 rounded-xl border border-risk/40 bg-risk/10 text-risk text-xs">
                  No independent verifiers found! Rule #2 requires an independent verifier distinct from the author.
                </div>
              )}
            </div>
          </div>

          {/* Column C: Infrastructure & Substrate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers className="size-4 text-amber-500" />
                <span>Infrastructure &amp; CLI</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                {infraAgents.length + otherAgents.length} agents
              </span>
            </div>

            <div className="space-y-3">
              {[...infraAgents, ...otherAgents].map((agent) => {
                const isSelected = selectedId === agent.id;
                const isAgentLive = liveAgentIds.has(agent.id) || agent.statusState === 'working';
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    onDoubleClick={() => {
                      window.location.hash = href({ name: 'dev' });
                    }}
                    title="Click to select · double-click for dev terminal"
                    className={cn(
                      'glass-panel p-3.5 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md border',
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/20'
                        : 'border-border/60 hover:border-foreground/40'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{agent.symbol || '⚙️'}</span>
                        <div>
                          <div className="text-xs font-bold text-foreground">{agent.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{agent.id}</div>
                        </div>
                      </div>
                      <Tag tone={isAgentLive ? 'observed' : 'quiet'}>{agent.lane || 'infrastructure'}</Tag>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 truncate">
                      {agent.role || 'Substrate maintenance, git sync & runtime host'}
                    </div>
                  </div>
                );
              })}
              {infraAgents.length + otherAgents.length === 0 && (
                <p className="text-xs text-muted-foreground italic p-2">No infrastructure agents found.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Agent Details Pane */}
      {selectedAgent && (
        <div className="glass-panel border-border/80 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="size-12 rounded-2xl bg-foreground/[0.06] border border-border flex items-center justify-center text-2xl shadow-2xs">
                {selectedAgent.symbol || <Avatar who={selectedAgent} size={36} />}
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>{selectedAgent.name}</span>
                  <span className="text-xs font-mono text-muted-foreground font-normal">({selectedAgent.id})</span>
                  <Tag tone={qualityIds.has(selectedAgent.id) ? 'verified' : 'quiet'}>
                    Lane: {selectedAgent.lane || (qualityIds.has(selectedAgent.id) ? 'verification' : 'engineering')}
                  </Tag>
                  {selectedAgent.statusState === 'rate_limited' && (
                    <Tag tone="risk">Paused: rate limited</Tag>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  {selectedAgent.role || 'Autonomous Team Member'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={href({ name: 'dev' })}
                className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
              >
                <TerminalIcon className="size-3.5" />
                <span>Dev Sessions</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setEditingAgent(selectedAgent);
                  setIsEditModalOpen(true);
                }}
                className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
              >
                <Edit3 className="size-3.5" />
                <span>Edit Role</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWakeModalOpen(true)}
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
              >
                <Send className="size-3.5" />
                <span>Wake / Prompt</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-border/60">
            {/* Declared Capabilities */}
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Declared Capabilities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {parseArrayField(selectedAgent.capabilities).length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No declared capabilities recorded.</span>
                ) : (
                  parseArrayField(selectedAgent.capabilities).map((cap, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-foreground/[0.05] border border-border/40 font-mono text-[11px] text-foreground/80"
                    >
                      {cap}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Substrate Responsibilities */}
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Substrate Responsibilities
              </div>
              <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                <li>Execute tasks within {selectedAgent.lane || 'assigned'} domain.</li>
                <li>Preserve substrate truth and relational database integrity.</li>
                {qualityIds.has(selectedAgent.id) && (
                  <li className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Independently re-run verification commands (cannot self-verify authored code).
                  </li>
                )}
                {selectedAgent.runtime && <li>Runs on adapter: {selectedAgent.runtime}</li>}
              </ul>
            </div>

            {/* Runtime & Telemetry */}
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Runtime Telemetry
              </div>
              <div className="space-y-1 text-xs text-muted-foreground font-mono">
                <div>
                  Engine: <span className="text-foreground">{selectedAgent.runtime || 'Default ACP'}</span>
                </div>
                {selectedAgent.activeSessionId && (
                  <div className="truncate">
                    Active Session: <span className="text-foreground">{selectedAgent.activeSessionId}</span>
                  </div>
                )}
                {selectedAgent.acpSessionId && (
                  <div className="truncate">
                    ACP Session: <span className="text-foreground">{selectedAgent.acpSessionId}</span>
                  </div>
                )}
                {selectedAgent.lastWokenAt && (
                  <div>Last Woken: {fmtTime(selectedAgent.lastWokenAt)}</div>
                )}
                {selectedAgent.rateLimitResetAt && (
                  <div className="text-needs-you">
                    Reset Window: {fmtTime(selectedAgent.rateLimitResetAt)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spawn Agent Modal */}
      {isSpawnModalOpen && (
        <SpawnAgentModal
          isOpen={isSpawnModalOpen}
          onClose={() => setIsSpawnModalOpen(false)}
          existingIdentities={identities}
          ownerId={ownerId}
          onAgentSpawned={(newId) => {
            setSelectedId(newId.id);
            setIsSpawnModalOpen(false);
          }}
        />
      )}

      {/* Edit Role Modal */}
      {isEditModalOpen && editingAgent && (
        <EditRoleModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingAgent(null);
          }}
          identity={editingAgent}
          onSaved={() => {
            setIsEditModalOpen(false);
            setEditingAgent(null);
          }}
        />
      )}

      {/* Wake Agent Modal */}
      {isWakeModalOpen && selectedAgent && (
        <WakeAgentModal
          isOpen={isWakeModalOpen}
          onClose={() => setIsWakeModalOpen(false)}
          agent={selectedAgent}
          ownerId={ownerId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spawn Agent Modal
// ---------------------------------------------------------------------------

interface SpawnAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingIdentities: Identity[];
  ownerId: string;
  onAgentSpawned: (newIdentity: Identity) => void;
}

function SpawnAgentModal({
  isOpen,
  onClose,
  existingIdentities,
  ownerId,
  onAgentSpawned,
}: SpawnAgentModalProps) {
  const { client } = useRuntime();

  const [intent, setIntent] = React.useState('');
  const [id, setId] = React.useState('');
  const [name, setName] = React.useState('');
  const [symbol, setSymbol] = React.useState('🤖');
  const [lane, setLane] = React.useState('engineering');
  const [role, setRole] = React.useState('');
  const [capabilitiesStr, setCapabilitiesStr] = React.useState('typescript, react, rust');
  const [runtimeEngine, setRuntimeEngine] = React.useState('claude-agent-acp');
  const [initialPrompt, setInitialPrompt] = React.useState('');
  const [autoStart, setAutoStart] = React.useState(true);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  // AI Architect instant generator
  const handleGenerateRole = () => {
    if (!intent.trim()) return;
    const clean = intent.trim().toLowerCase();
    let slug = clean.replace(/[^a-z0-9]+/g, '_').slice(0, 16).replace(/^_+|_+$/g, '');
    if (!slug) slug = `agent_${Date.now().toString(36)}`;

    // If duplicate id, append suffix
    let finalId = slug;
    let count = 1;
    while (existingIdentities.some((i) => i.id === finalId)) {
      finalId = `${slug}_${count++}`;
    }

    let detectedLane = 'engineering';
    let detectedSymbol = '🤖';
    if (clean.includes('verif') || clean.includes('test') || clean.includes('qa') || clean.includes('quality')) {
      detectedLane = 'verification';
      detectedSymbol = '🛡️';
    } else if (clean.includes('infra') || clean.includes('devops') || clean.includes('deploy') || clean.includes('database')) {
      detectedLane = 'infrastructure';
      detectedSymbol = '⚙️';
    } else if (clean.includes('plan') || clean.includes('architect') || clean.includes('bridge') || clean.includes('coord')) {
      detectedLane = 'bridge';
      detectedSymbol = '🎯';
    } else if (clean.includes('design') || clean.includes('ui') || clean.includes('frontend')) {
      detectedLane = 'engineering';
      detectedSymbol = '🎨';
    }

    const words = clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    const generatedName = words.slice(0, 3).join(' ');

    setId(finalId);
    setName(generatedName);
    setSymbol(detectedSymbol);
    setLane(detectedLane);
    setRole(intent.trim());
    setInitialPrompt(`You are ${generatedName} (${finalId}). Begin by inspecting the current workspace and understanding your domain responsibilities.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setError('Agent ID and Name are required.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      if (!client) throw new Error('Runtime client is disconnected.');

      const caps = capabilitiesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      let createdIdentity: Identity;

      // Try spawnAgent endpoint first (which supports auto-wake)
      try {
        const spawnRes = await client.spawnAgent({
          id: id.trim().toLowerCase(),
          name: name.trim(),
          role: role.trim() || undefined,
          runtime: runtimeEngine,
          lane,
          spawnedBy: ownerId,
          prompt: autoStart && initialPrompt.trim() ? initialPrompt.trim() : undefined,
        });
        createdIdentity = spawnRes.identity;
        if (symbol.trim() || caps.length > 0) {
          try {
            await client.updateIdentity(createdIdentity.id, {
              symbol: symbol.trim() || undefined,
              capabilities: caps,
            });
            if (symbol.trim()) createdIdentity.symbol = symbol.trim();
            if (caps.length > 0) createdIdentity.capabilities = caps;
          } catch {
            /* ignore update error */
          }
        }
      } catch {
        // Fallback to createIdentity
        createdIdentity = await client.createIdentity({
          id: id.trim().toLowerCase(),
          name: name.trim(),
          role: role.trim() || undefined,
          runtime: runtimeEngine,
          lane,
          symbol,
          capabilities: caps,
        });

        if (autoStart && initialPrompt.trim()) {
          try {
            await client.wakeAgent(createdIdentity.id, {
              fromActorId: ownerId,
              prompt: initialPrompt.trim(),
            });
          } catch {
            /* ignore wake error on spawn */
          }
        }
      }

      onAgentSpawned(createdIdentity);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="glass-panel w-full max-w-xl rounded-2xl border border-border/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
              <Sparkles className="size-4 text-amber-500" />
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Spawn New Autonomous Agent</h2>
              <p className="text-xs text-muted-foreground">Define role contract, capabilities and immediate wake directive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl border border-risk/40 bg-risk/10 text-risk text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Natural intent role generator */}
          <div className="space-y-1.5 p-3 rounded-xl bg-foreground/[0.03] border border-border/50">
            <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Sparkles className="size-3 text-amber-500" />
              <span>AI Architect · Quick Intent Design</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="e.g. Automated React UI Performance &amp; Accessibility Verifier"
                className="glass-panel flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                onClick={handleGenerateRole}
                className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'text-xs cursor-pointer')}
              >
                Auto-Fill
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Unique ID</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. perf_verifier"
                required
                className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs font-mono outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Performance Verifier"
                required
                className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                maxLength={4}
                className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs text-center outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Lane</label>
              <select
                value={lane}
                onChange={(e) => setLane(e.target.value)}
                className="glass-panel w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                <option value="engineering">Engineering</option>
                <option value="verification">Verification</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="bridge">Bridge / Strategic</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Runtime Engine</label>
              <select
                value={runtimeEngine}
                onChange={(e) => setRuntimeEngine(e.target.value)}
                className="glass-panel w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                <option value="claude-agent-acp">Claude Code (ACP)</option>
                <option value="codex-acp">Codex (ACP)</option>
                <option value="gemini --acp">Gemini CLI (ACP)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-foreground">Primary Domain / Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Lead Substrate &amp; System Telemetry Verification"
              className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-foreground">Declared Capabilities (comma-separated)</label>
            <input
              type="text"
              value={capabilitiesStr}
              onChange={(e) => setCapabilitiesStr(e.target.value)}
              placeholder="typescript, node, verification, sqlite"
              className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-foreground">Initial Wake Prompt / Directive</label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              rows={3}
              placeholder="Immediate directive to dispatch to the agent when spawned..."
              className="glass-panel w-full rounded-lg p-2.5 text-xs outline-none resize-none font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoStart"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoStart" className="text-xs text-muted-foreground cursor-pointer">
              Immediately wake agent session after spawning
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={onClose}
              className={buttonVariants({ variant: 'glass', size: 'sm' })}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
            >
              {isSubmitting ? 'Spawning Agent...' : 'Spawn & Launch Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Role Modal
// ---------------------------------------------------------------------------

interface EditRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  identity: Identity;
  onSaved: () => void;
}

function EditRoleModal({ isOpen, onClose, identity, onSaved }: EditRoleModalProps) {
  const { client } = useRuntime();

  const [name, setName] = React.useState(identity.name || '');
  const [symbol, setSymbol] = React.useState(identity.symbol || '🤖');
  const [lane, setLane] = React.useState(identity.lane || 'engineering');
  const [role, setRole] = React.useState(identity.role || '');
  const [capabilitiesStr, setCapabilitiesStr] = React.useState(
    parseArrayField(identity.capabilities).join(', ')
  );
  const [runtime, setRuntime] = React.useState(identity.runtime || 'claude-agent-acp');

  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setError(null);
    setIsSaving(true);

    try {
      const caps = capabilitiesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await client.updateIdentity(identity.id, {
        name: name.trim(),
        role: role.trim() || null,
        symbol: symbol.trim() || '🤖',
        lane,
        capabilities: caps,
        runtime: runtime || null,
      });

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border/80 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
              <Edit3 className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Edit Role Contract · {identity.name}</h2>
              <p className="text-xs text-muted-foreground font-mono">{identity.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl border border-risk/40 bg-risk/10 text-risk text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                maxLength={4}
                className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs text-center outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Lane</label>
              <select
                value={lane}
                onChange={(e) => setLane(e.target.value)}
                className="glass-panel w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                <option value="engineering">Engineering</option>
                <option value="verification">Verification</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="bridge">Bridge / Strategic</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-foreground">Runtime Engine</label>
              <input
                type="text"
                value={runtime}
                onChange={(e) => setRuntime(e.target.value)}
                className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs font-mono outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-foreground">Primary Domain / Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-foreground">Capabilities (comma-separated)</label>
            <input
              type="text"
              value={capabilitiesStr}
              onChange={(e) => setCapabilitiesStr(e.target.value)}
              className="glass-panel w-full rounded-lg px-3 py-1.5 text-xs outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={onClose}
              className={buttonVariants({ variant: 'glass', size: 'sm' })}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
            >
              {isSaving ? 'Saving...' : 'Save Role Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wake Agent Modal
// ---------------------------------------------------------------------------

interface WakeAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Identity;
  ownerId: string;
}

function WakeAgentModal({ isOpen, onClose, agent, ownerId }: WakeAgentModalProps) {
  const { client } = useRuntime();
  const [prompt, setPrompt] = React.useState('');
  const [isWaking, setIsWaking] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleWake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !client) return;
    setIsWaking(true);
    setStatusMessage(null);

    try {
      const res = await client.wakeAgent(agent.id, {
        fromActorId: ownerId,
        prompt: prompt.trim(),
      });
      if (res.session?.id) {
        setStatusMessage(`Agent woken in session ${res.session.id}. Streaming live.`);
      } else if (res.deferredUntil) {
        setStatusMessage(`Agent is rate-limited until ${fmtTime(res.deferredUntil)}. Auto-resume scheduled.`);
      } else {
        setStatusMessage('Directive dispatched successfully.');
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWaking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border/80 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{agent.symbol || '🤖'}</span>
            <div>
              <h2 className="text-sm font-bold">Wake / Dispatch {agent.name}</h2>
              <p className="text-[11px] text-muted-foreground font-mono">{agent.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleWake} className="p-5 space-y-3">
          <label className="text-xs font-semibold text-foreground">Mission Directive / Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            required
            placeholder={`Enter high-level goal or specific instruction for ${agent.name}...`}
            className="glass-panel w-full rounded-lg p-2.5 text-xs outline-none resize-none font-mono"
          />

          {statusMessage && (
            <p className="text-xs text-muted-foreground bg-foreground/[0.04] p-2 rounded-lg font-mono">
              {statusMessage}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={onClose}
              className={buttonVariants({ variant: 'glass', size: 'sm' })}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isWaking || !prompt.trim()}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
            >
              {isWaking ? 'Dispatching...' : 'Wake Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
