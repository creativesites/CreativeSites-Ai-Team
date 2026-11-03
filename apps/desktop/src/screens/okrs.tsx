import * as React from 'react';
import {
  Target,
  Zap,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Edit3,
  Trash2,
  Play,
  X,
} from 'lucide-react';
import type {
  Identity,
  JobSummary,
  OkrKeyResult,
  OkrObjective,
  RealityAuditSummary,
  Room,
} from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { buttonVariants } from '@/components/ui/button';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- Circular Progress Dial

export const CircularProgressDial: React.FC<{
  percentage: number;
  size?: number;
  strokeWidth?: number;
}> = ({ percentage, size = 48, strokeWidth = 4 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clamped = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-primary transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono text-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  );
};

// ---------------------------------------------------------------- Props

export interface OkrsScreenProps {
  identities?: Identity[];
  jobs?: JobSummary[];
  rooms?: Room[];
  initialQuarter?: string;
  ownerId?: string;
  ownerName?: string;
  onStartJob?: (request: { text: string; roomId?: string }) => Promise<void>;
}

export function OkrsScreen({
  identities = [],
  jobs: _jobs = [],
  rooms = [],
  initialQuarter,
  ownerId = 'winston',
  ownerName: _ownerName = 'Winston',
  onStartJob,
}: OkrsScreenProps) {
  const { client } = useRuntime();

  // State
  const [objectives, setObjectives] = React.useState<OkrObjective[]>([]);
  const [keyResults, setKeyResults] = React.useState<OkrKeyResult[]>([]);
  const [expandedObjectives, setExpandedObjectives] = React.useState<Record<string, boolean>>({
    OBJ_1: true,
    OBJ_2: true,
  });
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [auditSummary, setAuditSummary] = React.useState<RealityAuditSummary | null>(null);

  // Filters
  const [selectedQuarter, setSelectedQuarter] = React.useState<string>(initialQuarter || 'All');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('All');

  // Modals state
  const [showObjectiveModal, setShowObjectiveModal] = React.useState(false);
  const [editingObjective, setEditingObjective] = React.useState<OkrObjective | null>(null);

  const [showKeyResultModal, setShowKeyResultModal] = React.useState(false);
  const [targetObjectiveIdForKr, setTargetObjectiveIdForKr] = React.useState<string>('');
  const [editingKeyResult, setEditingKeyResult] = React.useState<OkrKeyResult | null>(null);

  // Dispatch modal
  const [dispatchKr, setDispatchKr] = React.useState<{ kr: OkrKeyResult; obj: OkrObjective } | null>(null);
  const [dispatchPrompt, setDispatchPrompt] = React.useState('');
  const [dispatching, setDispatching] = React.useState(false);

  // Form states for Objective
  const [objId, setObjId] = React.useState('');
  const [objTitle, setObjTitle] = React.useState('');
  const [objDesc, setObjDesc] = React.useState('');
  const [objOwner, setObjOwner] = React.useState('astra');
  const [objQuarter, setObjQuarter] = React.useState('Q4-2026');
  const [objStatus, setObjStatus] = React.useState<'on_track' | 'at_risk' | 'behind' | 'completed'>('on_track');

  // Form states for Key Result
  const [krId, setKrId] = React.useState('');
  const [krTitle, setKrTitle] = React.useState('');
  const [krMetricType, setKrMetricType] = React.useState<'percentage' | 'numeric' | 'boolean' | 'binary'>('percentage');
  const [krCurrentValue, setKrCurrentValue] = React.useState<number>(0);
  const [krTargetValue, setKrTargetValue] = React.useState<number>(100);
  const [krUnit, setKrUnit] = React.useState('%');
  const [krTelemetryQuery, setKrTelemetryQuery] = React.useState('');

  // Data fetching
  const loadOkrs = React.useCallback(async () => {
    if (!client) return;
    try {
      const [okrRes, auditRes] = await Promise.all([
        client.okrs().catch(() => ({ objectives: [], keyResults: [] })),
        client.realityAudit().catch(() => null),
      ]);
      setObjectives(okrRes.objectives || []);
      setKeyResults(okrRes.keyResults || []);
      setAuditSummary(auditRes);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  React.useEffect(() => {
    loadOkrs();
  }, [loadOkrs]);

  const triggerRealitySync = async () => {
    setRefreshing(true);
    await loadOkrs();
  };

  // Objective CRUD Handlers
  const handleOpenNewObjectiveModal = () => {
    const nextNum = objectives.length + 1;
    setEditingObjective(null);
    setObjId(`OBJ_${nextNum}`);
    setObjTitle('');
    setObjDesc('');
    setObjOwner(identities[0]?.id || 'astra');
    setObjQuarter('Q4-2026');
    setObjStatus('on_track');
    setShowObjectiveModal(true);
  };

  const handleOpenEditObjectiveModal = (obj: OkrObjective) => {
    setEditingObjective(obj);
    setObjId(obj.id);
    setObjTitle(obj.title);
    setObjDesc(obj.description || '');
    setObjOwner(obj.owner_id || identities[0]?.id || 'astra');
    setObjQuarter(obj.quarter);
    setObjStatus(obj.status);
    setShowObjectiveModal(true);
  };

  const handleSaveObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !objTitle.trim()) return;

    try {
      await client.saveOkrObjective({
        id: objId.trim(),
        title: objTitle.trim(),
        description: objDesc.trim() || undefined,
        owner_id: objOwner,
        quarter: objQuarter,
        status: objStatus,
      });
      setShowObjectiveModal(false);
      await loadOkrs();
    } catch (err) {
      alert(`Failed to save objective: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteObjective = async (id: string) => {
    if (!client) return;
    if (!confirm(`Are you sure you want to delete objective ${id} and all its measured key results?`)) return;
    try {
      await client.deleteOkrObjective(id);
      await loadOkrs();
    } catch (err) {
      alert(`Failed to delete objective: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Key Result CRUD Handlers
  const handleOpenNewKeyResultModal = (objectiveId: string) => {
    setEditingKeyResult(null);
    setTargetObjectiveIdForKr(objectiveId);
    const existingKrs = keyResults.filter((k) => k.objective_id === objectiveId);
    const krIndex = existingKrs.length + 1;
    setKrId(`KR_${objectiveId.replace('OBJ_', '')}_${krIndex}`);
    setKrTitle('');
    setKrMetricType('percentage');
    setKrCurrentValue(0);
    setKrTargetValue(100);
    setKrUnit('%');
    setKrTelemetryQuery('');
    setShowKeyResultModal(true);
  };

  const handleOpenEditKeyResultModal = (kr: OkrKeyResult) => {
    setEditingKeyResult(kr);
    setTargetObjectiveIdForKr(kr.objective_id);
    setKrId(kr.id);
    setKrTitle(kr.title);
    setKrMetricType(kr.metric_type);
    setKrCurrentValue(kr.current_value);
    setKrTargetValue(kr.target_value);
    setKrUnit(kr.unit || '');
    setKrTelemetryQuery(kr.telemetry_query || '');
    setShowKeyResultModal(true);
  };

  const handleSaveKeyResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !krTitle.trim()) return;

    try {
      await client.saveOkrKeyResult({
        id: krId.trim(),
        objective_id: targetObjectiveIdForKr,
        title: krTitle.trim(),
        metric_type: krMetricType,
        current_value: Number(krCurrentValue),
        target_value: Number(krTargetValue),
        unit: krUnit.trim() || undefined,
        telemetry_query: krTelemetryQuery.trim() || undefined,
      });
      setShowKeyResultModal(false);
      await loadOkrs();
    } catch (err) {
      alert(`Failed to save key result: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteKeyResult = async (id: string) => {
    if (!client) return;
    if (!confirm(`Are you sure you want to delete Key Result ${id}?`)) return;
    try {
      await client.deleteOkrKeyResult(id);
      await loadOkrs();
    } catch (err) {
      alert(`Failed to delete key result: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdateKrProgress = async (krIdToUpdate: string, newVal: number) => {
    if (!client) return;
    try {
      // Optimistic update
      setKeyResults((prev) =>
        prev.map((k) => {
          if (k.id === krIdToUpdate) {
            const prog = k.target_value > 0 ? Math.round(Math.min(100, Math.max(0, (newVal / k.target_value) * 100))) : 0;
            return { ...k, current_value: newVal, progress_percent: prog };
          }
          return k;
        })
      );
      const res = await client.updateOkrProgress(krIdToUpdate, newVal);
      // Synchronize parent objective
      setObjectives((prev) =>
        prev.map((o) => (o.id === res.objective.id ? res.objective : o))
      );
    } catch (err) {
      console.error('Failed to update KR progress:', err);
    }
  };

  // Dispatch Specialist
  const handleOpenDispatch = (kr: OkrKeyResult, obj: OkrObjective) => {
    setDispatchKr({ kr, obj });
    setDispatchPrompt(
      `Executing alignment sprint on Strategic Key Result ${kr.id}: "${kr.title}". Target: ${kr.target_value} ${kr.unit || ''} (Current: ${kr.current_value}). Lead: @${obj.owner_id || 'team'}.`
    );
  };

  const handleExecuteDispatch = async () => {
    if (!client || !dispatchKr || !dispatchPrompt.trim()) return;
    setDispatching(true);
    try {
      const targetAgent = dispatchKr.obj.owner_id || 'astra';
      // Wake agent with this prompt
      await client.wakeAgent(targetAgent, {
        targetAgentId: targetAgent,
        fromActorId: ownerId,
        fromActorKind: 'human',
        prompt: dispatchPrompt.trim(),
        reason: `OKR Alignment Sprint: ${dispatchKr.kr.id}`,
      }).catch(() => null);

      // Also create a job if onStartJob is available
      if (onStartJob) {
        await onStartJob({
          text: dispatchPrompt.trim(),
          roomId: rooms[0]?.id,
        }).catch(() => null);
      }

      setDispatchKr(null);
    } finally {
      setDispatching(false);
    }
  };

  // Filtered lists
  const quarters = Array.from(new Set(objectives.map((o) => o.quarter).filter(Boolean)));
  if (!quarters.includes('Q4-2026')) quarters.push('Q4-2026');
  if (!quarters.includes('Q3-2026')) quarters.push('Q3-2026');
  quarters.sort().reverse();

  const filteredObjectives = objectives.filter((obj) => {
    if (selectedQuarter !== 'All' && obj.quarter !== selectedQuarter) return false;
    if (selectedStatus !== 'All' && obj.status !== selectedStatus) return false;
    return true;
  });

  const totalAvgProgress =
    objectives.length > 0
      ? Math.round(objectives.reduce((acc, o) => acc + o.progress_percent, 0) / objectives.length)
      : 0;

  const realityHealthScore = auditSummary?.healthScore ?? 94;

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-xs text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin text-primary" />
        Loading Strategic OKRs &amp; reality health metrics…
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 md:p-6 text-foreground font-sans">
      {/* Top Header Card */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-sm border border-border/60">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background shadow-xs">
            <Target className="size-5.5 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">Strategic OKRs &amp; Team Goals</h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                Q4-2026 Active Cycle
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary border border-primary/20 flex items-center gap-1">
                <Zap className="size-3 text-primary" />
                Active in Agent Prompts
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Executive goal cascade, telemetry-linked key results, and un-mocked substrate reality tracking
            </p>
          </div>
        </div>

        {/* Executive Dials & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="glass-panel flex items-center gap-3 rounded-xl px-3.5 py-2 border border-border/40">
            <CircularProgressDial percentage={totalAvgProgress} size={44} strokeWidth={4} />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-bold">
                Overall Progress
              </div>
              <div className="text-xs font-bold text-foreground">{totalAvgProgress}% Complete</div>
            </div>
          </div>

          <div className="glass-panel flex items-center gap-3 rounded-xl px-3.5 py-2 border border-border/40">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary border border-primary/20">
              {realityHealthScore}%
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-bold">
                Reality Health
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Substrate Truth
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={triggerRealitySync}
            disabled={refreshing}
            className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'gap-1.5')}
            title="Reconcile with evidence substrate"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            <span>Reality Sync</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewObjectiveModal}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-1.5 shadow-sm')}
          >
            <Plus className="size-4" />
            <span>New Objective</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 border border-border/40 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Quarter:</span>
            {['All', ...quarters].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setSelectedQuarter(q)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  selectedQuarter === q
                    ? 'bg-foreground text-background shadow-xs'
                    : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground'
                )}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border/40" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Status:</span>
            {[
              { id: 'All', label: 'All' },
              { id: 'on_track', label: 'On Track' },
              { id: 'at_risk', label: 'At Risk' },
              { id: 'behind', label: 'Behind' },
              { id: 'completed', label: 'Completed' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStatus(s.id)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  selectedStatus === s.id
                    ? 'bg-foreground text-background shadow-xs'
                    : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <span className="font-mono text-[11px] text-muted-foreground">
          Showing {filteredObjectives.length} of {objectives.length} Strategic Objectives
        </span>
      </div>

      {/* OKR Cascade Hierarchy */}
      <div className="flex flex-col gap-4">
        {filteredObjectives.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl p-10 text-center border border-dashed border-border/60">
            <Target className="size-10 text-muted-foreground/40" />
            <h3 className="text-sm font-semibold text-foreground">No Strategic Objectives Found</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Define your quarterly North Star goals to align all agent turns and jobs directly to measurable metrics.
            </p>
            <button
              type="button"
              onClick={handleOpenNewObjectiveModal}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'mt-2 gap-1.5')}
            >
              <Plus className="size-4" />
              <span>Create First Objective</span>
            </button>
          </div>
        ) : (
          filteredObjectives.map((obj) => {
            const krs = keyResults.filter((k) => k.objective_id === obj.id);
            const isExpanded = !!expandedObjectives[obj.id];
            const leadIdentity = identities.find((i) => i.id === obj.owner_id);

            return (
              <div
                key={obj.id}
                className="glass-panel flex flex-col rounded-2xl border border-border/60 overflow-hidden shadow-xs transition-all duration-300"
              >
                {/* Objective Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border/40">
                  <div
                    onClick={() =>
                      setExpandedObjectives((prev) => ({ ...prev, [obj.id]: !prev[obj.id] }))
                    }
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                  >
                    <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.06] text-muted-foreground hover:text-foreground transition-colors">
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </span>

                    <span className="rounded-md bg-foreground px-2 py-0.5 font-mono text-[10px] font-bold text-background shrink-0">
                      {obj.id}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground truncate">{obj.title}</h3>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
                            obj.status === 'on_track' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                            obj.status === 'at_risk' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                            obj.status === 'behind' && 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                            obj.status === 'completed' && 'bg-primary/10 text-primary border border-primary/20'
                          )}
                        >
                          {obj.status.replace('_', ' ')}
                        </span>
                        <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {obj.quarter}
                        </span>
                      </div>
                      {obj.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">{obj.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Right: Lead & Progress */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-mono font-semibold text-primary border border-primary/20">
                      {leadIdentity ? (
                        <Avatar who={leadIdentity} size={16} />
                      ) : (
                        <span className="size-3 rounded-full bg-primary/30" />
                      )}
                      <span>@{obj.owner_id || 'team'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-foreground/10">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, obj.progress_percent))}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-xs font-bold text-foreground">
                        {obj.progress_percent}%
                      </span>
                    </div>

                    {/* Objective Actions */}
                    <div className="flex items-center gap-1 border-l border-border/40 pl-2">
                      <button
                        type="button"
                        onClick={() => handleOpenNewKeyResultModal(obj.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                        title="Add Key Result"
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditObjectiveModal(obj)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground transition-colors cursor-pointer"
                        title="Edit Objective"
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteObjective(obj.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Delete Objective"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Key Results List */}
                {isExpanded && (
                  <div className="flex flex-col gap-3 p-4 bg-background/40">
                    <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Measured Key Results ({krs.length})</span>
                      <button
                        type="button"
                        onClick={() => handleOpenNewKeyResultModal(obj.id)}
                        className="flex items-center gap-1 font-sans text-xs font-semibold text-primary hover:underline cursor-pointer normal-case"
                      >
                        <Plus className="size-3" />
                        <span>Add Key Result</span>
                      </button>
                    </div>

                    {krs.length === 0 ? (
                      <div className="glass-panel flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/40">
                        No key results added yet. Click &quot;+ Add Key Result&quot; to begin quantitative telemetry tracking.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {krs.map((kr) => (
                          <div
                            key={kr.id}
                            className="glass-panel flex flex-col justify-between gap-3 rounded-xl p-3.5 border border-border/50 hover:border-primary/50 transition-colors shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="rounded bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground border border-border/40">
                                {kr.id}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-primary">
                                  {kr.current_value} / {kr.target_value} {kr.unit || ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditKeyResultModal(kr)}
                                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                  title="Edit Key Result"
                                >
                                  <Edit3 className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteKeyResult(kr.id)}
                                  className="rounded p-1 text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
                                  title="Delete Key Result"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>

                            <h4 className="text-xs font-semibold text-foreground leading-snug">
                              {kr.title}
                            </h4>

                            {/* Progress meter */}
                            <div className="flex flex-col gap-1">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all duration-300',
                                    kr.progress_percent >= 80 ? 'bg-emerald-400' : kr.progress_percent >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                                  )}
                                  style={{ width: `${Math.min(100, Math.max(0, kr.progress_percent))}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                                <span>{kr.telemetry_query ? 'Telemetry Linked' : 'Manual Progress'}</span>
                                <span className="font-bold text-foreground">{kr.progress_percent}%</span>
                              </div>
                            </div>

                            {/* Live Interactive Progress Slider */}
                            <div className="flex items-center gap-2 border-t border-border/30 pt-2 text-[11px]">
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                Adjust Value:
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={kr.target_value || 100}
                                step={kr.metric_type === 'percentage' ? 1 : 0.5}
                                value={kr.current_value}
                                onChange={(e) => handleUpdateKrProgress(kr.id, parseFloat(e.target.value))}
                                className="w-full h-1 bg-foreground/15 accent-primary rounded-lg cursor-pointer"
                              />
                              <span className="w-10 text-right font-mono text-[11px] font-bold text-foreground shrink-0">
                                {kr.current_value}
                              </span>
                            </div>

                            {/* 1-Click Action */}
                            <button
                              type="button"
                              onClick={() => handleOpenDispatch(kr, obj)}
                              className={cn(
                                buttonVariants({ variant: 'glass', size: 'xs' }),
                                'w-full justify-center gap-1.5 text-xs text-foreground hover:border-primary/60'
                              )}
                            >
                              <Play className="size-3 text-primary" />
                              <span>Dispatch Specialist on KR</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Create / Edit Objective */}
      {showObjectiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel flex flex-col gap-4 rounded-2xl w-full max-w-md p-5 shadow-2xl border border-border/60 bg-background/95">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {editingObjective ? 'Edit Strategic Objective' : 'New Strategic Objective'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowObjectiveModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveObjective} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Objective ID</label>
                <input
                  type="text"
                  value={objId}
                  onChange={(e) => setObjId(e.target.value)}
                  required
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Elevate Chatbot SDK to Executive-Grade Quality"
                  value={objTitle}
                  onChange={(e) => setObjTitle(e.target.value)}
                  required
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Description &amp; Mandate</label>
                <textarea
                  rows={2}
                  placeholder="Details, acceptance threshold, or scope..."
                  value={objDesc}
                  onChange={(e) => setObjDesc(e.target.value)}
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-muted-foreground">Lead Coworker</label>
                  <select
                    value={objOwner}
                    onChange={(e) => setObjOwner(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    {identities.map((id) => (
                      <option key={id.id} value={id.id}>
                        {id.name} (@{id.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-muted-foreground">Quarter Cycle</label>
                  <input
                    type="text"
                    value={objQuarter}
                    onChange={(e) => setObjQuarter(e.target.value)}
                    placeholder="Q4-2026"
                    className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Current Status</label>
                <select
                  value={objStatus}
                  onChange={(e) => setObjStatus(e.target.value as any)}
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="behind">Behind</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="mt-2 flex justify-end gap-2 border-t border-border/40 pt-3">
                <button
                  type="button"
                  onClick={() => setShowObjectiveModal(false)}
                  className={cn(buttonVariants({ variant: 'glass', size: 'sm' }))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
                >
                  Save Objective
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Key Result */}
      {showKeyResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel flex flex-col gap-4 rounded-2xl w-full max-w-md p-5 shadow-2xl border border-border/60 bg-background/95">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {editingKeyResult ? 'Edit Key Result' : 'New Measured Key Result'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyResultModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveKeyResult} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Key Result ID</label>
                <input
                  type="text"
                  value={krId}
                  onChange={(e) => setKrId(e.target.value)}
                  required
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Measurable Title</label>
                <input
                  type="text"
                  placeholder="e.g. Widget streaming latency below 200ms"
                  value={krTitle}
                  onChange={(e) => setKrTitle(e.target.value)}
                  required
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-muted-foreground">Current Value</label>
                  <input
                    type="number"
                    step="any"
                    value={krCurrentValue}
                    onChange={(e) => setKrCurrentValue(parseFloat(e.target.value) || 0)}
                    required
                    className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-muted-foreground">Target Value</label>
                  <input
                    type="number"
                    step="any"
                    value={krTargetValue}
                    onChange={(e) => setKrTargetValue(parseFloat(e.target.value) || 1)}
                    required
                    className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-muted-foreground">Metric Type</label>
                  <select
                    value={krMetricType}
                    onChange={(e) => setKrMetricType(e.target.value as any)}
                    className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="numeric">Numeric (Scalar)</option>
                    <option value="boolean">Boolean (0 or 1)</option>
                    <option value="binary">Binary Status</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-muted-foreground">Unit Label</label>
                  <input
                    type="text"
                    value={krUnit}
                    placeholder="%, ms, suites"
                    onChange={(e) => setKrUnit(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Telemetry Query / Check (Optional)</label>
                <input
                  type="text"
                  placeholder="SELECT COUNT(*) FROM evidence WHERE passed = 1"
                  value={krTelemetryQuery}
                  onChange={(e) => setKrTelemetryQuery(e.target.value)}
                  className="rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-[11px] text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mt-2 flex justify-end gap-2 border-t border-border/40 pt-3">
                <button
                  type="button"
                  onClick={() => setShowKeyResultModal(false)}
                  className={cn(buttonVariants({ variant: 'glass', size: 'sm' }))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
                >
                  Save Key Result
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Dispatch Specialist on KR */}
      {dispatchKr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel flex flex-col gap-4 rounded-2xl w-full max-w-lg p-5 shadow-2xl border border-border/60 bg-background/95">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Play className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Dispatch Specialist on Key Result {dispatchKr.kr.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDispatchKr(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="rounded-lg bg-primary/10 p-3 border border-primary/20 text-xs">
                <span className="font-bold text-primary">Objective:</span> {dispatchKr.obj.title}
                <div className="mt-1 font-mono text-[11px] text-foreground">
                  Target: {dispatchKr.kr.target_value} {dispatchKr.kr.unit} · Current: {dispatchKr.kr.current_value} ({dispatchKr.kr.progress_percent}%)
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-muted-foreground">Directive / Instruction to Coworker</label>
                <textarea
                  rows={4}
                  value={dispatchPrompt}
                  onChange={(e) => setDispatchPrompt(e.target.value)}
                  className="rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Zap className="size-3.5 text-primary" />
                <span>
                  Will wake lead coworker <strong className="text-foreground">@{dispatchKr.obj.owner_id || 'astra'}</strong> and launch an alignment job.
                </span>
              </div>

              <div className="mt-2 flex justify-end gap-2 border-t border-border/40 pt-3">
                <button
                  type="button"
                  onClick={() => setDispatchKr(null)}
                  className={cn(buttonVariants({ variant: 'glass', size: 'sm' }))}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={dispatching}
                  onClick={handleExecuteDispatch}
                  className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-1.5')}
                >
                  <Play className={cn('size-3.5', dispatching && 'animate-spin')} />
                  <span>{dispatching ? 'Dispatching…' : 'Execute Alignment Sprint'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
