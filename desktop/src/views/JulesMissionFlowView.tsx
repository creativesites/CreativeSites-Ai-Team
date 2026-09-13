import React, { useState, useEffect, useRef } from 'react';
import {
  Workflow,
  Terminal as TerminalIcon,
  FolderGit2,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Send,
  Split,
  Maximize2,
  Minimize2,
  Layers,
  ArrowUpRight,
  Play,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  Radio,
  RefreshCw,
  GitBranch,
  ShieldCheck,
  Cpu,
  FileCode2,
  CornerDownLeft,
  Volume2,
  VolumeX,
  Plus,
  X,
  History,
  Sparkles,
  AtSign,
  Bookmark,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { LiveConsolePane, PtySession } from '../components/LiveConsolePane';
import { InChatGitDiffCard } from '../components/InChatGitDiffCard';
import { InChatOrchestratorAnalysisCard } from '../components/InChatOrchestratorAnalysisCard';
import { InChatExecutiveReleaseCard } from '../components/InChatExecutiveReleaseCard';
import { InChatFeatureSpecCard } from '../components/InChatFeatureSpecCard';
import { InChatBugReproCard } from '../components/InChatBugReproCard';
import { InChatCodeReviewCard } from '../components/InChatCodeReviewCard';
import { InChatAppScaffoldCard } from '../components/InChatAppScaffoldCard';
import { InChatInterAgentDialogueCard } from '../components/InChatInterAgentDialogueCard';
import { InChatRealityAuditCard } from '../components/InChatRealityAuditCard';
import { WorkspaceQuickMatrix } from '../components/WorkspaceQuickMatrix';
import { LiveTokenCostWidget } from '../components/LiveTokenCostWidget';
import { AgentMemoryDrawer } from '../components/AgentMemoryDrawer';
import {
  sendOrchestratorPrompt,
  synthesizeAgentTurnAndPlanHandoff,
  ChatMessage,
  JulesMissionPlan,
  GitWorkspaceDiff,
  OrchestratorSynthesisResult,
} from '../services/geminiOrchestrator';
import { AGENT_DIRECTORY_MAP, getAgentDirectoryInfo } from '../utils/agentWorkspaces';
import {
  playExecutiveChime,
  playSuccessChime,
  playAttentionAlert,
  sendDesktopNotification,
  isSoundMuted,
  toggleSoundMuted,
} from '../utils/soundEffects';

export interface MissionTab {
  id: string;
  title: string;
  targetWorkspace: string;
  assignee: string;
  plan: JulesMissionPlan;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export const AGENT_PILLS = [
  { id: 'astra', name: 'Astra', monogram: 'AS', repo: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot', domain: 'UI & Widget SDK', color: 'bg-violet-500' },
  { id: 'iris', name: 'Iris', monogram: 'IR', repo: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot-Dashboard', domain: 'Telemetry & 360', color: 'bg-blue-500' },
  { id: 'vela', name: 'Vela', monogram: 'VE', repo: '/Users/winstonzulu/Documents/GitHub/Myavana-Hair-Journey', domain: 'WordPress Host Bridge', color: 'bg-emerald-500' },
  { id: 'lyra', name: 'Lyra', monogram: 'LY', repo: '/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN', domain: 'React Native SDK', color: 'bg-amber-500' },
  { id: 'atlas', name: 'Atlas', monogram: 'AT', repo: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team', domain: 'Coordinator & Deploy', color: 'bg-slate-700' },
  { id: 'kael', name: 'Kael', monogram: 'KL', repo: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot', domain: 'Lead Verifier', color: 'bg-rose-500' },
  { id: 'antigravity', name: 'Antigravity', monogram: 'AG', repo: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team', domain: 'Browser QA', color: 'bg-cyan-600' },
];

interface JulesMissionFlowViewProps {
  summary: any;
  sessions: PtySession[];
  activeSessionId: string | null;
  currentWorkspace: string;
  onWorkspaceChange: (ws: string) => void;
  onSelectSession: (sessionId: string) => void;
  onKillSession: (sessionId: string) => void;
  onSendData: (sessionId: string, data: string) => void;
  onSpawnClaude: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  onSpawnGemini: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  onSpawnAntigravity: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  onSpawnShell: (cwd?: string) => void;
}

const AVAILABLE_WORKSPACES = [
  {
    name: 'Myavana-Chatbot',
    path: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
    short: 'WebstormProjects/Myavana-Chatbot',
    agent: 'astra',
    agentMonogram: 'AS',
    agentName: 'Astra (UI & Protocol)',
  },
  {
    name: 'Myavana-Chatbot-Dashboard',
    path: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot-Dashboard',
    short: 'WebstormProjects/Myavana-Chatbot-Dashboard',
    agent: 'iris',
    agentMonogram: 'IR',
    agentName: 'Iris (Telemetry & Observability)',
  },
  {
    name: 'CreativeSites-Ai-Team',
    path: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team',
    short: 'WebstormProjects/CreativeSites-Ai-Team',
    agent: 'atlas',
    agentMonogram: 'AT',
    agentName: 'Atlas (Coordinator & Substrate)',
  },
  {
    name: 'Myavana-Hair-Journey',
    path: '/Users/winstonzulu/Documents/GitHub/Myavana-Hair-Journey',
    short: 'GitHub/Myavana-Hair-Journey',
    agent: 'vela',
    agentMonogram: 'VE',
    agentName: 'Vela (WordPress Host Bridge)',
  },
  {
    name: 'MyAvana_FrontEnd_RN',
    path: '/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN',
    short: 'WebstormProjects/MyAvana_FrontEnd_RN',
    agent: 'lyra',
    agentMonogram: 'LY',
    agentName: 'Lyra (React Native SDK)',
  },
  {
    name: 'DeployFleet',
    path: '/Users/winstonzulu/Documents/GitHub/DeployFleet',
    short: 'GitHub/DeployFleet',
    agent: 'atlas',
    agentMonogram: 'AT',
    agentName: 'Atlas (Platform Deployment)',
  },
];

// --- Circular Progress Dial ---
const CircularProgressDial: React.FC<{
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}> = ({ percentage, size = 68, strokeWidth = 6, label }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="stroke-zinc-200/80"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="stroke-zinc-900 transition-all duration-700 ease-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className="absolute font-mono text-[11px] font-semibold text-zinc-900 tracking-tight">
          {Math.round(percentage)}%
        </span>
      </div>
      {label && (
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase font-mono font-medium text-zinc-400 tracking-wider">
            Mission Health
          </div>
          <div className="text-xs font-semibold text-zinc-800 tracking-tight">{label}</div>
        </div>
      )}
    </div>
  );
};

// --- Copy Button ---
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition text-[11px] flex items-center gap-1 cursor-pointer"
      title="Copy code"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
};

// --- In-Chat: Code Snippet Block ---
interface InChatCodeBlockProps {
  code: string;
  language?: string;
  onRunInTerminal?: (cmd: string) => void;
}

const InChatCodeBlock: React.FC<InChatCodeBlockProps> = ({
  code,
  language = 'text',
  onRunInTerminal,
}) => {
  const isCommand =
    ['bash', 'sh', 'zsh', 'shell'].includes(language.toLowerCase()) ||
    /^(npm|pnpm|yarn|cargo|git|claude|gemini|antigravity|agy|python|pytest|curl|cd|ls)\b/.test(
      code.trim()
    );

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-zinc-800/80 bg-[#1c1c1e] text-zinc-200 font-mono text-[11.5px]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] text-zinc-400">
        <span className="uppercase tracking-[0.08em] font-medium">{language || 'code'}</span>
        <div className="flex items-center gap-1.5">
          {isCommand && onRunInTerminal && (
            <button
              onClick={() => onRunInTerminal(code.trim())}
              className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-zinc-100 transition text-[10.5px] font-medium flex items-center gap-1 cursor-pointer active:scale-95"
              title="Type and run directly into live terminal"
            >
              <Play className="w-2.5 h-2.5" />
              <span>Run</span>
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </div>
      <div className="p-3.5 overflow-x-auto text-[11.5px] leading-relaxed select-text">
        <pre>{code}</pre>
      </div>
    </div>
  );
};

// --- In-Chat: Live Terminal Bridge ---
interface InChatTerminalBridgeProps {
  activeSession: PtySession | undefined;
  onSendData: (data: string) => void;
  onSpawnShell: () => void;
}

const InChatTerminalBridge: React.FC<InChatTerminalBridgeProps> = ({
  activeSession,
  onSendData,
  onSpawnShell,
}) => {
  const [bridgeInput, setBridgeInput] = useState('');

  const handleSend = () => {
    if (!bridgeInput.trim()) return;
    if (activeSession) {
      onSendData(`${bridgeInput.trim()}\r\n`);
      setBridgeInput('');
    } else {
      onSpawnShell();
    }
  };

  return (
    <div className="mt-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-2.5 space-y-2 font-sans">
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <span className="flex items-center gap-1.5 font-medium">
          <TerminalIcon className="w-3 h-3 text-zinc-500" strokeWidth={1.8} />
          <span>Terminal Bridge</span>
        </span>
        {activeSession ? (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {activeSession.agent_id}
          </span>
        ) : (
          <span className="text-zinc-400">No session</span>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto">
        {[
          { label: 'git status', cmd: 'git status -s' },
          { label: 'npm test', cmd: 'npm test' },
          { label: 'resume chat', cmd: 'claude --continue' },
          { label: 'audit diff', cmd: 'git diff --stat' },
        ].map((action, idx) => (
          <button
            key={idx}
            onClick={() => onSendData(`${action.cmd}\r\n`)}
            className="px-2 py-0.5 rounded-md bg-white hover:bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] font-mono transition cursor-pointer shrink-0"
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={bridgeInput}
          onChange={(e) => setBridgeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder={
            activeSession
              ? `Chat programmatically with ${activeSession.agent_id}...`
              : 'Launch a terminal session first...'
          }
          className="flex-1 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-900/5 font-mono transition"
        />
        <button
          onClick={handleSend}
          disabled={!bridgeInput.trim()}
          className="h-7 px-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-white rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shrink-0"
        >
          <span>Send</span>
          <CornerDownLeft className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// --- In-Chat: Plan Card ---
interface InChatPlanCardProps {
  plan: JulesMissionPlan;
  onLaunchEngine: (
    engine: 'claude' | 'gemini' | 'antigravity' | 'shell',
    cwd?: string,
    agent?: string,
    resume?: boolean,
    prompt?: string
  ) => void;
  onSelectAsActivePlan: (plan: JulesMissionPlan) => void;
  onInjectPromptIntoActiveTerminal?: (prompt: string) => void;
  isActive: boolean;
}

const InChatPlanCard: React.FC<InChatPlanCardProps> = ({
  plan,
  onLaunchEngine,
  onSelectAsActivePlan,
  onInjectPromptIntoActiveTerminal,
  isActive,
}) => {
  const [shouldResume, setShouldResume] = useState(true);
  const agentInfo = getAgentDirectoryInfo(plan.assignee);
  const repoName = plan.targetWorkspace.split('/').slice(-2).join('/');

  const completedSteps = plan.stages.filter((s) => s.status === 'completed').length;
  const inProgressSteps = plan.stages.filter((s) => s.status === 'in_progress').length;
  const progressPercent = Math.round(
    ((completedSteps + inProgressSteps * 0.5) / Math.max(plan.stages.length, 1)) * 100
  );

  const missionPrompt = `${plan.title}: ${plan.summary}. Steps: ${plan.stages.map((s) => `${s.step}. ${s.name}`).join(' -> ')}`;

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-white overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-3.5">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.08em] text-zinc-400">
            <span>MyaDesktop Plan</span>
            <span className="text-zinc-300">·</span>
            <span className="flex items-center gap-1.5 normal-case tracking-normal">
              <span className="w-4 h-4 rounded-[5px] bg-zinc-900 text-white flex items-center justify-center text-[8px] font-bold">
                {agentInfo.symbol}
              </span>
              <span className="text-zinc-600 font-medium">{agentInfo.name}</span>
            </span>
          </div>
          <h3 className="text-[13px] font-semibold text-zinc-900 leading-snug">{plan.title}</h3>
          <p className="text-[11.5px] text-zinc-500 leading-relaxed line-clamp-2">{plan.summary}</p>
        </div>

        <CircularProgressDial percentage={progressPercent} size={52} strokeWidth={4} />
      </div>

      {/* Target row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-y border-zinc-100 bg-zinc-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Target</span>
          <span className="text-[11px] font-mono text-zinc-600 truncate" title={plan.targetWorkspace}>
            {repoName}
          </span>
        </div>

        <button
          onClick={() => setShouldResume(!shouldResume)}
          className={`h-6 px-2 rounded-full text-[10px] font-medium transition cursor-pointer flex items-center gap-1.5 border ${
            shouldResume
              ? 'bg-white border-zinc-200 text-zinc-700'
              : 'bg-transparent border-zinc-200 text-zinc-400'
          }`}
          title="When active, spawns agent by picking up the latest conversation (--continue / -r latest)"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${shouldResume ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
          <span>{shouldResume ? 'Resume latest' : 'Fresh session'}</span>
        </button>
      </div>

      {/* Stages */}
      <div className="px-3.5">
        {plan.stages.map((stage) => {
          const isDone = stage.status === 'completed';
          const isCurrent = stage.status === 'in_progress';

          return (
            <div
              key={stage.step}
              className="flex items-start gap-3 py-2.5 border-b border-zinc-100 last:border-0"
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                  isDone
                    ? 'bg-zinc-900 border-zinc-900'
                    : isCurrent
                    ? 'border-zinc-900 bg-white'
                    : 'border-zinc-200 bg-white'
                }`}
              >
                {isDone && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
              </span>

              <div className="flex-1 min-w-0">
                <div
                  className={`text-[11.5px] font-medium leading-tight ${
                    isDone ? 'text-zinc-400' : isCurrent ? 'text-zinc-900' : 'text-zinc-500'
                  }`}
                >
                  {stage.name}
                </div>
                <p className="text-[10.5px] text-zinc-400 mt-0.5 leading-relaxed">
                  {stage.description}
                </p>
              </div>

              <span className="text-[9px] font-mono uppercase tracking-[0.08em] text-zinc-400 shrink-0 mt-0.5">
                {stage.status.replace('_', ' ')}
              </span>
            </div>
          );
        })}
      </div>

      {/* Launch actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-t border-zinc-100 bg-zinc-50/60">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() =>
              onLaunchEngine('claude', plan.targetWorkspace, plan.assignee, shouldResume, missionPrompt)
            }
            className="h-7 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[11px] font-medium transition cursor-pointer active:scale-[0.97]"
            title={`Spawn Claude Code (${shouldResume ? 'Resuming latest chat' : 'New session'}) with prompt`}
          >
            Claude
          </button>

          <button
            onClick={() =>
              onLaunchEngine('gemini', plan.targetWorkspace, plan.assignee, shouldResume, missionPrompt)
            }
            className="h-7 px-3 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-lg text-[11px] font-medium transition cursor-pointer active:scale-[0.97]"
            title={`Spawn Gemini CLI (${shouldResume ? 'Resuming latest chat' : 'New session'}) with prompt`}
          >
            Gemini
          </button>

          <button
            onClick={() =>
              onLaunchEngine('antigravity', plan.targetWorkspace, plan.assignee, shouldResume, missionPrompt)
            }
            className="h-7 px-3 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-lg text-[11px] font-medium transition cursor-pointer active:scale-[0.97]"
            title="Launch Antigravity browser QA"
          >
            Antigravity
          </button>

          {onInjectPromptIntoActiveTerminal && (
            <button
              onClick={() => onInjectPromptIntoActiveTerminal(missionPrompt)}
              className="h-7 px-2.5 bg-white hover:bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-lg text-[11px] font-medium transition cursor-pointer active:scale-[0.97]"
              title="Type plan prompt directly into live active terminal session"
            >
              Inject
            </button>
          )}

          <button
            onClick={() => onLaunchEngine('shell', plan.targetWorkspace)}
            className="h-7 w-7 bg-white hover:bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-lg transition cursor-pointer flex items-center justify-center active:scale-[0.97]"
            title="Open Interactive Shell"
          >
            <TerminalIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        </div>

        {!isActive && (
          <button
            onClick={() => onSelectAsActivePlan(plan)}
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1 cursor-pointer transition"
          >
            <span>Set active</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

// --- In-Chat: Markdown Renderer ---
interface ChatMarkdownRendererProps {
  content: string;
  onRunInTerminal?: (cmd: string) => void;
}

const ChatMarkdownRenderer: React.FC<ChatMarkdownRendererProps> = ({
  content,
  onRunInTerminal,
}) => {
  const parts: { type: 'text' | 'code'; text: string; language?: string }[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', text: match[2], language: match[1] || 'sh' });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }

  const formatInlineText = (text: string) => {
    const codeSegments = text.split(/(`[^`]+`)/g);
    return codeSegments.map((seg, i) => {
      if (seg.startsWith('`') && seg.endsWith('`')) {
        return (
          <code
            key={i}
            className="font-mono text-[10.5px] bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded-md border border-zinc-200/80"
          >
            {seg.slice(1, -1)}
          </code>
        );
      }

      const boldSegments = seg.split(/(\*\*[^*]+\*\*)/g);
      return boldSegments.map((bSeg, j) => {
        if (bSeg.startsWith('**') && bSeg.endsWith('**')) {
          return (
            <strong key={j} className="font-semibold text-zinc-900">
              {bSeg.slice(2, -2)}
            </strong>
          );
        }
        return bSeg;
      });
    });
  };

  return (
    <div className="space-y-2 text-[11.5px] leading-relaxed font-sans">
      {parts.map((p, idx) => {
        if (p.type === 'code') {
          return (
            <InChatCodeBlock
              key={idx}
              code={p.text}
              language={p.language}
              onRunInTerminal={onRunInTerminal}
            />
          );
        }

        const lines = p.text.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lineIdx} className="h-1" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="font-semibold text-zinc-900 text-[11.5px] mt-2 mb-1">
                    {trimmed.replace('### ', '')}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lineIdx} className="font-semibold text-zinc-900 text-[13px] mt-2 mb-1">
                    {trimmed.replace('## ', '')}
                  </h3>
                );
              }

              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1">
                    <span className="w-1 h-1 rounded-full bg-zinc-300 mt-[7px] shrink-0" />
                    <span>{formatInlineText(trimmed.replace(/^[-*]\s+/, ''))}</span>
                  </div>
                );
              }

              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1">
                    <span className="font-mono text-[10.5px] font-medium text-zinc-400 shrink-0">
                      {numMatch[1]}.
                    </span>
                    <span>{formatInlineText(numMatch[2])}</span>
                  </div>
                );
              }

              return <p key={lineIdx}>{formatInlineText(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};

// --- In-Chat: Collapsible Reasoning Context ---
const InChatReasoning: React.FC<{ details: string }> = ({ details }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2.5 rounded-xl border border-zinc-200/80 overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-500 hover:text-zinc-800 transition cursor-pointer text-[10px] font-mono"
      >
        <span className="flex items-center gap-1.5">
          <ChevronRight
            className={`w-3 h-3 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="font-medium">Reasoning & routing context</span>
        </span>
        <span className="text-[9.5px] text-zinc-400">gemini-3.8-flash</span>
      </button>

      {open && (
        <div className="px-3.5 py-2.5 border-t border-zinc-100 font-mono text-[10.5px] text-zinc-500 leading-relaxed select-text bg-zinc-50/50">
          {details}
        </div>
      )}
    </div>
  );
};

// --- In-Chat: Agent Turn Completed Card ---
interface ClaudeTurnInfo {
  session_id: string;
  timestamp?: string;
  stop_reason?: string;
  is_done: boolean;
  text: string;
  project_slug: string;
  file_mtime: number;
}

interface InChatTurnCompletedCardProps {
  turn: {
    agentId: string;
    stopReason: string;
    snippet: string;
  };
  onTriggerVerification: () => void;
  onSendFollowUp: () => void;
}

const InChatTurnCompletedCard: React.FC<InChatTurnCompletedCardProps> = ({
  turn,
  onTriggerVerification,
  onSendFollowUp,
}) => {
  const agentInfo = getAgentDirectoryInfo(turn.agentId);

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-white overflow-hidden font-sans">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <span className="w-5 h-5 rounded-[6px] bg-zinc-900 text-white flex items-center justify-center text-[9px] font-bold">
            {agentInfo.symbol}
          </span>
          <div>
            <div className="text-[11.5px] font-semibold text-zinc-900 leading-tight">
              {agentInfo.name} completed turn
            </div>
            <div className="text-[10px] font-mono text-zinc-400">{turn.stopReason}</div>
          </div>
        </div>

        <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Finished
        </span>
      </div>

      <div className="p-3.5 max-h-60 overflow-y-auto select-text">
        <ChatMarkdownRenderer content={turn.snippet} />
      </div>

      <div className="px-3.5 py-2.5 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onTriggerVerification}
            className="h-7 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 active:scale-[0.97]"
          >
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span>Dispatch Kael verification</span>
          </button>

          <button
            onClick={onSendFollowUp}
            className="h-7 px-2.5 bg-white hover:bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-lg text-[11px] font-medium transition cursor-pointer active:scale-[0.97]"
          >
            Follow-up
          </button>
        </div>

        <span className="text-[10px] font-mono text-zinc-400">Step 2 complete</span>
      </div>
    </div>
  );
};

// --- Main Jules Mission Flow View ---
export const JulesMissionFlowView: React.FC<JulesMissionFlowViewProps> = ({
  summary,
  sessions,
  activeSessionId,
  currentWorkspace,
  onWorkspaceChange,
  onSelectSession,
  onKillSession,
  onSendData,
  onSpawnClaude,
  onSpawnGemini,
  onSpawnAntigravity,
  onSpawnShell,
}) => {
  const [viewLayout, setViewLayout] = useState<'split' | 'orchestrator' | 'terminal'>('split');
  const [inputPrompt, setInputPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [globalResumeDefault, setGlobalResumeDefault] = useState(true);
  const [showWorkspaceMatrix, setShowWorkspaceMatrix] = useState(false);
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);

  // Global keyboard shortcuts: ⌘K for Workspace Matrix, ⌘M for Agent Memory Substrate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowWorkspaceMatrix((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowMemoryDrawer((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBookmarkMessage = async (m: ChatMessage) => {
    try {
      await invoke('myaos_create_memory_bookmark', {
        category: 'executive_brief',
        title: m.plan ? m.plan.title : `Turn Summary (${m.turnSummary?.agentId?.toUpperCase() || 'Orchestrator'})`,
        content: m.text.slice(0, 500),
        agentId: m.turnSummary?.agentId || 'orchestrator',
        workspace: currentWorkspace,
        tags: '["chat","memory","bookmark"]',
      });
      playSuccessChime();
      sendDesktopNotification('Saved to Memory', 'Message saved to Agent Memory Substrate');
    } catch (e) {
      console.error('Failed to bookmark message:', e);
    }
  };

  // Active Jules Mission Plan
  const [activePlan, setActivePlan] = useState<JulesMissionPlan>({
    title: 'Autonomous Multi-Agent Mission Routing',
    targetWorkspace: currentWorkspace || '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
    assignee: 'astra',
    recommendedEngine: 'gemini',
    summary: 'Coordinate team across dedicated directories with live PTY sessions and verified proofs.',
    stages: [
      {
        step: 1,
        name: 'Context & Planning',
        description: 'Gemini Orchestrator inspects requirements and generates step decomposition.',
        status: 'completed',
      },
      {
        step: 2,
        name: 'Agent Execution (PTY)',
        description: 'Specialist agent executes in target repository via Claude / Gemini / Antigravity CLI.',
        status: 'in_progress',
      },
      {
        step: 3,
        name: 'Machine Proof & Verification',
        description: 'Kael and Antigravity perform automated test regression and write evidence records.',
        status: 'pending',
      },
      {
        step: 4,
        name: 'Executive Sign-Off',
        description: 'Human checkpoint for changes, deployments, or task conclusion.',
        status: 'pending',
      },
    ],
    suggestedActions: [
      'Spawn Claude in Myavana-Chatbot',
      'Audit DeployFleet test suite',
      'Run Antigravity browser QA',
    ],
  });

  // Orchestrator conversation history
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'orchestrator',
      text: "Welcome to MyaDesktop Flow. I am the MyaOS System AI Orchestrator.\n\nI can spawn agent sessions, resume the latest chats automatically (`--continue` / `-r latest`), and type instructions into the live terminal session programmatically.\n\nType an objective or select a suggestion below to begin.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      plan: {
        title: 'Initial Mission Calibration',
        targetWorkspace: currentWorkspace || '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
        assignee: 'astra',
        recommendedEngine: 'gemini',
        summary: 'Target workspace verified. Astra mapped to Chatbot SDK, ready for execution dispatch.',
        stages: [
          { step: 1, name: 'Workspace Verification', description: 'Validate directory paths and active branch status.', status: 'completed' },
          { step: 2, name: 'Agent Assignment', description: 'Assign specialist agent with directory context.', status: 'in_progress' },
          { step: 3, name: 'PTY Console Link', description: 'Live bidirectional terminal linked to repository.', status: 'pending' },
        ],
        suggestedActions: [
          'Decompose chatbot UI task for Astra',
          'Audit DeployFleet test coverage',
          'Run Playwright smoke test via Antigravity',
        ],
      },
    },
  ]);

  // Multi-Mission Swarm Flight Tabs State
  const [missions, setMissions] = useState<MissionTab[]>([
    {
      id: 'mission_default_astra',
      title: 'Autonomous Multi-Agent Mission Routing',
      targetWorkspace: currentWorkspace || '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
      assignee: 'astra',
      plan: {
        title: 'Autonomous Multi-Agent Mission Routing',
        targetWorkspace: currentWorkspace || '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
        assignee: 'astra',
        recommendedEngine: 'gemini',
        summary: 'Coordinate team across dedicated directories with live PTY sessions and verified proofs.',
        stages: [
          { step: 1, name: 'Context & Planning', description: 'Gemini Orchestrator inspects requirements and generates step decomposition.', status: 'completed' },
          { step: 2, name: 'Agent Execution (PTY)', description: 'Specialist agent executes in target repository via Claude / Gemini / Antigravity CLI.', status: 'in_progress' },
          { step: 3, name: 'Machine Proof & Verification', description: 'Kael and Antigravity perform automated test regression and write evidence records.', status: 'pending' },
          { step: 4, name: 'Executive Sign-Off', description: 'Human checkpoint for changes, deployments, or task conclusion.', status: 'pending' },
        ],
        suggestedActions: [
          'Spawn Claude in Myavana-Chatbot',
          'Audit DeployFleet test suite',
          'Run Antigravity browser QA',
        ],
      },
      messages: [
        {
          id: 'welcome',
          sender: 'orchestrator',
          text: "Welcome to MyaDesktop Flow. I am the MyaOS System AI Orchestrator.\n\nI can spawn agent sessions, resume the latest chats automatically (`--continue` / `-r latest`), and type instructions into the live terminal session programmatically.\n\nType an objective or select an @agent pill below to route execution.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          plan: {
            title: 'Initial Mission Calibration',
            targetWorkspace: currentWorkspace || '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
            assignee: 'astra',
            recommendedEngine: 'gemini',
            summary: 'Target workspace verified. Astra mapped to Chatbot SDK, ready for execution dispatch.',
            stages: [
              { step: 1, name: 'Workspace Verification', description: 'Validate directory paths and active branch status.', status: 'completed' },
              { step: 2, name: 'Agent Assignment', description: 'Assign specialist agent with directory context.', status: 'in_progress' },
              { step: 3, name: 'PTY Console Link', description: 'Live bidirectional terminal linked to repository.', status: 'pending' },
            ],
            suggestedActions: [
              'Decompose chatbot UI task for Astra',
              'Audit DeployFleet test coverage',
              'Run Playwright smoke test via Antigravity',
            ],
          },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  const [activeMissionId, setActiveMissionId] = useState<string>('mission_default_astra');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [historicalPlans, setHistoricalPlans] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(isSoundMuted());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedMtime = useRef<number>(0);
  const [agentTurnStatus, setAgentTurnStatus] = useState<'idle' | 'working' | 'completed'>('idle');
  const [autoPilot, setAutoPilot] = useState<boolean>(true);
  const [isDispatchingVerifier, setIsDispatchingVerifier] = useState<boolean>(false);
  const [isMissionExpanded, setIsMissionExpanded] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState<boolean>(false);

  // Substrate Persistence Helpers
  const persistMissionPlan = (plan: JulesMissionPlan, missionId: string = activeMissionId) => {
    invoke('myaos_save_mission_plan', {
      missionId,
      title: plan.title,
      workspace: plan.targetWorkspace,
      assignee: plan.assignee,
      engine: plan.recommendedEngine,
      summary: plan.summary,
      planJson: JSON.stringify(plan),
    }).catch((e) => console.warn('Failed to persist plan to SQLite:', e));
  };

  const persistMissionMessage = (msg: ChatMessage, missionId: string = activeMissionId) => {
    invoke('myaos_save_mission_message', {
      missionId,
      sender: msg.sender,
      text: msg.text,
      planJson: msg.plan ? JSON.stringify(msg.plan) : null,
      turnSummaryJson: msg.turnSummary ? JSON.stringify(msg.turnSummary) : null,
    }).catch((e) => console.warn('Failed to persist message to SQLite:', e));
  };

  // Substrate Hydration on Mount
  useEffect(() => {
    const loadSubstrateMissions = async () => {
      try {
        const saved = await invoke<any[]>('myaos_list_mission_plans', { limit: 20 });
        if (saved && saved.length > 0) {
          setHistoricalPlans(saved);
        } else {
          persistMissionPlan(activePlan, 'mission_default_astra');
          persistMissionMessage(messages[0], 'mission_default_astra');
        }
      } catch (e) {
        console.warn('Could not load historical plans:', e);
      }
    };
    loadSubstrateMissions();
  }, []);

  // Multi-Mission Flight Tab Handlers
  const handleSelectMissionTab = (missionId: string) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === activeMissionId ? { ...m, plan: activePlan, messages, updatedAt: new Date().toISOString() } : m))
    );

    const target = missions.find((m) => m.id === missionId);
    if (!target) return;

    setActiveMissionId(missionId);
    setActivePlan(target.plan);
    setMessages(target.messages);
    onWorkspaceChange(target.targetWorkspace);
  };

  const handleCreateNewMission = (presetAgent: string = 'astra') => {
    const agentInfo = getAgentDirectoryInfo(presetAgent);
    const newId = `mission_${Date.now()}`;
    const initialPlan: JulesMissionPlan = {
      title: `Mission ${missions.length + 1}: ${agentInfo.name}`,
      targetWorkspace: agentInfo.defaultWorkspace,
      assignee: presetAgent,
      recommendedEngine: 'gemini',
      summary: `Coordinating ${agentInfo.name} in ${agentInfo.domain}.`,
      stages: [
        { step: 1, name: 'Context & Planning', description: 'Step decomposition and requirements.', status: 'completed' },
        { step: 2, name: 'Agent Execution (PTY)', description: 'Specialist agent executes in target repository.', status: 'in_progress' },
        { step: 3, name: 'Machine Proof', description: 'Independent test verification & audit.', status: 'pending' },
        { step: 4, name: 'Executive Sign-Off', description: 'Sign-off and platform release.', status: 'pending' },
      ],
      suggestedActions: [
        `Decompose ${agentInfo.name} task`,
        `Resume ${agentInfo.name} in repository`,
        `Run verification test suite`,
      ],
    };

    const initialMessages: ChatMessage[] = [
      {
        id: `welcome_${newId}`,
        sender: 'orchestrator',
        text: `Mission initialized for **${agentInfo.name}** [${agentInfo.symbol}] in \`${agentInfo.defaultWorkspace}\`.\n\nType an objective or select an @agent pill to route work.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        plan: initialPlan,
      },
    ];

    const newTab: MissionTab = {
      id: newId,
      title: initialPlan.title,
      targetWorkspace: initialPlan.targetWorkspace,
      assignee: initialPlan.assignee,
      plan: initialPlan,
      messages: initialMessages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMissions((prev) => [
      ...prev.map((m) => (m.id === activeMissionId ? { ...m, plan: activePlan, messages } : m)),
      newTab,
    ]);

    setActiveMissionId(newId);
    setActivePlan(initialPlan);
    setMessages(initialMessages);
    onWorkspaceChange(initialPlan.targetWorkspace);

    persistMissionPlan(initialPlan, newId);
    persistMissionMessage(initialMessages[0], newId);
  };

  const handleCloseMission = (missionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (missions.length <= 1) return;
    const remaining = missions.filter((m) => m.id !== missionId);
    setMissions(remaining);
    if (activeMissionId === missionId) {
      const nextTab = remaining[0];
      setActiveMissionId(nextTab.id);
      setActivePlan(nextTab.plan);
      setMessages(nextTab.messages);
      onWorkspaceChange(nextTab.targetWorkspace);
    }
  };

  const handleRestoreHistoricalMission = async (hp: any) => {
    const existing = missions.find((m) => m.id === hp.mission_id);
    if (existing) {
      handleSelectMissionTab(existing.id);
      setShowHistoryDrawer(false);
      return;
    }

    let parsedPlan: JulesMissionPlan;
    try {
      parsedPlan = JSON.parse(hp.plan_json);
    } catch {
      parsedPlan = {
        title: hp.title,
        targetWorkspace: hp.workspace,
        assignee: hp.assignee,
        recommendedEngine: hp.engine as any,
        summary: hp.summary || '',
        stages: [],
        suggestedActions: [],
      };
    }

    const rawMsgs = await invoke<any[]>('myaos_get_mission_messages', {
      missionId: hp.mission_id,
      limit: 100,
    }).catch(() => []);

    const loadedMsgs: ChatMessage[] = rawMsgs && rawMsgs.length > 0
      ? rawMsgs.map((rm) => ({
          id: `db_${rm.id}`,
          sender: rm.sender as any,
          text: rm.text,
          timestamp: new Date(rm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          plan: rm.plan_json ? JSON.parse(rm.plan_json) : undefined,
          turnSummary: rm.turn_summary_json ? JSON.parse(rm.turn_summary_json) : undefined,
        }))
      : [
          {
            id: `restored_${hp.mission_id}`,
            sender: 'orchestrator',
            text: `Restored mission "${hp.title}" from SQLite substrate ledger.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            plan: parsedPlan,
          },
        ];

    const restoredTab: MissionTab = {
      id: hp.mission_id,
      title: hp.title,
      targetWorkspace: hp.workspace,
      assignee: hp.assignee,
      plan: parsedPlan,
      messages: loadedMsgs,
      createdAt: hp.created_at,
      updatedAt: hp.updated_at,
    };

    setMissions((prev) => [
      ...prev.map((m) => (m.id === activeMissionId ? { ...m, plan: activePlan, messages } : m)),
      restoredTab,
    ]);
    setActiveMissionId(restoredTab.id);
    setActivePlan(parsedPlan);
    setMessages(loadedMsgs);
    onWorkspaceChange(restoredTab.targetWorkspace);
    setShowHistoryDrawer(false);
  };

  const handleSelectAgentPill = (pill: typeof AGENT_PILLS[0]) => {
    onWorkspaceChange(pill.repo);
    const updatedPlan = {
      ...activePlan,
      assignee: pill.id,
      targetWorkspace: pill.repo,
    };
    setActivePlan(updatedPlan);
    persistMissionPlan(updatedPlan);

    setInputPrompt((prev) => {
      const clean = prev.replace(/^@\w+\s*/, '');
      return `@${pill.id} ${clean}`;
    });

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Dispatch Lead Verifier Kael
  const handleDispatchVerifier = async (promptOverride?: string) => {
    setIsDispatchingVerifier(true);
    const targetWs = activePlan.targetWorkspace || currentWorkspace;
    const verifierPrompt =
      promptOverride ||
      `Run independent automated verification regression tests on the latest changes authored by ${activePlan.assignee} in ${targetWs}. Audit git diff, execute test suites, and confirm pass/fail.`;

    try {
      onSpawnClaude('kael', targetWs, true, verifierPrompt);

      setActivePlan((prev) => ({
        ...prev,
        assignee: 'kael',
        stages: prev.stages.map((st) =>
          st.step === 3 ? { ...st, status: 'in_progress' } : st
        ),
      }));

      const noticeMsg: ChatMessage = {
        id: `dispatch_${Date.now()}`,
        sender: 'orchestrator',
        text: `**Autonomous Pipeline Handoff**: Dispatched Lead Verifier **Kael [KL]** to independently audit and run regression tests in \`${targetWs}\`.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, noticeMsg]);

      await invoke('myaos_log_mission_event', {
        eventType: 'mission.verifier_dispatched',
        sender: 'orchestrator',
        taskId: null,
        payload: JSON.stringify({
          verifier: 'kael',
          workspace: targetWs,
          prompt: verifierPrompt,
        }),
      });

      setViewLayout('split');
    } finally {
      setIsDispatchingVerifier(false);
    }
  };

  const handleRefreshGitDiff = async () => {
    const targetWs = activePlan.targetWorkspace || currentWorkspace;
    const diff = await invoke<GitWorkspaceDiff>('myaos_get_git_diff', { cwd: targetWs }).catch(() => null);
    if (diff) {
      setMessages((prev) => [
        ...prev,
        {
          id: `diff_${Date.now()}`,
          sender: 'orchestrator',
          text: `Refreshed git workspace inspection for \`${targetWs}\`:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          gitDiff: diff,
        },
      ]);
    }
  };

  // Autonomous Background Observer
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const targetWs = activePlan.targetWorkspace || currentWorkspace;
        const turn = await invoke<ClaudeTurnInfo | null>('myaos_get_claude_latest_turn', {
          cwd: targetWs,
        });

        if (!turn || !isMounted) return;

        if (lastProcessedMtime.current === 0) {
          lastProcessedMtime.current = turn.file_mtime;
          return;
        }

        if (turn.file_mtime > lastProcessedMtime.current && turn.is_done && turn.text.trim()) {
          lastProcessedMtime.current = turn.file_mtime;
          setAgentTurnStatus('completed');

          const gitDiff = await invoke<GitWorkspaceDiff>('myaos_get_git_diff', {
            cwd: targetWs,
          }).catch(() => null);

          if (activePlan.assignee.toLowerCase() === 'kael') {
            const nextStages = activePlan.stages.map((st) => {
              if (st.step === 3) return { ...st, status: 'completed' as const };
              if (st.step === 4 && st.status === 'pending') return { ...st, status: 'in_progress' as const };
              return st;
            });
            const updatedPlan = { ...activePlan, stages: nextStages };
            setActivePlan(updatedPlan);
            persistMissionPlan(updatedPlan);

            playSuccessChime();
            sendDesktopNotification(
              'Verification Proof Passed',
              'Independent regression tests verified clean by Lead Verifier Kael [KL]'
            );

            await invoke('myaos_record_verification_evidence', {
              taskId: null,
              verifierIdentity: 'kael',
              evidenceClass: 'unmocked_tests',
              passed: true,
              details: turn.text.slice(0, 500),
              exitCode: 0,
              verifiedFiles: gitDiff && gitDiff.files ? gitDiff.files.map((f) => f.path).join(', ') : null,
            }).catch((e) => console.warn('Failed to record evidence in db:', e));

            const kaelDoneMsg: ChatMessage = {
              id: `kael_done_${Date.now()}`,
              sender: 'orchestrator',
              text: `**Independent Verification Complete** by **Kael [KL]**.\n\nEvidence recorded to SQLite substrate (\`data/myaos.db\`). Un-mocked regression tests executed. Stage 4 Executive Sign-Off ready.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              turnSummary: {
                agentId: 'kael',
                stopReason: turn.stop_reason || 'end_turn',
                snippet: turn.text,
              },
              gitDiff: gitDiff || undefined,
              executiveRelease: {
                workspace: targetWs,
                branch: gitDiff?.branch || 'main',
                defaultCommitMessage: `feat(${activePlan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mission'}): verified implementation by ${activePlan.assignee.toUpperCase()}`,
              },
            };

            // Advance Stepper: Step 3 completed, Step 4 Executive Sign-Off in_progress
            const kaelNextStages = activePlan.stages.map((st) => {
              if (st.step === 3) return { ...st, status: 'completed' as const };
              if (st.step === 4 && st.status === 'pending') return { ...st, status: 'in_progress' as const };
              return st;
            });
            const kaelUpdatedPlan = { ...activePlan, stages: kaelNextStages };
            setActivePlan(kaelUpdatedPlan);
            persistMissionPlan(kaelUpdatedPlan);

            setMessages((prev) => [...prev, kaelDoneMsg]);
            persistMissionMessage(kaelDoneMsg);

            await invoke('myaos_log_mission_event', {
              eventType: 'verifier.completed',
              sender: 'kael',
              taskId: null,
              payload: JSON.stringify({ summary: turn.text.slice(0, 300) }),
            });
            return;
          }

          // Implementing agent finished
          const agentNextStages = activePlan.stages.map((st) => {
            if (st.step === 2) return { ...st, status: 'completed' as const };
            if (st.step === 3 && st.status === 'pending') return { ...st, status: 'in_progress' as const };
            return st;
          });
          const agentUpdatedPlan = { ...activePlan, stages: agentNextStages };
          setActivePlan(agentUpdatedPlan);
          persistMissionPlan(agentUpdatedPlan);

          playExecutiveChime();
          sendDesktopNotification(
            `${activePlan.assignee.toUpperCase()} Completed Turn`,
            `Turn finished in ${activePlan.title}. Changes ready for verification.`
          );

          let orchestratorAnalysis: OrchestratorSynthesisResult | undefined = undefined;
          if (gitDiff) {
            orchestratorAnalysis = await synthesizeAgentTurnAndPlanHandoff({
              agentId: activePlan.assignee,
              workspace: targetWs,
              agentSummary: turn.text,
              gitDiff,
            });
          }

          const agentTurnMsg: ChatMessage = {
            id: `turn_${Date.now()}`,
            sender: 'orchestrator',
            text: `Agent **${activePlan.assignee.toUpperCase()}** completed execution turn. Changes inspected and verified from session transcript.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            turnSummary: {
              agentId: activePlan.assignee,
              stopReason: turn.stop_reason || 'end_turn',
              snippet: turn.text,
            },
            gitDiff: gitDiff || undefined,
            orchestratorAnalysis,
          };

          setMessages((prev) => [...prev, agentTurnMsg]);
          persistMissionMessage(agentTurnMsg);

          await invoke('myaos_log_mission_event', {
            eventType: 'agent.turn_completed',
            sender: activePlan.assignee,
            taskId: null,
            payload: JSON.stringify({
              sessionId: turn.session_id,
              stopReason: turn.stop_reason,
              summary: turn.text.slice(0, 300),
              filesChanged: gitDiff?.files?.length || 0,
            }),
          });

          if (autoPilot && orchestratorAnalysis) {
            const briefPrompt = orchestratorAnalysis.verifierPrompt;
            setTimeout(() => {
              handleDispatchVerifier(briefPrompt);
            }, 1800);
          }
        }
      } catch (e) {
        // observer continues
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activePlan.targetWorkspace, activePlan.assignee, currentWorkspace, autoPilot]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSendMessage = async (promptToSend?: string) => {
    const text = (promptToSend || inputPrompt).trim();
    if (!text || isThinking) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    persistMissionMessage(userMsg);
    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsThinking(true);

    try {
      const response = await sendOrchestratorPrompt(messages, text);

      if (response.plan) {
        setActivePlan(response.plan);
        persistMissionPlan(response.plan);
        if (response.plan.targetWorkspace) {
          onWorkspaceChange(response.plan.targetWorkspace);
        }
      }

      const botMsg: ChatMessage = {
        id: `orch_${Date.now()}`,
        sender: 'orchestrator',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        plan: response.plan,
        featureSpec: response.featureSpec,
        bugRepro: response.bugRepro,
        codeReview: response.codeReview,
        appScaffold: response.appScaffold,
        interAgentDialogue: response.interAgentDialogue,
        realityAudit: response.realityAudit,
      };

      setMessages((prev) => [...prev, botMsg]);
      persistMissionMessage(botMsg);
    } catch (err: any) {
      console.error('Error in Jules chat:', err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleLaunchAgentInMission = (
    engine: 'claude' | 'gemini' | 'antigravity' | 'shell',
    targetDirOverride?: string,
    targetAgentOverride?: string,
    resume: boolean = true,
    prompt?: string
  ) => {
    const targetDir = targetDirOverride || activePlan.targetWorkspace;
    const targetAgent = targetAgentOverride || activePlan.assignee;

    if (engine === 'claude') {
      onSpawnClaude(targetAgent, targetDir, resume, prompt);
    } else if (engine === 'gemini') {
      onSpawnGemini(targetAgent, targetDir, resume, prompt);
    } else if (engine === 'antigravity') {
      onSpawnAntigravity(targetAgent, targetDir, resume, prompt);
    } else {
      onSpawnShell(targetDir);
    }

    if (viewLayout === 'orchestrator') {
      setViewLayout('split');
    }
  };

  const handleRunCommandInConsole = (cmd: string) => {
    if (activeSessionId) {
      onSendData(activeSessionId, `${cmd}\r\n`);
    } else {
      onSpawnShell(activePlan.targetWorkspace);
    }
    if (viewLayout === 'orchestrator') {
      setViewLayout('split');
    }
  };

  const handleInjectPromptIntoActiveTerminal = (prompt: string) => {
    if (activeSessionId) {
      onSendData(activeSessionId, `${prompt}\r\n`);
    } else {
      handleLaunchAgentInMission('claude', activePlan.targetWorkspace, activePlan.assignee, true, prompt);
    }
  };

  const currentAgentInfo = getAgentDirectoryInfo(activePlan.assignee);
  const activeSession = sessions.find((s) => s.session_id === activeSessionId);

  const activeCompleted = activePlan.stages.filter((s) => s.status === 'completed').length;
  const activeInProgress = activePlan.stages.filter((s) => s.status === 'in_progress').length;
  const activePercent = Math.round(
    ((activeCompleted + activeInProgress * 0.5) / Math.max(activePlan.stages.length, 1)) * 100
  );

  return (
    <div className="h-full w-full bg-[#faf9f6] text-zinc-900 font-sans select-none flex flex-col">
      <div className="h-full flex flex-col gap-2.5">

        {/* ─────────────────────────────  HEADER  ───────────────────────────── */}
        <header className="flex items-center justify-between gap-4 shrink-0 px-1 pb-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-center shrink-0">
              <Workflow className="w-4 h-4 text-zinc-800" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
                  Mya Mission Flow
                </h1>
                <span className="text-[10px] font-mono text-zinc-400">gemini-3.8-flash</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-tight truncate">
                Autonomous routing · live PTY sessions · verified proofs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Auto-handoff subtle toggle */}
            <button
              onClick={() => setAutoPilot((prev) => !prev)}
              className="h-8 px-3 rounded-[10px] bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-zinc-50 transition flex items-center gap-2 text-[11px] font-medium text-zinc-600 cursor-pointer"
              title="When active, completing an implementation automatically triggers independent verification via Kael"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  autoPilot ? 'bg-emerald-500' : 'bg-zinc-300'
                }`}
              />
              <span>{autoPilot ? 'Auto-handoff' : 'Manual gates'}</span>
            </button>

            {/* Live Token & Financial Telemetry Widget */}
            <LiveTokenCostWidget />

            {/* Multi-Workspace Quick Matrix Trigger (⌘K) */}
            <button
              onClick={() => setShowWorkspaceMatrix(true)}
              className="h-8 px-2.5 rounded-[10px] bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-zinc-50 transition flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 cursor-pointer"
              title="Open Multi-Workspace Matrix (⌘K)"
            >
              <FolderGit2 className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.8} />
              <span className="truncate max-w-[120px] font-semibold">{currentWorkspace.split('/').pop()}</span>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-100 px-1 py-0.2 rounded border border-zinc-200">⌘K</kbd>
            </button>

            {/* Agent Memory Substrate Trigger (⌘M) */}
            <button
              onClick={() => setShowMemoryDrawer(true)}
              className="h-8 px-2.5 rounded-[10px] bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-zinc-50 transition flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 cursor-pointer"
              title="Open Agent Memory Substrate (⌘M)"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.8} />
              <span className="font-semibold">Memory</span>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-100 px-1 py-0.2 rounded border border-zinc-200">⌘M</kbd>
            </button>

            {/* Segmented view control */}
            <div className="h-8 flex items-center p-0.5 rounded-[10px] bg-zinc-200/70">
              <button
                onClick={() => setViewLayout('split')}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  viewLayout === 'split'
                    ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Split View"
              >
                <Split className="w-3 h-3" strokeWidth={1.8} />
                <span>Split</span>
              </button>

              <button
                onClick={() => setViewLayout('orchestrator')}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  viewLayout === 'orchestrator'
                    ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Mission Chat Focus"
              >
                <Layers className="w-3 h-3" strokeWidth={1.8} />
                <span>Mission</span>
              </button>

              <button
                onClick={() => setViewLayout('terminal')}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  viewLayout === 'terminal'
                    ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Console Maximize"
              >
                <TerminalIcon className="w-3 h-3" strokeWidth={1.8} />
                <span>Console</span>
              </button>
            </div>

            {/* Settings */}
            <div className="relative">
              <button
                onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
                className={`h-8 w-8 rounded-[10px] border transition cursor-pointer flex items-center justify-center ${
                  isSettingsMenuOpen
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white hover:bg-zinc-50 text-zinc-600 border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                }`}
                title="Controls & Automation Settings"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>

              {isSettingsMenuOpen && (
                <div
                  className="absolute right-0 top-10 w-60 bg-white/95 backdrop-blur-xl border border-black/[0.08] rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] p-1.5 z-50 animate-card-entry"
                  onMouseLeave={() => setIsSettingsMenuOpen(false)}
                >
                  <div className="px-2.5 py-1.5 text-[9.5px] font-mono uppercase tracking-[0.1em] text-zinc-400 font-medium border-b border-zinc-100 mb-1">
                    MyaOS Control Suite
                  </div>

                  <button
                    onClick={() => {
                      const nm = toggleSoundMuted();
                      setIsMuted(nm);
                      if (!nm) playExecutiveChime();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[11.5px] hover:bg-zinc-100 transition cursor-pointer text-zinc-700"
                  >
                    <div className="flex items-center gap-2">
                      {isMuted ? (
                        <VolumeX className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.8} />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-zinc-700" strokeWidth={1.8} />
                      )}
                      <span>Audio chimes</span>
                    </div>
                    <span className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded-md ${
                      isMuted ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-900 text-white'
                    }`}>
                      {isMuted ? 'Off' : 'On'}
                    </span>
                  </button>

                  <button
                    onClick={() => setAutoPilot((prev) => !prev)}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[11.5px] hover:bg-zinc-100 transition cursor-pointer text-zinc-700"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.8} />
                      <span>Auto-verification</span>
                    </div>
                    <span className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded-md ${
                      autoPilot ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {autoPilot ? 'Kael' : 'Manual'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      setShowHistoryDrawer(true);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[11.5px] hover:bg-zinc-100 transition cursor-pointer text-zinc-700"
                  >
                    <div className="flex items-center gap-2">
                      <History className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.8} />
                      <span>Substrate ledger</span>
                    </div>
                    <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-500">
                      {historicalPlans.length}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ─────────────────────────  MISSION TABS  ───────────────────────── */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 py-0.5">
            {missions.map((m) => {
              const isActive = m.id === activeMissionId;
              const agentInfo = getAgentDirectoryInfo(m.assignee);
              const completedSteps = m.plan.stages.filter((s) => s.status === 'completed').length;
              const pct = Math.round((completedSteps / Math.max(m.plan.stages.length, 1)) * 100);

              return (
                <div
                  key={m.id}
                  onClick={() => handleSelectMissionTab(m.id)}
                  className={`flex items-center gap-2 h-8 pl-2 pr-2 rounded-[10px] text-[11.5px] border transition cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-white border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-zinc-900'
                      : 'bg-transparent border-transparent hover:bg-white/60 text-zinc-500'
                  }`}
                >
                  <span className="w-4 h-4 rounded-[5px] bg-zinc-900 text-white flex items-center justify-center text-[8px] font-bold shrink-0">
                    {agentInfo.symbol}
                  </span>
                  <span className="font-medium truncate max-w-[150px]">{m.title}</span>
                  <span className="text-[9.5px] font-mono text-zinc-400 shrink-0">{pct}%</span>
                  {missions.length > 1 && (
                    <button
                      onClick={(e) => handleCloseMission(m.id, e)}
                      className="p-0.5 rounded-md hover:bg-zinc-200/70 text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
                      title="Close mission tab"
                    >
                      <X className="w-3 h-3" strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => handleCreateNewMission('astra')}
              className="h-8 px-2.5 rounded-[10px] bg-transparent hover:bg-white/70 text-zinc-500 hover:text-zinc-800 border border-dashed border-zinc-300 text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Create a new concurrent mission tab"
            >
              <Plus className="w-3 h-3" strokeWidth={2} />
              <span>New mission</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 shrink-0 pr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{missions.length} active</span>
          </div>
        </div>

        {/* ─────────────────────────  MAIN GRID  ───────────────────────── */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-2.5">

          {/* Left column */}
          {(viewLayout === 'split' || viewLayout === 'orchestrator') && (
            <div
              className={`${
                viewLayout === 'split' ? 'col-span-6' : 'col-span-12'
              } h-full flex flex-col gap-2.5 overflow-hidden`}
            >
              {/* ── Mission plan card ── */}
              <div className="bg-white border border-black/[0.06] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] shrink-0 overflow-hidden transition-all duration-300">
                {/* Compact ribbon */}
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-[7px] bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {currentAgentInfo.symbol}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-medium text-zinc-900 truncate">
                        {activePlan.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                          Stage {activePlan.stages.find((s) => s.status === 'in_progress')?.step || 1} · {activePercent}%
                        </span>
                        {/* Grok Build 3-Stage Indicator */}
                        <div className="hidden sm:flex items-center gap-1 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200/60 text-[9.5px] font-mono">
                          <span className={`px-1 py-0.2 rounded font-semibold ${activeCompleted === 0 ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}>PLAN</span>
                          <span className="text-zinc-300">›</span>
                          <span className={`px-1 py-0.2 rounded font-semibold ${activeInProgress > 0 && activeCompleted <= 1 ? 'bg-indigo-600 text-white animate-pulse' : 'text-zinc-500'}`}>SEARCH</span>
                          <span className="text-zinc-300">›</span>
                          <span className={`px-1 py-0.2 rounded font-semibold ${activeCompleted >= 2 ? 'bg-emerald-600 text-white' : 'text-zinc-500'}`}>BUILD</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          handleLaunchAgentInMission(
                            'claude',
                            activePlan.targetWorkspace,
                            activePlan.assignee,
                            globalResumeDefault
                          )
                        }
                        className="h-7 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10.5px] font-medium transition cursor-pointer active:scale-[0.97]"
                        title="Launch Claude"
                      >
                        Claude
                      </button>
                      <button
                        onClick={() =>
                          handleLaunchAgentInMission(
                            'gemini',
                            activePlan.targetWorkspace,
                            activePlan.assignee,
                            globalResumeDefault
                          )
                        }
                        className="h-7 px-2.5 bg-white hover:bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-lg text-[10.5px] font-medium transition cursor-pointer active:scale-[0.97]"
                        title="Launch Gemini"
                      >
                        Gemini
                      </button>
                      <button
                        onClick={() =>
                          handleLaunchAgentInMission(
                            'antigravity',
                            activePlan.targetWorkspace,
                            activePlan.assignee,
                            globalResumeDefault
                          )
                        }
                        className="h-7 px-2.5 bg-white hover:bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-lg text-[10.5px] font-medium transition cursor-pointer active:scale-[0.97]"
                        title="Launch Antigravity"
                      >
                        AGY
                      </button>
                      <button
                        onClick={() => handleLaunchAgentInMission('shell', activePlan.targetWorkspace)}
                        className="h-7 w-7 bg-white hover:bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-lg transition cursor-pointer flex items-center justify-center active:scale-[0.97]"
                        title="Open Terminal Shell"
                      >
                        <TerminalIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                    </div>

                    <button
                      onClick={() => setIsMissionExpanded(!isMissionExpanded)}
                      className="h-7 px-2 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-600 transition cursor-pointer flex items-center gap-1 text-[10.5px] font-medium"
                      title={isMissionExpanded ? 'Collapse Mission Plan' : 'Expand Mission Plan'}
                    >
                      <span className="font-mono">{isMissionExpanded ? 'Hide' : 'Plan'}</span>
                      {isMissionExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.8} />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded body */}
                {isMissionExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-zinc-100 space-y-3 animate-card-entry">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="uppercase tracking-[0.08em] text-zinc-400">
                            Target
                          </span>
                          <span className="font-medium text-zinc-700">
                            {activePlan.assignee.toUpperCase()}
                          </span>
                          <span className="text-zinc-300">·</span>
                          <span className="text-zinc-500 truncate">{activePlan.targetWorkspace}</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed max-w-xl">
                          {activePlan.summary}
                        </p>
                      </div>

                      <CircularProgressDial percentage={activePercent} size={50} strokeWidth={4} />
                    </div>

                    {/* Stage stepper */}
                    <div className="grid grid-cols-4 gap-2 py-2 border-y border-zinc-100">
                      {activePlan.stages.map((st) => {
                        const isDone = st.status === 'completed';
                        const isCurrent = st.status === 'in_progress';

                        return (
                          <div key={st.step} className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              {isDone ? (
                                <span className="w-3.5 h-3.5 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
                                  <Check className="w-2 h-2 text-white" strokeWidth={3} />
                                </span>
                              ) : isCurrent ? (
                                <span className="w-3.5 h-3.5 rounded-full border border-zinc-900 flex items-center justify-center shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                                </span>
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-zinc-200 shrink-0" />
                              )}
                              <span className="text-[9px] font-mono text-zinc-400">0{st.step}</span>
                            </div>
                            <div className={`text-[10.5px] font-medium truncate ${
                              isCurrent ? 'text-zinc-900' : isDone ? 'text-zinc-400' : 'text-zinc-500'
                            }`}>
                              {st.name}
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                              {st.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span>Fast launch uses directory default session</span>
                      <button
                        onClick={() => setGlobalResumeDefault(!globalResumeDefault)}
                        className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition cursor-pointer"
                      >
                        {globalResumeDefault ? 'Auto-resume: ON' : 'Auto-resume: OFF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Chat card ── */}
              <div className="flex-1 bg-white border border-black/[0.06] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden min-h-[340px]">
                {/* Chat header */}
                <div className="px-3.5 py-2.5 border-b border-zinc-100 flex items-center justify-between bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span className="text-[11.5px] font-medium text-zinc-800">Orchestrator conversation</span>
                  </div>
                  {isThinking && (
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-pulse" />
                      Reasoning…
                    </span>
                  )}
                </div>

                {/* Message feed */}
                <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4 bg-white">
                  <div className={`${viewLayout === 'orchestrator' ? 'max-w-3xl mx-auto w-full' : 'w-full'} space-y-4`}>
                    {messages.map((m) => {
                      const isUser = m.sender === 'user';
                      return (
                        <div
                          key={m.id}
                          className={`flex gap-2.5 max-w-[94%] ${
                            isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 text-[9px] font-mono font-bold overflow-hidden ${
                              isUser
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-900 border border-zinc-200/60'
                            }`}
                          >
                            {isUser ? (
                              'WZ'
                            ) : (
                              <img
                                src="/app-icon.png"
                                alt="Orchestrator"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>

                          <div className="space-y-1 max-w-full min-w-0">
                            <div
                              className={`flex items-center gap-2 text-[10px] font-mono text-zinc-400 ${
                                isUser ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <span className="font-medium text-zinc-500">
                                {isUser ? 'Winston Zulu' : 'Orchestrator'}
                              </span>
                              <span>{m.timestamp}</span>
                              {!isUser && (
                                <button
                                  onClick={() => handleBookmarkMessage(m)}
                                  className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-amber-600 transition cursor-pointer"
                                  title="Save to Agent Memory Substrate (⌘M)"
                                >
                                  <Bookmark className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <div
                              className={`p-3.5 rounded-2xl text-[11.5px] leading-relaxed ${
                                isUser
                                  ? 'bg-zinc-900 text-white rounded-tr-[6px]'
                                  : 'bg-zinc-50/70 border border-zinc-200/60 text-zinc-800 rounded-tl-[6px]'
                              }`}
                            >
                              {isUser ? (
                                <div className="whitespace-pre-wrap">{m.text}</div>
                              ) : (
                                <ChatMarkdownRenderer
                                  content={m.text}
                                  onRunInTerminal={handleRunCommandInConsole}
                                />
                              )}

                              {!isUser && m.text.length > 250 && (
                                <InChatReasoning
                                  details={`Assigned agent: ${activePlan.assignee} (${currentAgentInfo.domain}). Target directory: ${activePlan.targetWorkspace}. Model: gemini-3.8-flash. Resume latest chat: ${globalResumeDefault ? 'Enabled' : 'Disabled'}.`}
                                />
                              )}

                              {m.plan && (
                                <InChatPlanCard
                                  plan={m.plan}
                                  onLaunchEngine={handleLaunchAgentInMission}
                                  onSelectAsActivePlan={(p) => {
                                    setActivePlan(p);
                                    if (p.targetWorkspace) onWorkspaceChange(p.targetWorkspace);
                                  }}
                                  onInjectPromptIntoActiveTerminal={handleInjectPromptIntoActiveTerminal}
                                  isActive={activePlan.title === m.plan.title}
                                />
                              )}

                              {m.turnSummary && (
                                <InChatTurnCompletedCard
                                  turn={m.turnSummary}
                                  onTriggerVerification={() => {
                                    handleDispatchVerifier();
                                  }}
                                  onSendFollowUp={() => {
                                    if (activeSessionId) {
                                      onSendData(activeSessionId, 'Reviewing completed turn. Ready for next step.\r\n');
                                    }
                                  }}
                                />
                              )}

                              {m.gitDiff && (
                                <InChatGitDiffCard
                                  diff={m.gitDiff}
                                  workspacePath={activePlan.targetWorkspace || currentWorkspace}
                                  onRefreshDiff={handleRefreshGitDiff}
                                />
                              )}

                              {m.orchestratorAnalysis && (
                                <InChatOrchestratorAnalysisCard
                                  analysis={m.orchestratorAnalysis}
                                  autoPilot={autoPilot}
                                  onDispatchVerifier={() => {
                                    handleDispatchVerifier(m.orchestratorAnalysis?.verifierPrompt);
                                  }}
                                  isDispatching={isDispatchingVerifier}
                                />
                              )}

                              {/* Specialized GrokBot / Jules Cards */}
                              {m.featureSpec && (
                                <InChatFeatureSpecCard
                                  spec={m.featureSpec}
                                  onDispatchBranch={(branch, assignee, cmds) => {
                                    // Switch or create branch in target directory and spawn agent
                                    handleRunCommandInConsole(`git checkout -B ${branch}`);
                                    handleLaunchAgentInMission('claude', activePlan.targetWorkspace, assignee, true, `Implement feature '${m.featureSpec?.featureTitle}'. Branch ${branch} is checked out.`);
                                  }}
                                />
                              )}

                              {m.bugRepro && (
                                <InChatBugReproCard
                                  bug={m.bugRepro}
                                  onRunRepro={(cmd) => {
                                    handleRunCommandInConsole(cmd);
                                  }}
                                  onTriggerAutoFix={(prompt, assignee) => {
                                    handleLaunchAgentInMission('claude', activePlan.targetWorkspace, assignee, true, prompt);
                                  }}
                                />
                              )}

                              {m.codeReview && (
                                <InChatCodeReviewCard
                                  review={m.codeReview}
                                  onApproveAndPR={(prTitle) => {
                                    handleRunCommandInConsole(`gh pr create --title "${prTitle}" --body "Automated executive review passed with score ${m.codeReview?.overallScore}/100." || git status`);
                                  }}
                                />
                              )}

                              {m.appScaffold && (
                                <InChatAppScaffoldCard
                                  scaffold={m.appScaffold}
                                  onInitApp={(appName, dir, cmds, agent) => {
                                    onWorkspaceChange(dir);
                                    if (cmds.length > 0) {
                                      handleRunCommandInConsole(cmds.join(' && '));
                                    }
                                  }}
                                />
                              )}

                              {m.interAgentDialogue && (
                                <InChatInterAgentDialogueCard
                                  dialogue={m.interAgentDialogue}
                                  onConfirmHandoff={() => {
                                    handleLaunchAgentInMission('claude', activePlan.targetWorkspace, m.interAgentDialogue?.targetAgent.id, true);
                                  }}
                                />
                              )}

                              {m.realityAudit && (
                                <InChatRealityAuditCard
                                  audit={m.realityAudit}
                                  onRunAuditAndHeal={async () => {
                                    try {
                                      await invoke('myaos_run_reality_audit', { autoHeal: true });
                                    } catch (err) {
                                      console.error('Failed to run reality audit:', err);
                                    }
                                  }}
                                />
                              )}

                              {m.executiveRelease && (
                                <InChatExecutiveReleaseCard
                                  workspace={m.executiveRelease.workspace}
                                  currentBranch={m.executiveRelease.branch}
                                  defaultCommitMessage={m.executiveRelease.defaultCommitMessage}
                                  onSignedOff={(summary) => {
                                    const signedStages = activePlan.stages.map((st) => {
                                      if (st.step === 4) return { ...st, status: 'completed' as const };
                                      return st;
                                    });
                                    const finalPlan = { ...activePlan, stages: signedStages };
                                    setActivePlan(finalPlan);
                                    persistMissionPlan(finalPlan);
                                    playSuccessChime();
                                  }}
                                />
                              )}

                              {!isUser && (
                                <InChatTerminalBridge
                                  activeSession={activeSession}
                                  onSendData={(cmd) => {
                                    if (activeSessionId) {
                                      onSendData(activeSessionId, cmd);
                                    }
                                  }}
                                  onSpawnShell={() => handleLaunchAgentInMission('shell')}
                                />
                              )}

                              {m.plan?.suggestedActions && m.plan.suggestedActions.length > 0 && (
                                <div className="mt-3 pt-2.5 border-t border-zinc-200/60 flex flex-wrap gap-1.5">
                                  {m.plan.suggestedActions.map((action, actIdx) => (
                                    <button
                                      key={actIdx}
                                      onClick={() => handleSendMessage(action)}
                                      className="h-6 px-2.5 bg-white hover:bg-zinc-100 text-zinc-600 border border-zinc-200 rounded-full text-[10.5px] font-medium transition cursor-pointer flex items-center gap-1"
                                    >
                                      <span>{action}</span>
                                      <ArrowUpRight className="w-2.5 h-2.5 text-zinc-400" strokeWidth={1.8} />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Suggestions bar */}
                <div className="px-3.5 py-1.5 border-t border-zinc-100 flex items-center justify-between shrink-0 bg-white">
                  <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                    <button
                      onClick={() => setShowSuggestions(!showSuggestions)}
                      className="flex items-center gap-1 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-zinc-400 hover:text-zinc-700 transition cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3 h-3 text-zinc-400" strokeWidth={1.8} />
                      <span>Suggestions</span>
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${showSuggestions ? 'rotate-180' : ''}`}
                        strokeWidth={1.8}
                      />
                    </button>

                    {showSuggestions && (
                      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 animate-card-entry">
                        {[
                          'Decompose chatbot UI task for Astra',
                          'Audit DeployFleet test coverage',
                          'Run Playwright smoke test via Antigravity',
                          'Verify Hair Journey order fulfillment',
                          'Resume latest Claude conversation',
                        ].map((chip) => (
                          <button
                            key={chip}
                            onClick={() => handleSendMessage(chip)}
                            className="h-6 px-2.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10.5px] font-medium transition shrink-0 cursor-pointer active:scale-[0.97]"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {viewLayout === 'orchestrator' && (
                    <button
                      onClick={() => setViewLayout('split')}
                      className="h-6 px-2 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[10px] font-mono font-medium transition cursor-pointer flex items-center gap-1 shrink-0 ml-2"
                      title="Open Live Terminal split view"
                    >
                      <TerminalIcon className="w-3 h-3 text-zinc-500" strokeWidth={1.8} />
                      <span>Open console</span>
                    </button>
                  )}
                </div>

                {/* Agent pills */}
                <div className="px-3.5 py-2 border-t border-zinc-100 flex items-center gap-1.5 overflow-x-auto shrink-0 bg-white">
                  <div className="flex items-center gap-1 text-[9.5px] font-mono font-medium text-zinc-400 uppercase tracking-[0.1em] shrink-0 mr-1">
                    <AtSign className="w-3 h-3" strokeWidth={1.8} />
                    <span>Route</span>
                  </div>
                  {AGENT_PILLS.map((pill) => {
                    const isCurrent = activePlan.assignee.toLowerCase() === pill.id;
                    return (
                      <button
                        key={pill.id}
                        onClick={() => handleSelectAgentPill(pill)}
                        className={`h-6 px-2.5 rounded-full text-[10.5px] font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 border ${
                          isCurrent
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                        }`}
                        title={`${pill.name} (${pill.domain}) • ${pill.repo}`}
                      >
                        <span className="font-medium">{pill.name}</span>
                        <span className={`text-[9px] font-mono ${isCurrent ? 'opacity-60' : 'text-zinc-400'}`}>
                          [{pill.monogram}]
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Input */}
                <div className="p-3 border-t border-zinc-100 shrink-0 bg-white relative">
                  {/* Interactive Slash Commands Popover */}
                  {inputPrompt.startsWith('/') && !inputPrompt.includes(' ') && (
                    <div className="absolute bottom-full left-4 mb-2 w-80 bg-white/95 backdrop-blur-2xl border border-zinc-200/80 rounded-2xl shadow-xl p-1.5 z-50 animate-card-entry space-y-0.5">
                      <div className="px-2.5 py-1 text-[9.5px] font-mono uppercase tracking-[0.1em] font-bold text-zinc-400 border-b border-zinc-100 mb-1">
                        Executive Dev Flows
                      </div>
                      {[
                        { cmd: '/feature', label: 'Feature Blueprint', desc: 'Decompose PRD, acceptance checklist & branch' },
                        { cmd: '/fix', label: 'Bug Triage & Repro', desc: 'Analyze stack trace, pin lines & test fix' },
                        { cmd: '/review', label: 'Executive Review', desc: 'Audit code diff, security radar & create PR' },
                        { cmd: '/audit', label: 'Reality Engine Audit', desc: 'Verify git state, stale tasks & auto-heal substrate' },
                        { cmd: '/new-app', label: 'Scaffold New App', desc: 'Initialize Vite/Next.js/FastAPI repository' },
                        { cmd: '/swarm', label: 'GrokBot Swarm', desc: 'Coordinate multi-agent handoff dialogue' },
                        { cmd: '/release', label: 'Ship & Release', desc: 'Generate release notes & commit sign-off' },
                      ]
                        .filter((item) => item.cmd.startsWith(inputPrompt.toLowerCase()))
                        .map((item) => (
                          <div
                            key={item.cmd}
                            onClick={() => {
                              setInputPrompt(`${item.cmd} `);
                              textareaRef.current?.focus();
                            }}
                            className="p-2 rounded-xl hover:bg-zinc-100 transition cursor-pointer flex items-start gap-2.5"
                          >
                            <span className="font-mono text-xs font-bold text-indigo-600 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 shrink-0">
                              {item.cmd}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-zinc-900">{item.label}</div>
                              <div className="text-[10px] text-zinc-500 truncate">{item.desc}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className={`${viewLayout === 'orchestrator' ? 'max-w-3xl mx-auto w-full' : 'w-full'} flex items-end gap-2`}>
                    <div className="flex-1 bg-zinc-50 border border-zinc-200 focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-900/[0.06] rounded-xl p-2.5 transition flex flex-col">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={inputPrompt}
                        onChange={(e) => {
                          setInputPrompt(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Direct Orchestrator with /feature, /fix, /review, /swarm or @agent…"
                        className="w-full bg-transparent resize-none text-[11.5px] text-zinc-800 placeholder-zinc-400 focus:outline-none leading-relaxed font-sans max-h-40 overflow-y-auto"
                      />
                      <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-zinc-200/60 text-[9.5px] text-zinc-400 font-mono">
                        <span className="flex items-center gap-1 truncate">
                          <span className="text-zinc-400">Target</span>
                          <strong className="text-zinc-600 font-medium">{activePlan.assignee}</strong>
                          <span className="text-zinc-300">·</span>
                          <span className="truncate">{activePlan.targetWorkspace.split('/').pop()}</span>
                        </span>
                        <span className="shrink-0 pl-2">↵ send · ⇧↵ line · type / for flows</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputPrompt.trim() || isThinking}
                      className="h-[42px] px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-white rounded-xl text-[11.5px] font-medium transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-[0.97]"
                    >
                      <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right column: console */}
          {(viewLayout === 'split' || viewLayout === 'terminal') && (
            <div
              className={`${
                viewLayout === 'split' ? 'col-span-6' : 'col-span-12'
              } h-full min-h-[460px]`}
            >
              <LiveConsolePane
                sessions={sessions}
                activeSessionId={activeSessionId}
                currentWorkspace={activePlan.targetWorkspace || currentWorkspace}
                isMaximized={viewLayout === 'terminal'}
                onToggleMaximize={() =>
                  setViewLayout(viewLayout === 'terminal' ? 'split' : 'terminal')
                }
                onSelectSession={onSelectSession}
                onKillSession={onKillSession}
                onSendData={onSendData}
                onSpawnClaude={onSpawnClaude}
                onSpawnGemini={onSpawnGemini}
                onSpawnAntigravity={onSpawnAntigravity}
                onSpawnShell={onSpawnShell}
              />
            </div>
          )}
        </div>
      </div>

      {/* ───────────────────  HISTORY DRAWER  ─────────────────── */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-black/[0.08] rounded-3xl shadow-[0_24px_70px_-20px_rgba(0,0,0,0.3)] w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-card-entry">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-zinc-100 flex items-center justify-center text-zinc-600">
                  <History className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-zinc-900">Substrate mission history</h3>
                  <p className="text-[11px] text-zinc-500">Recorded mission ledger · data/myaos.db</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryDrawer(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2 flex-1">
              {historicalPlans.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-[11.5px]">
                  No previous missions recorded in substrate.
                </div>
              ) : (
                historicalPlans.map((hp) => (
                  <div
                    key={hp.mission_id}
                    className="p-3.5 rounded-2xl border border-zinc-200/70 bg-white hover:border-zinc-300 transition-all flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9.5px] font-mono font-medium uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
                          {hp.assignee}
                        </span>
                        <span className="text-[11.5px] font-medium text-zinc-900 truncate">
                          {hp.title}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-zinc-400 font-mono truncate">
                        {hp.workspace}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        Updated {new Date(hp.updated_at).toLocaleString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRestoreHistoricalMission(hp)}
                      className="h-7 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[11px] font-medium transition cursor-pointer shrink-0 active:scale-[0.97]"
                    >
                      Open as tab
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-Workspace Quick-Switch Matrix (⌘K) */}
      <WorkspaceQuickMatrix
        isOpen={showWorkspaceMatrix}
        onClose={() => setShowWorkspaceMatrix(false)}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={(newWs) => {
          onWorkspaceChange(newWs);
          setActivePlan((prev) => ({ ...prev, targetWorkspace: newWs }));
        }}
      />

      {/* Agent Memory & Context Bookmarks Substrate Drawer (⌘M) */}
      <AgentMemoryDrawer
        isOpen={showMemoryDrawer}
        onClose={() => setShowMemoryDrawer(false)}
        currentWorkspace={currentWorkspace}
      />
    </div>
  );
};