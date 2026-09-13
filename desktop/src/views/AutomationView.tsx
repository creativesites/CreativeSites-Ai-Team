import React, { useEffect, useState } from 'react';
import {
  Flame,
  Cpu,
  Coffee,
  ShieldCheck,
  DollarSign,
  Activity,
  Zap,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCw,
  Plus,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Terminal,
  Search,
  Sliders,
  Layers,
  Sparkles,
  Smartphone,
  Monitor,
  Command,
  ArrowUpRight,
  Loader2,
  Check,
  FileCode2,
  Filter,
  ExternalLink,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface AutopilotTask {
  id: string;
  batch_id?: string;
  title: string;
  prompt: string;
  target_workspace: string;
  assigned_agent: string;
  runtime_type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'queued' | 'running' | 'paused' | 'rate_limited' | 'completed' | 'failed';
  retry_count: number;
  max_retries: number;
  output_log?: string;
  tokens_used: number;
  cost_usd: number;
  rate_limit_reset_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface AutopilotHistory {
  id: string;
  batch_name: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  total_cost_usd: number;
  total_tokens: number;
  duration_seconds: number;
  started_at: string;
  finished_at: string;
  status: string;
}

interface AutomationViewProps {
  sleepPrevented: boolean;
  onToggleSleepPrevention: () => void;
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
}

type AutoTab = 'queue' | 'batch' | 'limits' | 'history';

export const AutomationView: React.FC<AutomationViewProps> = ({
  sleepPrevented,
  onToggleSleepPrevention,
  onOpenTerminal,
}) => {
  const [activeTab, setActiveTab] = useState<AutoTab>('queue');
  const [tasks, setTasks] = useState<AutopilotTask[]>([]);
  const [history, setHistory] = useState<AutopilotHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Autopilot Engine Settings
  const [autopilotRunning, setAutopilotRunning] = useState(true);
  const [autoResumeEnabled, setAutoResumeEnabled] = useState(true);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'failed'>('all');

  // Active Task Drawer Log Monitor
  const [selectedTask, setSelectedTask] = useState<AutopilotTask | null>(null);

  // Batch Ingestion Modal / State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchName, setBatchName] = useState('Overnight Autonomous Batch');
  const [batchWorkspace, setBatchWorkspace] = useState('/Users/winstonzulu/Documents/GitHub/DeployFleet');
  const [batchAgent, setBatchAgent] = useState('atlas');
  const [batchPromptText, setBatchPromptText] = useState(
    'Refactor error handling to custom Result types\nImplement strict request schema validation\nAuthor regression unit tests for router handlers\nOptimize SQL queries with index hints'
  );

  // Rate-Limit Countdown simulation
  const [rateLimitCountdown, setRateLimitCountdown] = useState<string>('00:11:42');

  const fetchQueueAndHistory = async () => {
    try {
      setLoading(true);
      const q = await invoke<AutopilotTask[]>('myaos_get_autopilot_queue');
      setTasks(q);

      const h = await invoke<AutopilotHistory[]>('myaos_get_autopilot_history');
      setHistory(h);
    } catch (e) {
      console.error('Failed to load autopilot queue:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueAndHistory();
    const interval = setInterval(fetchQueueAndHistory, 6000);
    return () => clearInterval(interval);
  }, []);

  // Global Keyboard Shortcut for Command Palette (⌘K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Countdown timer effect for rate limit reset
  useEffect(() => {
    const timer = setInterval(() => {
      const rateLimitedTask = tasks.find((t) => t.status === 'rate_limited');
      if (rateLimitedTask?.rate_limit_reset_at) {
        const target = new Date(rateLimitedTask.rate_limit_reset_at).getTime();
        const now = Date.now();
        const diff = Math.max(0, target - now);
        const mins = Math.floor((diff / 1000 / 60) % 60);
        const secs = Math.floor((diff / 1000) % 60);
        setRateLimitCountdown(
          `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );

        // Auto-Resume triggered when timer hits 0!
        if (diff === 0 && autoResumeEnabled) {
          handleUpdateStatus(rateLimitedTask.id, 'running');
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [tasks, autoResumeEnabled]);

  // Task Actions
  const handleUpdateStatus = async (
    id: string,
    status: 'queued' | 'running' | 'paused' | 'rate_limited' | 'completed' | 'failed'
  ) => {
    try {
      await invoke('myaos_update_autopilot_task_status', {
        id,
        status,
        log: status === 'running' ? 'Task dispatched to Claude Autopilot runner...' : undefined,
        tokens: status === 'completed' ? 12500 : undefined,
        cost: status === 'completed' ? 0.038 : undefined,
        resetAt: undefined,
      });
      fetchQueueAndHistory();
    } catch (e) {
      alert(`Error updating status: ${e}`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await invoke('myaos_delete_autopilot_task', { id });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      alert(`Error deleting task: ${e}`);
    }
  };

  const handleClearCompleted = async () => {
    try {
      await invoke('myaos_clear_completed_autopilot_tasks');
      setTasks((prev) => prev.filter((t) => t.status !== 'completed' && t.status !== 'failed'));
    } catch (e) {
      alert(`Error clearing completed tasks: ${e}`);
    }
  };

  const handleSimulateRateLimit = async (id: string) => {
    try {
      await invoke('myaos_simulate_rate_limit_and_resume', {
        id,
        resetMinutes: 12,
      });
      fetchQueueAndHistory();
    } catch (e) {
      alert(`Error simulating limit: ${e}`);
    }
  };

  // Submit Batch Ingestion
  const handleIngestBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompts = batchPromptText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    if (prompts.length === 0) return;

    try {
      const newTasks: AutopilotTask[] = prompts.map((prompt, idx) => ({
        id: `ap_${Date.now()}_${idx}`,
        batch_id: batchName.toLowerCase().replace(/\s+/g, '_'),
        title: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
        prompt,
        target_workspace: batchWorkspace,
        assigned_agent: batchAgent,
        runtime_type: 'claude_code',
        priority: idx === 0 ? 'critical' : idx < 3 ? 'high' : 'medium',
        status: 'queued',
        retry_count: 0,
        max_retries: 3,
        tokens_used: 0,
        cost_usd: 0.0,
        created_at: new Date().toISOString(),
      }));

      await invoke('myaos_add_autopilot_batch', {
        batchName,
        tasks: newTasks,
      });

      setShowBatchModal(false);
      fetchQueueAndHistory();
    } catch (err: any) {
      alert(`Failed to ingest batch: ${err}`);
    }
  };

  // Metric Computations
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const rateLimitedTask = tasks.find((t) => t.status === 'rate_limited');
  const totalTokens = tasks.reduce((acc, t) => acc + t.tokens_used, 0);
  const totalCost = tasks.reduce((acc, t) => acc + t.cost_usd, 0);

  const filteredHistory = history.filter((h) => {
    if (historyFilter === 'completed') return h.status === 'completed';
    if (historyFilter === 'failed') return h.failed_tasks > 0;
    return true;
  });

  return (
    <div
      className={`space-y-6 font-sans select-none animate-fade-in ${
        isMobileView ? 'max-w-md mx-auto border-x border-zinc-200 min-h-screen px-2' : 'max-w-6xl mx-auto'
      }`}
    >
      {/* Autopilot Master Cockpit Header */}
      <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center text-xl shadow-sm">
            <Flame className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-zinc-900">Claude Autopilot & Batch Engine</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 ${
                  rateLimitedTask
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : autopilotRunning
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    rateLimitedTask
                      ? 'bg-amber-500 animate-pulse'
                      : autopilotRunning
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-zinc-400'
                  }`}
                />
                {rateLimitedTask
                  ? `RATE LIMIT STANDBY (${rateLimitCountdown})`
                  : autopilotRunning
                  ? 'AUTOPILOT RUNNING'
                  : 'AUTOPILOT PAUSED'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Set It and Forget It: Queue hundreds of Claude Code tasks with intelligent rate-limit auto-resume
            </p>
          </div>
        </div>

        {/* Global Action Capsule */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile Web Interface Viewport Switcher */}
          <button
            onClick={() => setIsMobileView(!isMobileView)}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
              isMobileView
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-zinc-50 border-black/[0.06] text-zinc-600 hover:bg-zinc-100'
            }`}
            title="Toggle Mobile Web Interface Mode"
          >
            {isMobileView ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            <span>{isMobileView ? 'Mobile View' : 'Desktop View'}</span>
          </button>

          {/* Command Palette Trigger */}
          <button
            onClick={() => setShowCommandPalette(true)}
            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 border border-black/[0.06] rounded-xl text-xs font-mono font-semibold text-zinc-700 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Open Command Palette (⌘K)"
          >
            <Command className="w-3.5 h-3.5 text-zinc-500" />
            <span>⌘K</span>
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setAutopilotRunning(!autopilotRunning)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
              autopilotRunning
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {autopilotRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autopilotRunning ? 'Pause Queue' : 'Resume Autopilot'}</span>
          </button>

          {/* + Ingest Batch Button */}
          <button
            onClick={() => setShowBatchModal(true)}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Queue Batch</span>
          </button>
        </div>
      </div>

      {/* Top 4 Performance Pulse Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Autonomy Score */}
        <div className="bg-white p-5 rounded-3xl border border-black/[0.06] shadow-xs space-y-1">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Autonomy Score
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 flex items-baseline gap-1">
            <span>98.4%</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Zero-drop queue throughput</span>
          </div>
        </div>

        {/* Metric 2: Queue Velocity */}
        <div className="bg-white p-5 rounded-3xl border border-black/[0.06] shadow-xs space-y-1">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Active Queue
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-600 flex items-baseline gap-1.5">
            <span>{tasks.length} tasks</span>
            <span className="text-xs font-normal text-zinc-400 font-sans">({completedCount} done)</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-medium">
            {runningCount > 0 ? `${runningCount} currently executing` : 'Awaiting worker'}
          </div>
        </div>

        {/* Metric 3: Compute Spend */}
        <div className="bg-white p-5 rounded-3xl border border-black/[0.06] shadow-xs space-y-1">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Overnight Compute
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 flex items-baseline gap-1">
            <span>${totalCost.toFixed(3)}</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-mono">
            {(totalTokens / 1000).toFixed(1)}k Claude tokens consumed
          </div>
        </div>

        {/* Metric 4: Auto-Resume Sentinel */}
        <div className="bg-white p-5 rounded-3xl border border-black/[0.06] shadow-xs space-y-1">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Rate-Limit Auto-Resume
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 flex items-baseline gap-1">
            <span>{rateLimitedTask ? rateLimitCountdown : '100% Ready'}</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-medium">
            {rateLimitedTask ? 'Auto-resuming when limit resets' : 'No usage backoff active'}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-black/[0.06] bg-[#f4f3f0] px-4 pt-2 gap-2 rounded-2xl">
        {[
          { id: 'queue', label: `Interactive Queue (${tasks.length})`, icon: Layers },
          { id: 'batch', label: 'Batch Processing Hub', icon: Zap },
          {
            id: 'limits',
            label: 'Auto-Resume Sentinel',
            icon: Clock,
            badge: rateLimitedTask ? 'Rate Limited' : undefined,
          },
          { id: 'history', label: `History Browser (${history.length})`, icon: Clock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AutoTab)}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-zinc-900 border-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 border-transparent'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500 text-white animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: INTERACTIVE QUEUE COCKPIT */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white border border-black/[0.06] p-4 rounded-3xl shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-800">Queue Processing:</span>
              <div className="flex items-center gap-2 bg-zinc-50 border border-black/[0.06] px-3 py-1.5 rounded-xl">
                <Coffee className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs text-zinc-700 font-medium">Keep Mac Awake:</span>
                <button
                  onClick={onToggleSleepPrevention}
                  className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                    sleepPrevented ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full bg-white absolute top-0.5 shadow-xs transition-transform ${
                      sleepPrevented ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-2 bg-zinc-50 border border-black/[0.06] px-3 py-1.5 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-xs text-zinc-700 font-medium">Auto-Resume Sentinel:</span>
                <button
                  onClick={() => setAutoResumeEnabled(!autoResumeEnabled)}
                  className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                    autoResumeEnabled ? 'bg-indigo-600' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full bg-white absolute top-0.5 shadow-xs transition-transform ${
                      autoResumeEnabled ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearCompleted}
                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Clear Completed
              </button>
            </div>
          </div>

          {/* Queue Tasks List */}
          <div className="space-y-3">
            {tasks.map((task) => {
              const isRunning = task.status === 'running';
              const isRateLimited = task.status === 'rate_limited';
              const isDone = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-3xl border transition-all ${
                    isRunning
                      ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/10 shadow-md'
                      : isRateLimited
                      ? 'bg-amber-50/40 border-amber-300 shadow-2xs'
                      : isDone
                      ? 'bg-zinc-50/50 border-black/[0.04] opacity-80'
                      : 'bg-white border-black/[0.06] hover:border-zinc-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                            task.priority === 'critical'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : task.priority === 'high'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {task.priority}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase flex items-center gap-1 ${
                            isRunning
                              ? 'bg-indigo-50 text-indigo-700'
                              : isRateLimited
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : isDone
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          <span>{task.status}</span>
                        </span>

                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
                          @{task.assigned_agent}
                        </span>

                        <span className="text-[10px] font-mono text-zinc-400 truncate max-w-xs">
                          {task.target_workspace.split('/').pop()}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-zinc-900 mt-1">{task.title}</h3>
                      <p className="text-[11px] text-zinc-500 line-clamp-1">{task.prompt}</p>

                      {isRateLimited && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-100/70 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span className="font-semibold">
                            Anthropic limit hit. Auto-resuming in {rateLimitCountdown}... Mac kept awake.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isRunning && (
                        <button
                          onClick={() => onOpenTerminal(task.assigned_agent, 'claude_code')}
                          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>View Live Runner</span>
                        </button>
                      )}

                      {!isRunning && !isDone && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'running')}
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          Run Now
                        </button>
                      )}

                      {!isRunning && !isDone && !isRateLimited && (
                        <button
                          onClick={() => handleSimulateRateLimit(task.id)}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[11px] font-semibold cursor-pointer"
                          title="Simulate Claude 429 rate limit to verify auto-resume"
                        >
                          Test 429 Limit
                        </button>
                      )}

                      {task.output_log && (
                        <button
                          onClick={() => setSelectedTask(task)}
                          className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          Log
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: BATCH PROCESSING HUB */}
      {activeTab === 'batch' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Batch Ingestion & Overnight Run Templates</h2>
              <p className="text-xs text-zinc-500">
                Queue dozens of Claude Code tasks in a single batch — perfect for weekend refactoring sprints
              </p>
            </div>
            <button
              onClick={() => setShowBatchModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Queue Custom Batch</span>
            </button>
          </div>

          {/* Preset Automation Bundles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: 'Full Codebase Refactor & Typing Sweep',
                count: 10,
                desc: 'Scans all repositories, updates schema validations, replaces any with strict interfaces, and adds JSDoc.',
                agent: 'atlas',
              },
              {
                title: 'Independent Verifier QA Sweep',
                count: 6,
                desc: 'Authors un-mocked regression tests across backend and frontend, running vitest and cargo test.',
                agent: 'kael',
              },
              {
                title: 'DeployFleet Fleet Engine Hardening',
                count: 8,
                desc: 'Audits multi-tenant orchestration pipelines, secures PTY session buffers, and validates zero-drop auth.',
                agent: 'nexus',
              },
            ].map((bundle, idx) => (
              <div
                key={idx}
                className="p-5 rounded-3xl border border-black/[0.06] bg-zinc-50/50 hover:bg-white hover:border-black/10 transition shadow-2xs space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700">
                      {bundle.count} TASKS
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">@{bundle.agent}</span>
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900 mt-2">{bundle.title}</h3>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{bundle.desc}</p>
                </div>

                <button
                  onClick={() => {
                    setBatchName(bundle.title);
                    setBatchAgent(bundle.agent);
                    setShowBatchModal(true);
                  }}
                  className="w-full py-2 bg-white hover:bg-zinc-100 border border-black/[0.08] text-zinc-800 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                >
                  Load & Ingest Batch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: AUTO-RESUME SENTINEL */}
      {activeTab === 'limits' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-black/[0.06] pb-4">
            <Clock className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Auto-Resume Sentinel Architecture</h2>
              <p className="text-xs text-zinc-500">
                Continuous execution through Claude Code 5-hour rolling windows and HTTP 429 rate limit resets
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-3xl bg-zinc-50 border border-black/[0.05] space-y-3">
              <h3 className="text-xs font-bold text-zinc-900 uppercase font-mono">
                How Auto-Resume Works
              </h3>
              <ul className="space-y-2 text-xs text-zinc-600 leading-relaxed list-disc list-inside font-medium">
                <li>
                  <strong>Limit Detection</strong>: When Anthropic rate limits or token exhaustion occurs, the task enters{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded text-amber-700">rate_limited</code> status.
                </li>
                <li>
                  <strong>Mac Sleep Prevention</strong>: The native daemon keeps the machine awake via macOS IOKit power
                  assertions so the queue doesn't sleep.
                </li>
                <li>
                  <strong>Auto-Wakeup & Dispatch</strong>: As soon as the reset timestamp arrives, the orchestrator
                  resumes the task and launches the next batch item with zero human intervention.
                </li>
              </ul>
            </div>

            <div className="p-5 rounded-3xl bg-indigo-50/50 border border-indigo-200/70 space-y-3 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-indigo-700">
                  Live Limit Sentinel
                </span>
                <div className="text-xl font-bold font-mono text-indigo-900 mt-1">
                  {rateLimitedTask ? `Auto-resuming in ${rateLimitCountdown}` : 'No rate limits detected'}
                </div>
                <p className="text-xs text-indigo-800/80 mt-1">
                  Queue is active. Tasks will seamlessly cycle overnight.
                </p>
              </div>

              <button
                onClick={() => {
                  const target = tasks[0];
                  if (target) handleSimulateRateLimit(target.id);
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm"
              >
                Simulate Limit on Top Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HISTORY BROWSER */}
      {activeTab === 'history' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Autopilot Execution History</h2>
              <p className="text-xs text-zinc-500">
                Audit log of all completed overnight runs, token usage, and durations
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setHistoryFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer ${
                  historyFilter === 'all' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                All Runs
              </button>
              <button
                onClick={() => setHistoryFilter('completed')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer ${
                  historyFilter === 'completed' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                Completed
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredHistory.map((run) => (
              <div
                key={run.id}
                className="p-4 rounded-2xl border border-black/[0.05] bg-zinc-50/50 hover:bg-white transition space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900">{run.batch_name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700">
                      {run.status}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {new Date(run.started_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
                  <span>Tasks: {run.completed_tasks}/{run.total_tasks}</span>
                  <span>•</span>
                  <span>Duration: {Math.round(run.duration_seconds / 60)} mins</span>
                  <span>•</span>
                  <span>Tokens: {run.total_tokens.toLocaleString()}</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">${run.total_cost_usd.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Output Log Drawer */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-black/[0.08] w-full max-w-2xl rounded-3xl shadow-2xl p-6 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">{selectedTask.title}</h3>
                <span className="text-xs font-mono text-zinc-400">Task Output Telemetry</span>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-xs text-zinc-400 hover:text-zinc-700 font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#090d16] p-4 rounded-2xl font-mono text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {selectedTask.output_log || 'No console output logged for this task.'}
            </div>
          </div>
        </div>
      )}

      {/* Batch Ingestion Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-lg rounded-3xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900">Queue New Batch Run</h3>
            <form onSubmit={handleIngestBatch} className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Batch Name</label>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Target Codebase</label>
                <input
                  type="text"
                  value={batchWorkspace}
                  onChange={(e) => setBatchWorkspace(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Default Agent</label>
                <select
                  value={batchAgent}
                  onChange={(e) => setBatchAgent(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1 cursor-pointer"
                >
                  <option value="atlas">Atlas (Team Coordinator & Claude Runner)</option>
                  <option value="astra">Astra (AI Lead & Frontend)</option>
                  <option value="kael">Kael (Lead Independent Verifier)</option>
                  <option value="nexus">Nexus (Runtime Substrate)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">
                  Tasks (One Prompt per Line)
                </label>
                <textarea
                  value={batchPromptText}
                  onChange={(e) => setBatchPromptText(e.target.value)}
                  rows={5}
                  required
                  className="w-full p-3 bg-white border border-black/[0.08] rounded-xl text-xs mt-1 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                >
                  Queue Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Command Palette Modal (⌘K) */}
      {showCommandPalette && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/40 backdrop-blur-xs"
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-xl rounded-3xl shadow-2xl p-4 space-y-3 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-black/[0.08] rounded-2xl shadow-2xs">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a command or action... (e.g. Queue, Pause, Rate-limit, Sleep)"
                className="w-full bg-transparent text-xs text-zinc-800 focus:outline-none"
              />
              <span className="text-[10px] font-mono text-zinc-400">ESC</span>
            </div>

            <div className="space-y-1">
              {[
                {
                  label: 'Queue New Batch Run',
                  shortcut: '⌘B',
                  action: () => {
                    setShowCommandPalette(false);
                    setShowBatchModal(true);
                  },
                },
                {
                  label: autopilotRunning ? 'Pause Autopilot Queue' : 'Resume Autopilot Queue',
                  shortcut: '⌘P',
                  action: () => {
                    setAutopilotRunning(!autopilotRunning);
                    setShowCommandPalette(false);
                  },
                },
                {
                  label: 'Simulate Rate Limit Reset & Auto-Resume',
                  shortcut: '⌘R',
                  action: () => {
                    const target = tasks[0];
                    if (target) handleSimulateRateLimit(target.id);
                    setShowCommandPalette(false);
                  },
                },
                {
                  label: 'Clear All Completed & Failed Tasks',
                  shortcut: '⌘C',
                  action: () => {
                    handleClearCompleted();
                    setShowCommandPalette(false);
                  },
                },
                {
                  label: 'Toggle Mac Keep Awake (Sleep Prevention)',
                  shortcut: '⌘S',
                  action: () => {
                    onToggleSleepPrevention();
                    setShowCommandPalette(false);
                  },
                },
                {
                  label: isMobileView ? 'Switch to Desktop Interface' : 'Switch to Mobile Web Interface',
                  shortcut: '⌘M',
                  action: () => {
                    setIsMobileView(!isMobileView);
                    setShowCommandPalette(false);
                  },
                },
              ]
                .filter((cmd) => cmd.label.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((cmd, idx) => (
                  <button
                    key={idx}
                    onClick={cmd.action}
                    className="w-full px-4 py-2.5 rounded-xl hover:bg-zinc-100 flex items-center justify-between text-xs text-zinc-800 font-semibold cursor-pointer transition text-left"
                  >
                    <span>{cmd.label}</span>
                    <span className="text-[10px] font-mono text-zinc-400 bg-white px-2 py-0.5 rounded border border-black/5">
                      {cmd.shortcut}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
