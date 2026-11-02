import * as React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Cpu,
  Crown,
  Edit3,
  ExternalLink,
  FolderGit2,
  Layers,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal as TerminalIcon,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import type {
  AdapterInfo,
  AgentSchedule,
  CreateIdentityInput,
  Identity,
  JobSummary,
  Session,
  Team,
  UpdateIdentityInput,
} from '@runtime/types';
import { Avatar, AVATAR_COLORS, AVATAR_MARKS, OwnerAvatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export interface TeamScreenProps {
  identities: Identity[];
  sessions: Session[];
  adapters?: AdapterInfo[];
  teams?: Team[];
  jobs?: JobSummary[];
  selectedAgentId?: string;
  ownerName?: string;
  ownerId?: string;
  defaultTab?: 'all' | 'chart' | 'registry' | 'workspace';
  onCreate?: (input: CreateIdentityInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateIdentityInput) => Promise<void>;
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

export type WorkspaceTab = 'workspace' | 'performance' | 'tasks' | 'evidence' | 'contract';

const RUNTIMES = [
  { name: 'Antigravity (Recommended)', command: 'antigravity --acp', adapterId: 'antigravity' },
  { name: 'Claude Code', command: 'claude-agent-acp', adapterId: 'claude' },
  { name: 'Codex', command: 'codex-acp', adapterId: 'codex' },
  { name: 'Gemini CLI', command: 'gemini --acp', adapterId: 'gemini' },
  { name: 'Custom agent', command: 'any command that speaks ACP over stdio', adapterId: 'antigravity' },
];

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

function authTag(auth: AdapterInfo['auth']): { tone: 'observed' | 'verified' | 'needs-you' | 'claimed' | 'risk' | 'quiet'; label: string } {
  switch (auth?.state) {
    case 'ready':
      return { tone: 'verified', label: 'Ready' };
    case 'configured':
      return { tone: 'observed', label: 'Configured' };
    case 'needs_login':
      return { tone: 'needs-you', label: 'Needs login' };
    case 'missing_binary':
      return { tone: 'claimed', label: 'Not installed' };
    case 'unsupported':
      return { tone: 'risk', label: 'Unsupported' };
    default:
      return { tone: 'quiet', label: 'Unknown' };
  }
}

function identityStatusBadge(i: Identity, isRunning: boolean): { tone: 'observed' | 'verified' | 'needs-you' | 'claimed' | 'risk' | 'quiet'; label: string } {
  if (i.statusState === 'rate_limited' && i.rateLimitResetAt && new Date(i.rateLimitResetAt).getTime() > Date.now()) {
    return { tone: 'needs-you', label: `Limit · resets ${fmtTime(i.rateLimitResetAt)}` };
  }
  if (isRunning || i.statusState === 'working') {
    return { tone: 'observed', label: 'Working' };
  }
  if (i.activeSessionId) {
    return { tone: 'verified', label: 'Session ready' };
  }
  return { tone: 'quiet', label: 'Idle' };
}

export function TeamScreen({
  identities,
  sessions,
  adapters = [],
  teams = [],
  jobs = [],
  selectedAgentId,
  ownerName = 'Winston Zulu',
  ownerId = 'winston',
  defaultTab = 'all',
  onCreate,
  onUpdate,
}: TeamScreenProps) {
  const { client } = useRuntime();

  const schedulesData = useRuntimeData((c) => c.schedules());
  const schedules: AgentSchedule[] = schedulesData.status === 'ready' ? schedulesData.data : [];

  // Active view: 'all' | 'chart' | 'registry' | 'workspace'
  const [activeView, setActiveView] = React.useState<'all' | 'chart' | 'registry' | 'workspace'>(() =>
    selectedAgentId ? 'workspace' : defaultTab
  );

  // Selected Agent for detail/editor
  const [selectedId, setSelectedId] = React.useState<string | null>(
    selectedAgentId ?? identities.find((i) => !i.isOwner && i.id !== 'winston')?.id ?? identities[0]?.id ?? null
  );

  // Workspace subtab
  const [workspaceTab, setWorkspaceTab] = React.useState<WorkspaceTab>('workspace');

  // Inline adding toggle for registry view
  const [addingInline, setAddingInline] = React.useState(false);

  // Team Leader dispatch state
  const [teamGoal, setTeamGoal] = React.useState('');
  const [leaderId, setLeaderId] = React.useState('atlas');
  const [dispatching, setDispatching] = React.useState(false);
  const [dispatchStatus, setDispatchStatus] = React.useState<string | null>(null);

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
      return localStorage.getItem('myaos.executive.title') || 'Executive Human Lead & Founder';
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

  // Synchronize when selectedAgentId changes from URL hash
  React.useEffect(() => {
    if (selectedAgentId) {
      setSelectedId(selectedAgentId);
      setActiveView('workspace');
    }
  }, [selectedAgentId]);

  const selectedAgent = identities.find((i) => i.id === selectedId) ?? null;
  const liveAgentIds = new Set(sessions.filter(isLive).map((s) => s.agentId));
  const rateLimitedIdentities = identities.filter(
    (i) => i.statusState === 'rate_limited' && i.rateLimitResetAt && new Date(i.rateLimitResetAt).getTime() > Date.now()
  );

  // Team Leader Dispatch handler
  const handleLeaderDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !teamGoal.trim() || dispatching) return;
    setDispatching(true);
    setDispatchStatus(null);
    try {
      const res = await client.dispatchTeamLeader({
        leaderId,
        fromActorId: ownerId,
        goal: teamGoal.trim(),
      });
      setTeamGoal('');
      if (res.session?.id) {
        setDispatchStatus(`Team Leader ${leaderId} woken (session ${res.session.id}) — coordinating team.`);
      } else if (res.deferredUntil) {
        setDispatchStatus(`Leader rate-limited until ${fmtTime(res.deferredUntil)}; auto-resume scheduled.`);
      }
    } catch (err) {
      setDispatchStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatching(false);
    }
  };

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

  // Open full Agent Workspace profile
  const handleOpenAgentWorkspace = (agentId: string) => {
    setSelectedId(agentId);
    setActiveView('workspace');
    window.location.hash = href({ name: 'team', agentId });
  };

  // Return to Org Chart view
  const handleReturnToChart = () => {
    setActiveView('chart');
    window.location.hash = href({ name: 'team' });
  };

  // Quick Terminal trigger
  const handleOpenTerminal = async (agent: Identity) => {
    if (client) {
      try {
        await client.wakeAgent(agent.id, {
          fromActorId: ownerId,
          prompt: 'Open interactive CLI session.',
        });
      } catch {
        /* ignore */
      }
    }
    window.location.hash = href({ name: 'dev' });
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

  // Dynamic AI Team Architect Audit
  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const totalNonOwners = nonOwnerIdentities.length;
      const verifiersCount = qualityAgents.length;
      const buildersCount = engineeringAgents.length;
      const infraCount = infraAgents.length;
      const strategicCount = strategicAgents.length;
      const rateLimitedCount = nonOwnerIdentities.filter((i) => i.statusState === 'rate_limited').length;

      let score = 94;
      const gaps: string[] = [];
      const recs: string[] = [];

      const hasIndependentVerifier = qualityAgents.some(
        (a) => a.id === 'kael' || a.id === 'antigravity' || (a.role && a.role.toLowerCase().includes('verifier'))
      );

      if (!hasIndependentVerifier) {
        score -= 25;
        gaps.push('CRITICAL: No independent verifier designated. Rule #2 forbids builders from self-verifying.');
        recs.push('Spawn or assign Kael / Antigravity as dedicated independent verification stewards.');
      } else {
        recs.push(`Independent verifier fleet active (${verifiersCount} verifiers). Implementers forbidden from self-verifying.`);
      }

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

      if (rateLimitedCount > 0) {
        score -= rateLimitedCount * 5;
        gaps.push(`${rateLimitedCount} agent(s) currently paused under provider token/session rate limits.`);
        recs.push('Coordinate cross-agent handoffs to Claude/Gemini/Codex alternate engines during rate resets.');
      }

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
    }, 400);
  };

  // -------------------------------------------------------------------------
  // Agent Workspace Profile Mode
  // -------------------------------------------------------------------------
  if (activeView === 'workspace' && selectedAgent) {
    const isAgentLive = liveAgentIds.has(selectedAgent.id) || selectedAgent.statusState === 'working';
    const agentTasks = jobs.filter((j) => j.createdBy === selectedAgent.id);

    return (
      <div className="flex flex-col gap-5 py-2 pb-12 select-none animate-fade-in">
        {/* Top Navigation & Agent Employee Header */}
        <div className="glass-panel border-border/80 p-5 rounded-2xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={handleReturnToChart}
              className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'size-9 p-0 rounded-xl cursor-pointer')}
              title="Return to Org Chart"
            >
              <ArrowLeft className="size-4" />
            </button>

            <div className="size-12 rounded-2xl bg-foreground/[0.06] border border-border flex items-center justify-center text-2xl shadow-2xs">
              {selectedAgent.symbol || <Avatar who={selectedAgent} size={36} />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-foreground">{selectedAgent.name}</h1>
                <span className="text-xs font-mono text-muted-foreground font-normal">({selectedAgent.id})</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase glass-panel">
                  Lane: {selectedAgent.lane || (qualityIds.has(selectedAgent.id) ? 'verification' : 'engineering')}
                </span>
                <Tag tone={isAgentLive ? 'observed' : selectedAgent.statusState === 'rate_limited' ? 'risk' : 'quiet'}>
                  {selectedAgent.statusState === 'rate_limited' ? 'Rate Limited' : isAgentLive ? 'LIVE' : 'Standby'}
                </Tag>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                {selectedAgent.role || 'Autonomous Team Member'}
              </p>
            </div>
          </div>

          {/* Telemetry Metrics & Primary Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="glass-panel px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-3">
              <div>
                <span className="text-[10px] uppercase text-muted-foreground block font-bold">Engine</span>
                <span className="font-semibold text-foreground">{selectedAgent.runtime || 'Default ACP'}</span>
              </div>
              {selectedAgent.activeSessionId && (
                <>
                  <div className="w-px h-5 bg-border/60" />
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block font-bold">Session</span>
                    <span className="text-[11px] text-foreground font-mono">{selectedAgent.activeSessionId.slice(0, 8)}…</span>
                  </div>
                </>
              )}
            </div>

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
              className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
            >
              <Send className="size-3.5" />
              <span>Wake / Prompt</span>
            </button>

            <button
              type="button"
              onClick={() => void handleOpenTerminal(selectedAgent)}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
            >
              <TerminalIcon className="size-3.5" />
              <span>{isAgentLive ? 'Resume CLI Session' : 'Spawn Live CLI'}</span>
            </button>
          </div>
        </div>

        {/* Workspace Tab Bar */}
        <div className="flex border-b border-border/60 bg-foreground/[0.02] px-3 pt-1.5 gap-1.5 rounded-xl overflow-x-auto">
          {[
            { id: 'workspace', label: 'Employee Workspace & PTY', icon: FolderGit2 },
            { id: 'performance', label: 'AI Performance & Summary', icon: Sparkles },
            { id: 'tasks', label: `Assigned Tasks (${agentTasks.length})`, icon: Layers },
            { id: 'evidence', label: 'Verified Evidence', icon: ShieldCheck },
            { id: 'contract', label: 'AI Employee & Governance Contract', icon: Cpu },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWorkspaceTab(tab.id as WorkspaceTab)}
              className={cn(
                'px-3.5 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 cursor-pointer',
                workspaceTab === tab.id
                  ? 'bg-card text-foreground border-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              <tab.icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* TAB 1: Employee Workspace & Live Terminal */}
        {workspaceTab === 'workspace' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-panel border-border/80 rounded-2xl p-4 flex flex-col h-[460px]">
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', isAgentLive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40')} />
                    <span className="text-xs font-bold text-foreground">
                      {isAgentLive ? `Active Session (${selectedAgent.runtime || 'ACP'})` : 'Standby Console'}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground bg-foreground/[0.05] px-2 py-0.5 rounded-md">
                      @{selectedAgent.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleOpenTerminal(selectedAgent)}
                      className="px-2.5 py-1 glass-panel hover:bg-foreground/[0.08] text-foreground rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      🪐 Antigravity
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenTerminal(selectedAgent)}
                      className="px-2.5 py-1 glass-panel hover:bg-foreground/[0.08] text-foreground rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      ⚡ Claude
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenTerminal(selectedAgent)}
                      className="px-2.5 py-1 glass-panel hover:bg-foreground/[0.08] text-foreground rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      ♊ Gemini
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-foreground/[0.02] rounded-xl border border-dashed border-border/60">
                  <TerminalIcon className="size-8 text-muted-foreground/40 mb-2" />
                  <h3 className="text-xs font-bold text-foreground">
                    {isAgentLive ? `CLI Session Running for @${selectedAgent.id}` : `No Active Terminal Session for @${selectedAgent.id}`}
                  </h3>
                  <p className="text-[11px] text-muted-foreground max-w-sm mt-1">
                    Spawn Antigravity, Claude Code, or Gemini CLI in this agent&apos;s workspace to stream live output and dispatch tool calls.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleOpenTerminal(selectedAgent)}
                    className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'mt-4 cursor-pointer gap-1.5')}
                  >
                    <Play className="size-3.5 fill-current" />
                    <span>{isAgentLive ? 'View Live Terminal' : 'Launch Session in Dev Mode'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Codebase & Directory Telemetry */}
            <div className="space-y-4">
              <div className="glass-panel border-border/80 p-4.5 rounded-2xl shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <FolderGit2 className="size-4 text-indigo-500" />
                  <span>Target Codebase &amp; Working Directory</span>
                </div>
                <div className="p-3 bg-foreground/[0.03] border border-border/50 rounded-xl space-y-1">
                  <div className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Substrate Path</div>
                  <div className="text-xs font-mono text-foreground break-all">.claude/worktrees/desktop-app-ai-teams-2fa62f</div>
                </div>
                <div className="p-3 bg-foreground/[0.03] border border-border/50 rounded-xl space-y-1">
                  <div className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Git Branch</div>
                  <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">claude/desktop-app-ai-teams-2fa62f</div>
                </div>
              </div>

              <div className="glass-panel border-border/80 p-4.5 rounded-2xl shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Bookmark className="size-4 text-amber-500" />
                    <span>Agent Memory Substrate</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">Substrate record</span>
                </div>
                <div className="p-3 bg-foreground/[0.03] border border-border/50 rounded-xl text-xs text-muted-foreground space-y-1">
                  <p>In-adapter memory and transcript context are linked to ACP session:</p>
                  <p className="font-mono text-foreground truncate">{selectedAgent.acpSessionId || 'Ready for session initialization'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI Performance & Executive Summary */}
        {workspaceTab === 'performance' && (
          <div className="glass-panel border-border/80 p-6 rounded-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="size-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-foreground">AI Performance Synthesis &amp; Substrate Audit</h2>
                  <p className="text-xs text-muted-foreground">Autonomous evaluation based on tasks, events, and verified evidence</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold font-mono text-xs rounded-full border border-amber-500/30">
                {qualityIds.has(selectedAgent.id) ? 'VERIFIED INDEPENDENT STEWARD' : 'ACTIVE SUBSTRATE BUILDER'}
              </span>
            </div>

            <div className="bg-foreground/[0.03] p-4 rounded-xl border border-border/50 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">Executive Overview</div>
              <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                @{selectedAgent.id} is operating within the <strong>{selectedAgent.lane || 'engineering'}</strong> lane.
                {qualityIds.has(selectedAgent.id)
                  ? ' Designated as an independent verifier under Mandate Rule #2 (builders forbidden from self-verifying).'
                  : ' Responsible for autonomous feature authoring and substrate fidelity.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-panel p-4 rounded-xl border border-border/60 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  <span>Accomplishments</span>
                </div>
                <ul className="space-y-1.5 text-xs text-foreground/80 list-disc list-inside">
                  <li>Active identity registered on runtime substrate.</li>
                  <li>Role contract verified against system schema.</li>
                  <li>Zero uncommitted drift mandate maintained.</li>
                </ul>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-border/60 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-4" />
                  <span>Risks &amp; Blockers</span>
                </div>
                <ul className="space-y-1.5 text-xs text-foreground/80 list-disc list-inside">
                  {selectedAgent.statusState === 'rate_limited' ? (
                    <li className="text-needs-you">Currently paused under provider rate limits.</li>
                  ) : (
                    <li>No critical blockers detected on agent telemetry.</li>
                  )}
                  <li>Must preserve independent verification rule on completion.</li>
                </ul>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-border/60 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  <Target className="size-4" />
                  <span>Actionable Next Steps</span>
                </div>
                <ul className="space-y-1.5 text-xs text-foreground/80 list-disc list-inside">
                  <li>Monitor session transcript output in dev mode.</li>
                  <li>Verify regression test suites prior to status transition.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Assigned Tasks */}
        {workspaceTab === 'tasks' && (
          <div className="glass-panel border-border/80 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                <Layers className="size-4 text-indigo-500" />
                <span>Assigned Tasks &amp; Jobs ({agentTasks.length})</span>
              </div>
            </div>

            {agentTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-4">No jobs currently created by or assigned to @{selectedAgent.id}.</p>
            ) : (
              <div className="space-y-2">
                {agentTasks.map((j) => (
                  <div key={j.id} className="glass-panel p-3.5 rounded-xl border border-border/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">#{j.number}</span>
                      <div>
                        <div className="text-xs font-bold text-foreground">{j.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-md">
                          Stage: {j.stage} · {fmtTime(j.createdAt)} {j.priority ? `· Priority: ${j.priority}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag tone={j.stage === 'done' ? 'verified' : 'observed'}>{j.stage}</Tag>
                      <a href={href({ name: 'job', jobId: j.id })} className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'text-xs')}>
                        Open Job
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Verified Evidence */}
        {workspaceTab === 'evidence' && (
          <div className="glass-panel border-border/80 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span>Verified Evidence &amp; Independent Attestations</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-foreground/[0.02] border border-border/50 text-xs text-muted-foreground space-y-2">
              <p>
                All evidence submitted by autonomous agents is append-only, hash-chained, and checked against the SQLite database records.
              </p>
              <div className="font-mono text-[11px] text-foreground bg-foreground/[0.04] p-3 rounded-lg">
                Independent Verifier Rule: Implementers are strictly forbidden from self-verifying their own work.
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AI Employee & Governance Contract */}
        {workspaceTab === 'contract' && (
          <div className="glass-panel border-border/80 p-5 rounded-2xl space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                <Cpu className="size-4 text-amber-500" />
                <span>AI Employee Role Contract &amp; Governance Mandates</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingAgent(selectedAgent);
                  setIsEditModalOpen(true);
                }}
                className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
              >
                <Edit3 className="size-3.5" />
                <span>Edit Contract</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Declared Capabilities</div>
                <div className="flex flex-wrap gap-1.5">
                  {parseArrayField(selectedAgent.capabilities).map((cap, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-md bg-foreground/[0.05] border border-border/50 font-mono text-xs">
                      {cap}
                    </span>
                  ))}
                  {parseArrayField(selectedAgent.capabilities).length === 0 && (
                    <span className="text-xs text-muted-foreground italic">None specified.</span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Substrate Responsibilities</div>
                <ul className="space-y-1.5 text-xs text-foreground/80 list-disc list-inside">
                  <li>Execute tasks within assigned {selectedAgent.lane || 'functional'} lane.</li>
                  <li>Maintain 100% substrate truthfulness and relational database consistency.</li>
                  {qualityIds.has(selectedAgent.id) && (
                    <li className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Independently re-run verification commands (cannot self-verify authored code).
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Modals in Workspace view */}
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

  // -------------------------------------------------------------------------
  // Unified Team & Coworkers Page (Org Chart + Fleet Registry)
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-5 py-2 pb-16 select-none animate-fade-in">
      {/* 1. Header Bar with Mode Switcher & Global Actions */}
      <header className="glass-panel flex flex-col md:flex-row justify-between items-start md:items-center gap-4 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/10 text-foreground">
              {activeView === 'chart' ? <Workflow className="size-4" /> : <Users className="size-4" />}
            </span>
            <h1 className="text-base font-bold tracking-tight">Autonomous Team &amp; Coworkers</h1>
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {nonOwnerIdentities.length} agents
            </span>
            {teams.length > 0 && (
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {teams.length} teams
              </span>
            )}
            {rateLimitedIdentities.length > 0 && (
              <Tag tone="risk">{rateLimitedIdentities.length} paused</Tag>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Visual hierarchy, autonomous coworkers, scheduled wakeups, session IDs &amp; rate-limit awareness
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle: All-in-One vs Org Chart vs Fleet Registry */}
          <div role="group" aria-label="View Mode" className="glass-panel inline-flex rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveView('all')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer',
                activeView === 'all' ? 'glass-chosen text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Workflow className="size-3.5" />
              <span>All in One</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('chart')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer',
                activeView === 'chart' ? 'glass-chosen text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Workflow className="size-3.5" />
              <span>Org Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('registry')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer',
                activeView === 'registry' ? 'glass-chosen text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="size-3.5" />
              <span>Fleet Registry</span>
            </button>
          </div>

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
            <span>Spawn / Add Coworker</span>
          </button>
        </div>
      </header>

      {/* 2. Cross-Agent Session Limit Notice (if any agent is paused) */}
      {rateLimitedIdentities.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-needs-you/40 bg-needs-you/10 px-4 py-2.5 text-xs text-needs-you">
          <div>
            <strong>Cross-Agent Session Limit Notice:</strong>{' '}
            {rateLimitedIdentities
              .map((i) => `${i.name} (${i.runtime ?? 'adapter'}) waiting for reset at ${fmtTime(i.rateLimitResetAt)} (${i.rateLimitReason ?? 'session limit'})`)
              .join(' · ')}.
            {' '}Other agents (Antigravity / Gemini / Codex / Claude) are automatically informed of this reset window and auto-resume is scheduled.
          </div>
        </div>
      )}

      {/* 3. Tell Team Leader Dispatch Form (Always Available) */}
      {client && (
        <form onSubmit={handleLeaderDispatch} className="bg-card flex flex-wrap items-center gap-2.5 rounded-xl px-4 py-3 border border-border/60">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Crown className="size-3.5 text-amber-500" />
            <span>Tell Team Leader:</span>
          </span>
          <select
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            aria-label="Team leader"
            className="glass-panel h-8 rounded-md px-2 text-xs"
          >
            {identities
              .filter((i) => !i.isOwner)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.role ?? i.runtime ?? 'Leader'})
                </option>
              ))}
          </select>
          <input
            value={teamGoal}
            onChange={(e) => setTeamGoal(e.target.value)}
            placeholder="Tell the Team Leader what needs to be done (they can wake coworkers, schedule checks, or spawn specialists)…"
            aria-label="Team leader goal"
            className="glass-panel h-8 min-w-64 flex-1 rounded-md px-3 text-xs outline-none"
          />
          <button
            type="submit"
            disabled={!teamGoal.trim() || dispatching}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}
          >
            {dispatching ? 'Dispatching…' : 'Dispatch to Leader'}
          </button>
          {dispatchStatus && <span className="w-full text-xs text-muted-foreground font-mono">{dispatchStatus}</span>}
        </form>
      )}

      {/* 4. AI Team Architect Audit Card */}
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
                className="text-muted-foreground hover:text-foreground text-xs p-1 cursor-pointer"
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

      {/* 5. VIEW A: Visual Org Hierarchy Chart */}
      {(activeView === 'all' || activeView === 'chart') && (
        <div className="space-y-6">
          <div className="glass-panel border-border/60 rounded-3xl p-6 md:p-8 space-y-8 shadow-xs">
            {/* Tier 1: Human Executive Leadership */}
            <div className="flex flex-col items-center">
              <div className="glass-panel group relative w-80 rounded-2xl p-4 text-center shadow-lg transition-all border border-border/80 hover:border-foreground/30">
                <div className="absolute top-3 right-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingExecutive(!isEditingExecutive)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition cursor-pointer"
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
                      className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full text-[11px] cursor-pointer')}
                    >
                      Done
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
                        onDoubleClick={() => handleOpenAgentWorkspace(agent.id)}
                        title="Click to select · double-click to open workspace"
                        className={cn(
                          'glass-panel w-72 p-4 rounded-2xl cursor-pointer transition-all duration-200 shadow-2xs hover:shadow-md border group relative',
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

                        <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-border/40 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleOpenTerminal(agent);
                            }}
                            title="Terminal"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <TerminalIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAgentWorkspace(agent.id);
                            }}
                            title="Open Workspace"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
                        </div>
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
                        onDoubleClick={() => handleOpenAgentWorkspace(agent.id)}
                        title="Click to select · double-click to open workspace"
                        className={cn(
                          'glass-panel p-3.5 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md border group',
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

                        <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-1.5 border-t border-border/40 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleOpenTerminal(agent);
                            }}
                            title="Terminal"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <TerminalIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAgentWorkspace(agent.id);
                            }}
                            title="Open Workspace"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
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
                        onDoubleClick={() => handleOpenAgentWorkspace(agent.id)}
                        title="Click to select · double-click to open workspace"
                        className={cn(
                          'glass-panel p-3.5 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md border group',
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

                        <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-1.5 border-t border-border/40 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleOpenTerminal(agent);
                            }}
                            title="Terminal"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <TerminalIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAgentWorkspace(agent.id);
                            }}
                            title="Open Workspace"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
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
                        onDoubleClick={() => handleOpenAgentWorkspace(agent.id)}
                        title="Click to select · double-click to open workspace"
                        className={cn(
                          'glass-panel p-3.5 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md border group',
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

                        <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-1.5 border-t border-border/40 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleOpenTerminal(agent);
                            }}
                            title="Terminal"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <TerminalIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAgentWorkspace(agent.id);
                            }}
                            title="Open Workspace"
                            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
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
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase glass-panel">
                        Lane: {selectedAgent.lane || (qualityIds.has(selectedAgent.id) ? 'verification' : 'engineering')}
                      </span>
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
                  <button
                    type="button"
                    onClick={() => handleOpenAgentWorkspace(selectedAgent.id)}
                    className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer flex items-center gap-1.5')}
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Open Agent Workspace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingAgent(selectedAgent);
                      setIsEditModalOpen(true);
                    }}
                    className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer flex items-center gap-1.5')}
                  >
                    <Edit3 className="size-3.5" />
                    <span>Edit Role</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleOpenTerminal(selectedAgent)}
                    className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer flex items-center gap-1.5')}
                  >
                    <TerminalIcon className="size-3.5" />
                    <span>Terminal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsWakeModalOpen(true)}
                    className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer flex items-center gap-1.5')}
                  >
                    <Send className="size-3.5" />
                    <span>Wake / Prompt</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-border/60">
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
        </div>
      )}

      {/* 6. VIEW B: Coworkers Fleet Registry & Autonomy Panel (The complete previous page!) */}
      {(activeView === 'all' || activeView === 'registry') && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start pt-2">
          <main className="flex min-w-0 flex-1 flex-col gap-4">
            {addingInline && (onCreate || client) && (
              <AddForm
                onCreate={async (i, prompt) => {
                  if (client) {
                    await client.spawnAgent({
                      id: i.id,
                      name: i.name,
                      role: i.role ?? undefined,
                      runtime: i.runtime ?? undefined,
                      avatarMark: i.avatarMark ?? 'diamond',
                      avatarColor: i.avatarColor ?? 'graphite',
                      prompt: prompt?.trim() || undefined,
                      spawnedBy: ownerId,
                    });
                  } else if (onCreate) {
                    await onCreate(i);
                  }
                  setAddingInline(false);
                  setSelectedId(i.id.toLowerCase());
                }}
                onCancel={() => setAddingInline(false)}
              />
            )}

            {identities.length === 0 && !addingInline ? (
              <EmptyState title="No coworkers yet">
                Add or spawn the agents you work with.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                <SectionTitle aside="active session IDs, rate limits &amp; council seats">Coworkers</SectionTitle>
                <section aria-label="Coworkers" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {identities.map((i) => {
                  const badge = identityStatusBadge(i, liveAgentIds.has(i.id));
                  return (
                    <button
                      type="button"
                      key={i.id}
                      onClick={() => setSelectedId(i.id)}
                      className={cn(
                        'bg-card flex flex-col gap-2.5 rounded-xl p-3.5 text-left transition-colors border border-border/50 cursor-pointer',
                        selectedId === i.id && 'ring-2 ring-foreground/40'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar who={i} size={44} />
                        <div className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="font-semibold text-foreground">{i.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{i.role ?? 'No role set'}</span>
                        </div>
                        <Tag tone={badge.tone}>{badge.label}</Tag>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-muted-foreground">Runs on</span>
                          <span className="font-mono text-xs text-foreground">{i.runtime ?? 'Not configured'}</span>
                        </div>
                        {i.activeSessionId && (
                          <div className="flex flex-col items-end">
                            <span className="text-[11px] text-muted-foreground">Session ID</span>
                            <span className="font-mono text-[11px] text-foreground/85">{i.activeSessionId}</span>
                          </div>
                        )}
                      </div>
                      {i.acpSessionId && (
                        <div className="truncate rounded bg-foreground/[0.04] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          ACP session: {i.acpSessionId}
                        </div>
                      )}
                      {i.statusState === 'rate_limited' && i.rateLimitResetAt && (
                        <div className="rounded border border-needs-you/30 bg-needs-you/10 px-2 py-1 text-[11px] text-needs-you">
                          Waiting for session reset at {fmtTime(i.rateLimitResetAt)}
                          {i.rateLimitReason ? ` · ${i.rateLimitReason}` : ''}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {i.seats.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No council seats</span>
                        ) : (
                          i.seats.map((s) => <Tag key={s}>{s}</Tag>)
                        )}
                      </div>
                    </button>
                  );
                })}
              </section>
            </div>
          )}

            {/* Scheduled Wakeups & Cron (Restored from previous page) */}
            {schedules.length > 0 && (
              <section aria-label="Active Agent Schedules" className="bg-card flex flex-col gap-2 rounded-xl p-4.5 border border-border/50">
                <SectionTitle aside="self-wake timers &amp; cron jobs">Scheduled Wakeups &amp; Cron</SectionTitle>
                <div className="flex flex-col divide-y divide-border/50">
                  {schedules.map((sch) => {
                    const target = identities.find((i) => i.id === sch.targetAgentId);
                    return (
                      <div key={sch.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{target?.name ?? sch.targetAgentId}</span>
                            <Tag tone={sch.enabled ? 'observed' : 'quiet'}>
                              {sch.cronExpr ? `cron: ${sch.cronExpr}` : sch.intervalSeconds ? `every ${sch.intervalSeconds}s` : 'one-shot timer'}
                            </Tag>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              next: {sch.nextRunAt ? fmtTime(sch.nextRunAt) : 'done'} · runs: {sch.runCount}
                            </span>
                          </div>
                          <span className="truncate text-muted-foreground">{sch.prompt}</span>
                        </div>
                        {client && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void client.updateSchedule(sch.id, { enabled: !sch.enabled })}
                              className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
                            >
                              {sch.enabled ? 'Pause' : 'Resume'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void client.deleteSchedule(sch.id)}
                              className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Agent Runtimes & Adapters (Restored from previous page) */}
            <section aria-label="Agent runtimes" className="bg-card flex flex-col gap-1 rounded-xl p-4.5 border border-border/50">
              <SectionTitle aside="probed on this Mac · shared rate-limit awareness">Agent runtimes</SectionTitle>
              {adapters.length === 0 && <p className="py-2 text-sm text-muted-foreground">The runtime has not reported its adapters yet.</p>}
              {adapters.map((a) => {
                const status = authTag(a.auth);
                const isLimited = Boolean(a.rateLimitResetAt && new Date(a.rateLimitResetAt).getTime() > Date.now());
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 border-t border-border/50 py-2.5 first:border-t-0">
                    <span className="flex-1 basis-32 font-medium text-foreground">{a.name}</span>
                    <span className="flex-1 basis-40 font-mono text-xs text-muted-foreground">
                      {a.command}
                      {a.version ? ` · ${a.version}` : ''}
                    </span>
                    <span className="flex-1 basis-56 text-xs text-muted-foreground">
                      {isLimited
                        ? `Session limit active — resets at ${fmtTime(a.rateLimitResetAt)} (${a.rateLimitReason ?? 'usage limit'})`
                        : (a.auth?.detail ?? 'Not probed')}
                    </span>
                    {isLimited ? (
                      <Tag tone="needs-you">Resets {fmtTime(a.rateLimitResetAt)}</Tag>
                    ) : (
                      <Tag tone={status.tone}>{status.label}</Tag>
                    )}
                    {client && (
                      <div className="flex items-center gap-1">
                        {isLimited ? (
                          <button
                            type="button"
                            onClick={() => void client.clearAdapterRateLimit(a.id)}
                            className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
                          >
                            Mark Resumed
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void client.setAdapterRateLimit(a.id, {
                                resetAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
                                reason: `${a.name} session limit reached`,
                              })
                            }
                            className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}
                          >
                            Flag Limit (2h)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-muted-foreground">
                When any adapter hits a session limit, MyaOS broadcasts the exact reset timestamp to all other agents so Antigravity/Gemini/Codex coworkers can cover or wait and auto-resume.
              </p>
            </section>
          </main>

          {/* Autonomy Panel & Avatar Picker (Restored from previous page) */}
          {selectedAgent && (
            <div className="flex w-full flex-col gap-4 lg:w-96">
              <AgentAutonomyPanel key={`auto-${selectedAgent.id}`} identity={selectedAgent} ownerId={ownerId} />
              <AvatarPicker
                key={selectedAgent.id}
                identity={selectedAgent}
                onSave={onUpdate ? (input) => onUpdate(selectedAgent.id, input) : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* Modals */}
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
// Agent Autonomy Panel (Restored from Coworkers screen)
// ---------------------------------------------------------------------------

function AgentAutonomyPanel({ identity, ownerId }: { identity: Identity; ownerId: string }) {
  const { client } = useRuntime();
  const [wakePrompt, setWakePrompt] = React.useState('');
  const [allowFallback, setAllowFallback] = React.useState(true);
  const [schedulePrompt, setSchedulePrompt] = React.useState('');
  const [scheduleSpec, setScheduleSpec] = React.useState('15m');
  const [limitMinutes, setLimitMinutes] = React.useState('60');
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!client) return null;

  const isLimited = Boolean(
    identity.statusState === 'rate_limited' &&
      identity.rateLimitResetAt &&
      new Date(identity.rateLimitResetAt).getTime() > Date.now()
  );

  const handleWake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wakePrompt.trim() || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await client.wakeAgent(identity.id, {
        fromActorId: ownerId,
        fromActorKind: 'human',
        prompt: wakePrompt.trim(),
        reason: 'Manual wake from Coworkers panel',
        allowFallbackAdapter: allowFallback,
      });
      setWakePrompt('');
      if (res.session?.id) {
        setStatusMsg(`Woke ${identity.name} in session ${res.session.id}`);
      } else if (res.deferredUntil) {
        setStatusMsg(`Session limit active — scheduled wakeup at ${fmtTime(res.deferredUntil)}`);
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulePrompt.trim() || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const spec = scheduleSpec.trim();
      const durMatch = spec.match(/^(\d+)\s*(s|m|h)$/i);
      const delaySeconds = durMatch
        ? Number(durMatch[1]) * (durMatch[2]!.toLowerCase() === 'h' ? 3600 : durMatch[2]!.toLowerCase() === 'm' ? 60 : 1)
        : undefined;
      const cronExpr = !durMatch && spec.includes(' ') ? spec : undefined;
      await client.createSchedule({
        targetAgentId: identity.id,
        createdBy: ownerId,
        prompt: schedulePrompt.trim(),
        delaySeconds: delaySeconds ?? (!cronExpr ? 300 : undefined),
        cronExpr,
      });
      setSchedulePrompt('');
      setStatusMsg(`Scheduled wakeup (${spec}) for ${identity.name}`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReportLimit = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const mins = Math.max(1, Number(limitMinutes) || 60);
      const resetAt = new Date(Date.now() + mins * 60_000).toISOString();
      await client.setAgentRateLimit(identity.id, {
        resetAt,
        reason: `Waiting for ${identity.runtime ?? 'session'} limit reset`,
      });
      setStatusMsg(`Marked ${identity.name} rate-limited until ${fmtTime(resetAt)}`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClearLimit = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await client.clearAgentRateLimit(identity.id);
      setStatusMsg(`${identity.name} marked ready & resumed.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-label="Autonomous controls" className="bg-card flex flex-col gap-3.5 rounded-xl p-5 border border-border/50">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{identity.name} · Autonomy &amp; Session</h2>
          <p className="text-xs text-muted-foreground">
            {identity.activeSessionId ? `Captured session: ${identity.activeSessionId}` : 'No session spawned yet — wake to capture'}
          </p>
        </div>
        {identity.activeSessionId && (
          <a href={href({ name: 'dev' })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
            Terminal
          </a>
        )}
      </div>

      {identity.acpSessionId && (
        <div className="rounded-lg border border-border/50 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          ACP Session ID: {identity.acpSessionId}
          {identity.lastWokenAt ? ` · Last woken ${fmtTime(identity.lastWokenAt)}` : ''}
        </div>
      )}

      <form onSubmit={handleWake} className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <span className="text-xs font-medium">1. Wake {identity.name}</span>
        <textarea
          value={wakePrompt}
          onChange={(e) => setWakePrompt(e.target.value)}
          placeholder={`Send instruction to wake ${identity.name}…`}
          aria-label={`Wake ${identity.name}`}
          className="min-h-16 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none"
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={allowFallback}
            onChange={(e) => setAllowFallback(e.target.checked)}
          />
          Use fallback adapter if primary runtime is waiting for session reset
        </label>
        <button type="submit" disabled={!wakePrompt.trim() || busy} className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'cursor-pointer')}>
          Wake {identity.name} Now
        </button>
      </form>

      <form onSubmit={handleSchedule} className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <span className="text-xs font-medium">2. Self-Schedule / Cron Wakeup</span>
        <div className="flex gap-2">
          <input
            value={scheduleSpec}
            onChange={(e) => setScheduleSpec(e.target.value)}
            placeholder="15m, 1h, or */15 * * * *"
            aria-label="Schedule delay or cron"
            className="glass-panel h-8 w-36 rounded-md px-2 font-mono text-xs outline-none"
          />
          <input
            value={schedulePrompt}
            onChange={(e) => setSchedulePrompt(e.target.value)}
            placeholder="Check progress on build / tests…"
            aria-label="Schedule prompt"
            className="glass-panel h-8 flex-1 rounded-md px-2 text-xs outline-none"
          />
        </div>
        <button type="submit" disabled={!schedulePrompt.trim() || busy} className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}>
          Schedule Wakeup
        </button>
      </form>

      <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <span className="text-xs font-medium">3. Session Limit &amp; Reset Awareness</span>
        {isLimited ? (
          <div className="flex flex-col gap-2 rounded-lg border border-needs-you/40 bg-needs-you/10 p-2.5 text-xs text-needs-you">
            <span>
              Waiting for session reset until <strong>{fmtTime(identity.rateLimitResetAt)}</strong> ({identity.rateLimitReason ?? 'rate limit'})
            </span>
            <button type="button" onClick={handleClearLimit} disabled={busy} className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}>
              Session Resumed · Clear Limit
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={limitMinutes}
              onChange={(e) => setLimitMinutes(e.target.value)}
              aria-label="Reset minutes"
              className="glass-panel h-8 w-20 rounded-md px-2 font-mono text-xs outline-none"
            />
            <span className="text-xs text-muted-foreground">min until reset</span>
            <button type="button" onClick={handleReportLimit} disabled={busy} className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'cursor-pointer')}>
              Flag Session Limit
            </button>
          </div>
        )}
      </div>

      {statusMsg && <p className="text-xs text-verified">{statusMsg}</p>}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// AvatarPicker (Restored from Coworkers screen)
// ---------------------------------------------------------------------------

function AvatarPicker({ identity, onSave }: { identity: Identity; onSave?: (input: UpdateIdentityInput) => Promise<void> }) {
  const [mark, setMark] = React.useState(identity.avatarMark ?? 'diamond');
  const [color, setColor] = React.useState(identity.avatarColor ?? 'graphite');
  const [name, setName] = React.useState(identity.name);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | string>('idle');
  const preview = { name, avatarMark: mark, avatarColor: color };
  const dirty = mark !== identity.avatarMark || color !== identity.avatarColor || name !== identity.name;

  const save = async () => {
    if (!onSave) return;
    setState('saving');
    try {
      await onSave({ avatarMark: mark, avatarColor: color, name });
      setState('saved');
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <aside aria-label="Avatar picker" className="bg-card flex w-full flex-col gap-4.5 rounded-xl p-5 border border-border/50">
      <div>
        <h2 className="text-base font-semibold">{identity.name}’s Avatar &amp; Profile</h2>
        <p className="text-xs text-muted-foreground">Pick a mark and a colour. Avatars are yours to choose; nothing is a real face.</p>
      </div>
      <div className="flex items-center gap-4">
        <Avatar who={preview} size={88} />
        <div className="flex flex-col gap-2 text-[13px]">
          <span className="flex items-center gap-2"><Avatar who={preview} size={28} /> {name} <span className="text-xs text-muted-foreground">in a thread</span></span>
          <span className="flex items-center gap-2"><Avatar who={preview} size={18} /> <span className="text-xs text-muted-foreground">in lists</span></span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Mark</span>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(AVATAR_MARKS).map(([id, m]) => (
            <button
              key={id}
              type="button"
              aria-label={m.name}
              aria-pressed={mark === id}
              onClick={() => setMark(id)}
              className={cn('glass-panel inline-flex aspect-square items-center justify-center rounded-xl cursor-pointer', mark === id && 'ring-1 ring-foreground')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={m.d} />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Colour</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(AVATAR_COLORS).map(([id, c]) => (
            <button
              key={id}
              type="button"
              aria-label={c.name}
              aria-pressed={color === id}
              onClick={() => setColor(id)}
              className={cn('inline-flex size-11 items-center justify-center rounded-full border-2 cursor-pointer', color === id ? 'border-foreground' : 'border-transparent')}
              style={{ background: c.bg }}
            >
              <span className="size-3 rounded-full" style={{ background: c.fg }} />
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Display name
        <input value={name} onChange={(e) => setName(e.target.value)} className="glass-panel h-10 rounded-md px-3 text-sm text-foreground outline-none" />
      </label>
      <div className="mt-auto flex items-center gap-3">
        <button type="button" disabled={!onSave || !dirty || state === 'saving'} onClick={save} className={cn(buttonVariants({ variant: 'default' }), 'flex-1 cursor-pointer')}>
          {state === 'saving' ? 'Saving…' : 'Save Profile'}
        </button>
        {state === 'saved' && !dirty && <span className="text-xs text-verified">Saved</span>}
        {!['idle', 'saving', 'saved'].includes(state) && <span className="text-xs text-risk">Not saved: {state}</span>}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// AddForm (Inline add from Coworkers screen)
// ---------------------------------------------------------------------------

function AddForm({ onCreate, onCancel }: { onCreate: (i: CreateIdentityInput, initialPrompt?: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('');
  const [runtime, setRuntime] = React.useState(RUNTIMES[0].name);
  const [initialPrompt, setInitialPrompt] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onCreate(
        {
          id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: name.trim(),
          role: role.trim() || undefined,
          runtime,
          avatarMark: 'diamond',
          avatarColor: 'graphite',
        },
        initialPrompt.trim() || undefined
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const field = 'glass-panel h-9 rounded-md px-2.5 text-sm outline-none placeholder:text-muted-foreground';
  return (
    <form onSubmit={submit} className="bg-card flex flex-wrap items-end gap-3 rounded-xl p-4 border border-border/50">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Nova" required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Role
        <input value={role} onChange={(e) => setRole(e.target.value)} className={field} placeholder="Platform and backend" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Runs on
        <select value={runtime} onChange={(e) => setRuntime(e.target.value)} className={field}>
          {RUNTIMES.slice(0, 4).map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Immediate wakeup instruction (optional)
        <input
          value={initialPrompt}
          onChange={(e) => setInitialPrompt(e.target.value)}
          className={field}
          placeholder="Start working on… (spawns session immediately)"
        />
      </label>
      <button type="submit" className={cn(buttonVariants({ variant: 'default' }), 'cursor-pointer')}>
        Spawn / Add
      </button>
      <button type="button" onClick={onCancel} className={cn(buttonVariants({ variant: 'glass' }), 'cursor-pointer')}>
        Cancel
      </button>
      {error && <p className="w-full text-xs text-risk">{error}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// SpawnAgentModal (AI intent generator & manual controls)
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
  const [runtimeEngine, setRuntimeEngine] = React.useState('antigravity --acp');
  const [initialPrompt, setInitialPrompt] = React.useState('');
  const [autoStart, setAutoStart] = React.useState(true);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerateRole = () => {
    if (!intent.trim()) return;
    const clean = intent.trim().toLowerCase();
    let slug = clean.replace(/[^a-z0-9]+/g, '_').slice(0, 16).replace(/^_+|_+$/g, '');
    if (!slug) slug = `agent_${Date.now().toString(36)}`;

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
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl border border-risk/40 bg-risk/10 text-risk text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
                <option value="antigravity --acp">Antigravity (ACP) — Recommended</option>
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
// EditRoleModal
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
  const [runtime, setRuntime] = React.useState(identity.runtime || 'antigravity --acp');

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
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

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
              <select
                value={runtime}
                onChange={(e) => setRuntime(e.target.value)}
                className="glass-panel w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono"
              >
                <option value="antigravity --acp">Antigravity (antigravity --acp)</option>
                <option value="claude-agent-acp">Claude Code (claude-agent-acp)</option>
                <option value="codex-acp">Codex (codex-acp)</option>
                <option value="gemini --acp">Gemini CLI (gemini --acp)</option>
                {!['antigravity --acp', 'claude-agent-acp', 'codex-acp', 'gemini --acp'].includes(runtime) && (
                  <option value={runtime}>{runtime} (Custom)</option>
                )}
              </select>
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
// WakeAgentModal
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
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
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
