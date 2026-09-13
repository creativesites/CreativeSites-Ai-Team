import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Target,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowUpRight,
  Activity,
  Layers,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  X,
  Check,
  Zap,
} from 'lucide-react';

const CircularProgressDial: React.FC<{ percentage: number; size?: number; strokeWidth?: number }> = ({
  percentage,
  size = 48,
  strokeWidth = 4,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-zinc-200"
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
          className="text-indigo-600 transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono text-zinc-700">
        {Math.round(percentage)}%
      </span>
    </div>
  );
};

export interface OkrObjective {
  id: string;
  title: string;
  description?: string;
  owner_id?: string;
  quarter: string;
  progress_percent: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OkrKeyResult {
  id: string;
  objective_id: string;
  title: string;
  metric_type: string;
  current_value: number;
  target_value: number;
  unit?: string;
  progress_percent: number;
  telemetry_query?: string;
  created_at: string;
  updated_at: string;
}

interface OKRIntelligenceViewProps {
  onSpawnClaude: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  currentWorkspace: string;
}

export const OKRIntelligenceView: React.FC<OKRIntelligenceViewProps> = ({
  onSpawnClaude,
  currentWorkspace,
}) => {
  const [objectives, setObjectives] = useState<OkrObjective[]>([]);
  const [keyResults, setKeyResults] = useState<OkrKeyResult[]>([]);
  const [expandedObjectives, setExpandedObjectives] = useState<Record<string, boolean>>({ OBJ_1: true, OBJ_2: true });
  const [loading, setLoading] = useState(false);
  const [realityHealthScore, setRealityHealthScore] = useState<number>(94);
  const [lastAuditTs, setLastAuditTs] = useState<string>('Just now');

  // Filters
  const [selectedQuarter, setSelectedQuarter] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Modals state
  const [showObjectiveModal, setShowObjectiveModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<OkrObjective | null>(null);

  const [showKeyResultModal, setShowKeyResultModal] = useState(false);
  const [targetObjectiveIdForKr, setTargetObjectiveIdForKr] = useState<string>('');
  const [editingKeyResult, setEditingKeyResult] = useState<OkrKeyResult | null>(null);

  // Form states for Objective
  const [objId, setObjId] = useState('');
  const [objTitle, setObjTitle] = useState('');
  const [objDesc, setObjDesc] = useState('');
  const [objOwner, setObjOwner] = useState('astra');
  const [objQuarter, setObjQuarter] = useState('Q3-2026');
  const [objStatus, setObjStatus] = useState('on_track');

  // Form states for Key Result
  const [krId, setKrId] = useState('');
  const [krTitle, setKrTitle] = useState('');
  const [krMetricType, setKrMetricType] = useState('percentage');
  const [krCurrentValue, setKrCurrentValue] = useState<number>(0);
  const [krTargetValue, setKrTargetValue] = useState<number>(100);
  const [krUnit, setKrUnit] = useState('%');
  const [krTelemetryQuery, setKrTelemetryQuery] = useState('');

  const loadOkrs = async () => {
    try {
      const res = await invoke<[OkrObjective[], OkrKeyResult[]]>('myaos_list_okrs');
      if (res) {
        setObjectives(res[0] || []);
        setKeyResults(res[1] || []);
      }
    } catch (e) {
      console.warn('Failed to load OKRs:', e);
    }
  };

  useEffect(() => {
    loadOkrs();
  }, []);

  const triggerRealitySync = async () => {
    setLoading(true);
    try {
      const audit = await invoke<any>('myaos_run_reality_audit', { autoHeal: true });
      if (audit) {
        setRealityHealthScore(audit.health_score);
        setLastAuditTs(new Date().toLocaleTimeString());
        await loadOkrs();
      }
    } catch (e) {
      console.error('Reality audit failed:', e);
    } finally {
      setLoading(false);
    }
  };

  // Objective CRUD Handlers
  const handleOpenNewObjectiveModal = () => {
    const nextNum = objectives.length + 1;
    setEditingObjective(null);
    setObjId(`OBJ_${nextNum}`);
    setObjTitle('');
    setObjDesc('');
    setObjOwner('astra');
    setObjQuarter('Q3-2026');
    setObjStatus('on_track');
    setShowObjectiveModal(true);
  };

  const handleOpenEditObjectiveModal = (obj: OkrObjective) => {
    setEditingObjective(obj);
    setObjId(obj.id);
    setObjTitle(obj.title);
    setObjDesc(obj.description || '');
    setObjOwner(obj.owner_id || 'astra');
    setObjQuarter(obj.quarter);
    setObjStatus(obj.status);
    setShowObjectiveModal(true);
  };

  const handleSaveObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objTitle.trim()) return;

    try {
      const payload: OkrObjective = {
        id: objId.trim(),
        title: objTitle.trim(),
        description: objDesc.trim() || undefined,
        owner_id: objOwner,
        quarter: objQuarter,
        progress_percent: editingObjective ? editingObjective.progress_percent : 0,
        status: objStatus,
        created_at: editingObjective ? editingObjective.created_at : '',
        updated_at: '',
      };
      await invoke('myaos_save_okr_objective', { objective: payload });
      setShowObjectiveModal(false);
      await loadOkrs();
    } catch (err) {
      alert(`Failed to save objective: ${err}`);
    }
  };

