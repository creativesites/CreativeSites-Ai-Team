import React, { useState } from 'react';
import {
  GitCommit,
  GitBranch,
  GitPullRequest,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface InChatExecutiveReleaseCardProps {
  workspace: string;
  currentBranch?: string;
  defaultCommitMessage?: string;
  onSignedOff?: (summary: string) => void;
}

export const InChatExecutiveReleaseCard: React.FC<InChatExecutiveReleaseCardProps> = ({
  workspace,
  currentBranch = 'main',
  defaultCommitMessage,
  onSignedOff,
}) => {
  const [commitMessage, setCommitMessage] = useState(
    defaultCommitMessage || 'feat(mission): verified autonomous implementation and regression proofs'
  );
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [branchName, setBranchName] = useState(
    `feat/mission-${Date.now().toString().slice(-4)}`
  );

  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSignedOff, setIsSignedOff] = useState(false);

  // 1. Commit Action
  const handleCommit = async () => {
    setIsCommitting(true);
    setErrorMessage(null);
    try {
      // First ensure staged
      await invoke('myaos_stage_all_git', { cwd: workspace });

      // If branch creation requested
      if (createNewBranch && branchName.trim()) {
        await invoke('myaos_create_git_branch', {
          cwd: workspace,
          branchName: branchName.trim(),
        });
      }

      // Create git commit
      const res = await invoke<string>('myaos_create_git_commit', {
        cwd: workspace,
        message: commitMessage.trim(),
      });

      setCommitResult(res || 'Commit created successfully');
    } catch (e: any) {
      setErrorMessage(typeof e === 'string' ? e : e?.message || 'Git commit failed');
    } finally {
      setIsCommitting(false);
    }
  };

  // 2. Push Action
  const handlePush = async () => {
    setIsPushing(true);
    setErrorMessage(null);
    try {
      const activeBranch = createNewBranch ? branchName.trim() : currentBranch;
      const res = await invoke<string>('myaos_push_git_branch', {
        cwd: workspace,
        branch: activeBranch,
      });
      setPushResult(res || 'Branch pushed to origin');
    } catch (e: any) {
      setErrorMessage(typeof e === 'string' ? e : e?.message || 'Git push failed');
    } finally {
      setIsPushing(false);
    }
  };

  // 3. Draft PR Action
  const handleOpenPR = () => {
    // Derive repo URL
    const activeBranch = createNewBranch ? branchName.trim() : currentBranch;
    const repoMatch = workspace.match(/(DeployFleet|DeployFleet-website|DeployFleet-Team|CreativeSites-Ai-Team|Myavana[a-zA-Z0-9_-]*)/);
    const repoName = repoMatch ? repoMatch[1] : 'DeployFleet';
    const prUrl = `https://github.com/creativesites/${repoName}/compare/${activeBranch}?expand=1`;
    window.open(prUrl, '_blank');
  };

  // 4. Executive Sign-Off Completion
  const handleFinalSignOff = async () => {
    try {
      await invoke('myaos_log_mission_event', {
        eventType: 'mission.executive_sign_off',
        sender: 'executive',
        taskId: null,
        payload: JSON.stringify({
          workspace,
          commitMessage,
          branch: createNewBranch ? branchName : currentBranch,
          signedOffAt: new Date().toISOString(),
        }),
      });
      setIsSignedOff(true);
      if (onSignedOff) {
        onSignedOff(commitMessage);
      }
    } catch (e) {
      console.error('Failed to log executive sign-off:', e);
      setIsSignedOff(true);
      if (onSignedOff) onSignedOff(commitMessage);
    }
  };

  return (
    <div className="mt-3 bg-white/95 backdrop-blur-2xl border border-zinc-200/90 rounded-3xl p-4 shadow-mac-soft font-sans select-none space-y-3.5 animate-card-entry">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-900 tracking-tight">
                Stage 4: Executive Release & Sign-Off
              </span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified Ready
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Workspace: <span className="font-semibold text-zinc-700">{workspace.split('/').pop()}</span> (branch: {currentBranch})
            </div>
          </div>
        </div>

        {isSignedOff && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Signed Off</span>
          </span>
        )}
      </div>

      {/* Commit Authoring Form */}
      <div className="space-y-2 bg-zinc-50/80 p-3 rounded-2xl border border-zinc-200/60">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-zinc-700 flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-indigo-600" />
            <span>Conventional Commit Message</span>
          </label>
          <span className="text-[10px] font-mono text-zinc-400">Gemini 3.8 Flash Drafted</span>
        </div>

        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          rows={2}
          disabled={isSignedOff}
          className="w-full text-xs font-mono bg-white border border-zinc-200 rounded-xl p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
          placeholder="feat(mission): commit message..."
        />

        {/* Branch Options */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={createNewBranch}
              onChange={(e) => setCreateNewBranch(e.target.checked)}
              disabled={isSignedOff}
              className="rounded text-zinc-900 focus:ring-0 cursor-pointer"
            />
            <span className="text-[11px] font-medium">Create feature branch for Pull Request</span>
          </label>

          {createNewBranch && (
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              disabled={isSignedOff}
              className="text-xs font-mono bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-zinc-800 w-52"
              placeholder="branch-name"
            />
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
          {errorMessage}
        </div>
      )}

      {/* Success Status Logs */}
      {(commitResult || pushResult) && (
        <div className="space-y-1 bg-emerald-50/70 border border-emerald-200/70 p-2.5 rounded-xl text-xs font-mono text-emerald-800">
          {commitResult && <div className="truncate">✓ {commitResult}</div>}
          {pushResult && <div className="truncate">✓ {pushResult}</div>}
        </div>
      )}

      {/* Action Suite */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {/* Commit Button */}
          <button
            onClick={handleCommit}
            disabled={isCommitting || isSignedOff}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-xs ${
              commitResult
                ? 'bg-zinc-100 text-zinc-500 cursor-default'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            {isCommitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5 text-indigo-300" />
            )}
            <span>{commitResult ? 'Committed' : 'Commit & Stage All'}</span>
          </button>

          {/* Push Button */}
          <button
            onClick={handlePush}
            disabled={isPushing || isSignedOff}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 active:scale-95 border ${
              pushResult
                ? 'bg-zinc-100 text-zinc-500 border-zinc-200'
                : 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200/90 shadow-xs'
            }`}
          >
            {isPushing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitBranch className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>{pushResult ? 'Pushed' : 'Push Branch'}</span>
          </button>

          {/* Create PR Button */}
          <button
            onClick={handleOpenPR}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200/90 transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
            title="Open GitHub PR comparison"
          >
            <GitPullRequest className="w-3.5 h-3.5 text-violet-600" />
            <span>Draft PR</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </button>
        </div>

        {/* Final Sign-Off Completion */}
        {!isSignedOff ? (
          <button
            onClick={handleFinalSignOff}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Sign-Off & Close Mission</span>
          </button>
        ) : (
          <div className="text-[11px] font-mono text-emerald-600 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Mission Released to Production</span>
          </div>
        )}
      </div>
    </div>
  );
};