  const handleDeleteObjective = async (id: string) => {
    if (!confirm(`Are you sure you want to delete objective ${id} and all its measured key results?`)) return;
    try {
      await invoke('myaos_delete_okr_objective', { id });
      await loadOkrs();
    } catch (err) {
      alert(`Failed to delete objective: ${err}`);
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
    if (!krTitle.trim()) return;

    try {
      const payload: OkrKeyResult = {
        id: krId.trim(),
        objective_id: targetObjectiveIdForKr,
        title: krTitle.trim(),
        metric_type: krMetricType,
        current_value: Number(krCurrentValue),
        target_value: Number(krTargetValue),
        unit: krUnit.trim() || undefined,
        progress_percent: 0, // backend auto-computes
        telemetry_query: krTelemetryQuery.trim() || undefined,
        created_at: editingKeyResult ? editingKeyResult.created_at : '',
        updated_at: '',
      };
      await invoke('myaos_save_okr_key_result', { keyResult: payload });
      setShowKeyResultModal(false);
      await loadOkrs();
    } catch (err) {
      alert(`Failed to save key result: ${err}`);
    }
  };

  const handleDeleteKeyResult = async (id: string) => {
    if (!confirm(`Are you sure you want to delete Key Result ${id}?`)) return;
    try {
      await invoke('myaos_delete_okr_key_result', { id });
      await loadOkrs();
    } catch (err) {
      alert(`Failed to delete key result: ${err}`);
    }
  };

  const handleUpdateKrProgress = async (krId: string, newVal: number) => {
    try {
      // Optimistic update
      setKeyResults((prev) =>
        prev.map((k) => (k.id === krId ? { ...k, current_value: newVal } : k))
      );
      await invoke('myaos_update_okr_progress', { krId, currentValue: newVal });
      await loadOkrs();
    } catch (err) {
      console.error('Failed to update KR progress:', err);
    }
  };

  // Filtered lists
  const filteredObjectives = objectives.filter((obj) => {
    if (selectedQuarter !== 'All' && obj.quarter !== selectedQuarter) return false;
    if (selectedStatus !== 'All' && obj.status !== selectedStatus) return false;
    return true;
  });

  const totalAvgProgress =
    objectives.length > 0
      ? Math.round(objectives.reduce((acc, o) => acc + o.progress_percent, 0) / objectives.length)
      : 0;

  return (
    <div className="h-full w-full bg-[#faf9f6] text-zinc-900 font-sans select-none flex flex-col p-4 space-y-4 overflow-y-auto">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/90 backdrop-blur-xl border border-zinc-200/80 p-5 rounded-3xl shadow-xs shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-zinc-900">Strategic OKRs & Team Goals</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                Q3-2026 Cycle
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/80 flex items-center gap-1">
                <Zap className="w-3 h-3 text-indigo-600" />
                Active in Agent Prompts
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Executive goal management, telemetry-linked key results, and direct agent execution mandates
            </p>
          </div>
        </div>

        {/* Executive Dials & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200/80 px-4 py-2 rounded-2xl shadow-2xs">
            <CircularProgressDial percentage={totalAvgProgress} size={48} strokeWidth={4} />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Overall Progress</div>
              <div className="text-sm font-bold text-zinc-800">{totalAvgProgress}% Complete</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200/80 px-4 py-2 rounded-2xl shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold font-mono text-xs">
              {realityHealthScore}%
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Reality Health</div>
              <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Substrate Truth
              </div>
            </div>
          </div>

          <button
            onClick={triggerRealitySync}
            disabled={loading}
            className="h-10 px-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-zinc-200/80 shadow-2xs"
            title="Reconcile with evidence substrate"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reality Sync</span>
          </button>

          <button
            onClick={handleOpenNewObjectiveModal}
            className="h-10 px-4 bg-zinc-900 hover:bg-black text-white rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>New Objective</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 bg-white/70 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-zinc-200/70 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-500">Quarter:</span>
            {['All', 'Q3-2026', 'Q4-2026'].map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
                  selectedQuarter === q
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-200" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-500">Status:</span>
            {[
              { id: 'All', label: 'All' },
              { id: 'on_track', label: 'On Track' },
              { id: 'at_risk', label: 'At Risk' },
              { id: 'behind', label: 'Behind' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStatus(s.id)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
                  selectedStatus === s.id
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <span className="text-[11px] font-mono text-zinc-400">
          Showing {filteredObjectives.length} of {objectives.length} Strategic Objectives
        </span>
      </div>

      {/* OKR Cascade Hierarchy */}
      <div className="space-y-4">
        {filteredObjectives.map((obj) => {
          const krs = keyResults.filter((k) => k.objective_id === obj.id);
          const isExpanded = !!expandedObjectives[obj.id];

          return (
            <div
              key={obj.id}
              className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden transition-all duration-300"
            >
              {/* Objective Header */}
              <div className="p-5 flex items-center justify-between gap-4 border-b border-zinc-100">
                <div
                  onClick={() =>
                    setExpandedObjectives((prev) => ({ ...prev, [obj.id]: !prev[obj.id] }))
                  }
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <span className="p-1 rounded-lg bg-zinc-100 text-zinc-500">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>

                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-900 text-white">
                    {obj.id}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-zinc-900 truncate">{obj.title}</h3>
                      <span
                        className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.2 rounded ${
                          obj.status === 'on_track'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : obj.status === 'at_risk'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {obj.status.replace('_', ' ')}
                      </span>
                    </div>
                    {obj.description && (
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{obj.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Lead: @{obj.owner_id || 'team'}
                  </span>

                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-zinc-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, obj.progress_percent))}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-zinc-800 w-8 text-right">
                      {obj.progress_percent}%
                    </span>
                  </div>

                  {/* Objective Actions */}
                  <div className="flex items-center gap-1 border-l border-zinc-200 pl-2">
                    <button
                      onClick={() => handleOpenNewKeyResultModal(obj.id)}
                      className="p-1.5 hover:bg-indigo-50 text-zinc-400 hover:text-indigo-600 rounded-xl transition cursor-pointer"
                      title="Add Key Result"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenEditObjectiveModal(obj)}
                      className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-xl transition cursor-pointer"
                      title="Edit Objective"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteObjective(obj.id)}
                      className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-xl transition cursor-pointer"
                      title="Delete Objective"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Key Results List */}
              {isExpanded && (
                <div className="p-5 bg-zinc-50/30 space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                    <span>Measured Key Results ({krs.length})</span>
                    <button
                      onClick={() => handleOpenNewKeyResultModal(obj.id)}
                      className="text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1 normal-case font-sans text-xs font-semibold"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Key Result</span>
                    </button>
                  </div>

                  {krs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-400 bg-white rounded-2xl border border-dashed border-zinc-200">
                      No key results added yet. Click "+ Add Key Result" to start measuring progress.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {krs.map((kr) => (
                        <div
                          key={kr.id}
                          className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-2xs space-y-2.5 hover:border-indigo-300 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                              {kr.id}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono font-bold text-indigo-700">
                                {kr.current_value} / {kr.target_value} {kr.unit || ''}
                              </span>
                              <button
                                onClick={() => handleOpenEditKeyResultModal(kr)}
                                className="p-1 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-md transition cursor-pointer ml-1"
                                title="Edit KR"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteKeyResult(kr.id)}
                                className="p-1 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-md transition cursor-pointer"
                                title="Delete KR"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <h4 className="text-xs font-semibold text-zinc-800 leading-snug">{kr.title}</h4>

                          {/* Progress meter */}
                          <div className="space-y-1">
                            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, kr.progress_percent))}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                              <span>Telemetry Linked</span>
                              <span className="font-bold text-zinc-700">{kr.progress_percent}%</span>
                            </div>
                          </div>

                          {/* Live Interactive Progress Slider */}
                          <div className="pt-1 border-t border-zinc-100 flex items-center gap-2">
                            <span className="text-[10px] text-zinc-400 font-mono shrink-0">Adjust Value:</span>
                            <input
                              type="range"
                              min={0}
                              max={kr.target_value || 100}
                              step={kr.metric_type === 'percentage' ? 1 : 0.5}
                              value={kr.current_value}
                              onChange={(e) => handleUpdateKrProgress(kr.id, parseFloat(e.target.value))}
                              className="w-full accent-indigo-600 h-1 bg-zinc-200 rounded-lg cursor-pointer"
                            />
                            <span className="text-[11px] font-mono font-bold text-zinc-700 shrink-0 w-10 text-right">
                              {kr.current_value}
                            </span>
                          </div>

                          {/* 1-Click Action */}
                          <button
                            onClick={() =>
                              onSpawnClaude(
                                obj.owner_id,
                                currentWorkspace,
                                true,
                                `Executing alignment sprint on OKR Key Result ${kr.id}: "${kr.title}". Target: ${kr.target_value} ${kr.unit || ''}.`
                              )
                            }
                            className="w-full mt-2 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Play className="w-3 h-3 text-indigo-600" />
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
        })}
      </div>

      {/* Create / Edit Objective Modal */}
      {showObjectiveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-card-entry">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  {editingObjective ? 'Edit Strategic Objective' : 'New Strategic Objective'}
                </h3>
              </div>
              <button
                onClick={() => setShowObjectiveModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveObjective} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Objective ID</label>
                <input
                  type="text"
                  required
                  value={objId}
                  onChange={(e) => setObjId(e.target.value)}
                  disabled={!!editingObjective}
                  className="w-full h-8 px-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 disabled:opacity-60"
                  placeholder="OBJ_3"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Objective Title</label>
                <input
                  type="text"
                  required
                  value={objTitle}
                  onChange={(e) => setObjTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400"
                  placeholder="e.g. Elevate Myavana Chatbot to Executive-Grade Quality"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Description & Scope</label>
                <textarea
                  rows={2}
                  value={objDesc}
                  onChange={(e) => setObjDesc(e.target.value)}
                  className="w-full p-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400 resize-none"
                  placeholder="Measurable focus, deliverables, and architecture alignment..."
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Lead Agent</label>
                  <select
                    value={objOwner}
                    onChange={(e) => setObjOwner(e.target.value)}
                    className="w-full h-8 px-2 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value="astra">Astra (AI Lead)</option>
                    <option value="atlas">Atlas (Platform)</option>
                    <option value="kael">Kael (QA Verifier)</option>
                    <option value="iris">Iris (Dashboard)</option>
                    <option value="vela">Vela (WordPress)</option>
                    <option value="lyra">Lyra (Mobile)</option>
                    <option value="nexus">Nexus (Runtime)</option>
                    <option value="sage">Sage (Architect)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Quarter</label>
                  <select
                    value={objQuarter}
                    onChange={(e) => setObjQuarter(e.target.value)}
                    className="w-full h-8 px-2 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value="Q3-2026">Q3-2026</option>
                    <option value="Q4-2026">Q4-2026</option>
                    <option value="Q1-2027">Q1-2027</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Status</label>
                  <select
                    value={objStatus}
                    onChange={(e) => setObjStatus(e.target.value)}
                    className="w-full h-8 px-2 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="behind">Behind</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowObjectiveModal(false)}
                  className="px-3.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
                >
                  {editingObjective ? 'Save Changes' : 'Create Objective'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Key Result Modal */}
      {showKeyResultModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-card-entry">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  {editingKeyResult ? 'Edit Key Result' : `Add Key Result to ${targetObjectiveIdForKr}`}
                </h3>
              </div>
              <button
                onClick={() => setShowKeyResultModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveKeyResult} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Key Result ID</label>
                <input
                  type="text"
                  required
                  value={krId}
                  onChange={(e) => setKrId(e.target.value)}
                  disabled={!!editingKeyResult}
                  className="w-full h-8 px-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 disabled:opacity-60"
                  placeholder="KR_1_3"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Key Result Title</label>
                <input
                  type="text"
                  required
                  value={krTitle}
                  onChange={(e) => setKrTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400"
                  placeholder="e.g. 100% of PTY turns audited by Lead Verifier"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Metric Type</label>
                  <select
                    value={krMetricType}
                    onChange={(e) => setKrMetricType(e.target.value)}
                    className="w-full h-8 px-2 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="numeric">Numeric</option>
                    <option value="currency">Currency ($)</option>
                    <option value="binary">Binary (Done/Not)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Current Value</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={krCurrentValue}
                    onChange={(e) => setKrCurrentValue(parseFloat(e.target.value) || 0)}
                    className="w-full h-8 px-2 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Target Value</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={krTargetValue}
                    onChange={(e) => setKrTargetValue(parseFloat(e.target.value) || 1)}
                    className="w-full h-8 px-2 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Unit Label</label>
                  <input
                    type="text"
                    value={krUnit}
                    onChange={(e) => setKrUnit(e.target.value)}
                    className="w-full h-8 px-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none"
                    placeholder="%, ms, tests, $"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Telemetry Query (Optional)</label>
                  <input
                    type="text"
                    value={krTelemetryQuery}
                    onChange={(e) => setKrTelemetryQuery(e.target.value)}
                    className="w-full h-8 px-2.5 mt-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none"
                    placeholder="SELECT COUNT(*) FROM..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowKeyResultModal(false)}
                  className="px-3.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
                >
                  {editingKeyResult ? 'Save Changes' : 'Add Key Result'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
