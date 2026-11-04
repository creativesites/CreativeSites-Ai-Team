import * as React from 'react';
import {
  CheckCircle2,
  Code2,
  CopyPlus,
  Eye,
  FolderGit2,
  GitBranch,
  Layers,
  Laptop,
  Maximize2,
  Minus,
  Move,
  Palette,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
  Square,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import type {
  DesignBoard,
  DesignDeviceKind,
  DesignFrame,
  DesignFrameStatus,
  DesignRun,
  Identity,
  JobSummary,
  Project,
  Room,
  StartDesignRunInput,
} from '@runtime/types';
import { Tag } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-9 w-full rounded-lg border border-border bg-background/80 px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40',
        className
      )}
    />
  );
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40',
        className
      )}
    />
  );
}


const STATUS_LABEL: Record<DesignFrameStatus, string> = {
  draft: 'Draft',
  iterating: 'Iterating',
  review: 'Review',
  approved: 'Approved',
  superseded: 'Superseded',
  archived: 'Archived',
};
const STATUS_CHIP: Record<DesignFrameStatus, string> = {
  draft: 'bg-white/10 text-white/70',
  iterating: 'bg-amber-500/20 text-amber-300',
  review: 'bg-sky-500/20 text-sky-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  superseded: 'bg-white/10 text-white/50 line-through',
  archived: 'bg-white/5 text-white/40',
};

export function DesignStudioScreen({
  initialBoardId,
  projects,
  jobs,
  identities,
  ownerId,
}: {
  initialBoardId?: string;
  projects: Project[];
  jobs: JobSummary[];
  rooms: Room[];
  identities: Identity[];
  ownerId: string;
}) {
  const { client } = useRuntime();
  const [boards, setBoards] = React.useState<DesignBoard[]>([]);
  const [activeBoard, setActiveBoard] = React.useState<DesignBoard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [statusBanner, setStatusBanner] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const notify = React.useMemo(
    () => ({
      success: (text: string) => setStatusBanner({ tone: 'ok', text }),
      error: (text: string) => setStatusBanner({ tone: 'err', text }),
    }),
    []
  );

  // Canvas pan & zoom state
  const [pan, setPan] = React.useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const [zoom, setZoom] = React.useState<number>(0.78);
  const [isPanning, setIsPanning] = React.useState(false);
  const panStartRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Frame drag state
  const [draggingFrameId, setDraggingFrameId] = React.useState<string | null>(null);
  const frameDragRef = React.useRef<{
    frameId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Selection, version scrub, code view, and pinned element
  const [selectedFrameIds, setSelectedFrameIds] = React.useState<string[]>([]);
  const [codeViewFrameIds, setCodeViewFrameIds] = React.useState<Record<string, boolean>>({});
  const [previewVersionByFrame, setPreviewVersionByFrame] = React.useState<Record<string, number>>({});
  const [pinnedElement, setPinnedElement] = React.useState<{ frameId?: string; section: string; text: string } | null>(null);

  // Prompt dock state
  const [prompt, setPrompt] = React.useState('');
  const [actionMode, setActionMode] = React.useState<'create' | 'update' | 'fork'>('create');
  const [device, setDevice] = React.useState<DesignDeviceKind>('phone');
  const [variantCount, setVariantCount] = React.useState<number>(2);

  // Modals: New Board / Extract UI / Approve Handoff
  const [showNewBoardModal, setShowNewBoardModal] = React.useState(false);
  const [newBoardTitle, setNewBoardTitle] = React.useState('');
  const [newBoardDesc, setNewBoardDesc] = React.useState('');
  const [newBoardMode, setNewBoardMode] = React.useState<'greenfield' | 'extracted'>('greenfield');
  const [newBoardProjectId, setNewBoardProjectId] = React.useState<string>(projects[0]?.id ?? '');
  const [newBoardJobId, setNewBoardJobId] = React.useState<string>(jobs[0]?.id ?? '');

  const [newBoardDevice, setNewBoardDevice] = React.useState<DesignDeviceKind>('phone');
  const [newBoardVariants, setNewBoardVariants] = React.useState<number>(1);
  const [newBoardScope, setNewBoardScope] = React.useState('');

  const [showExtractModal, setShowExtractModal] = React.useState(false);
  const [extractPaths, setExtractPaths] = React.useState<string>('');
  const [extractDevice, setExtractDevice] = React.useState<DesignDeviceKind>('desktop');
  const [extractPrompt, setExtractPrompt] = React.useState<string>('');

  const [showRequestModal, setShowRequestModal] = React.useState(false);
  const [requestBrief, setRequestBrief] = React.useState('');
  const [requestProjectId, setRequestProjectId] = React.useState<string>('');
  const [requestDevices, setRequestDevices] = React.useState<DesignDeviceKind[]>(['phone']);

  const [approvingFrame, setApprovingFrame] = React.useState<DesignFrame | null>(null);
  const [approveNote, setApproveNote] = React.useState('');
  const [approveDispatchBuild, setApproveDispatchBuild] = React.useState(true);
  const [approveAssigneeId, setApproveAssigneeId] = React.useState<string>('atlas');
  const [approveTargetFiles, setApproveTargetFiles] = React.useState<string>('');

  // Agent runs on the active board: every frame is written by a real agent session.
  const [runs, setRuns] = React.useState<DesignRun[]>([]);
  const [dismissedRunIds, setDismissedRunIds] = React.useState<Set<string>>(() => new Set());
  const visibleRuns = React.useMemo(
    () => runs.filter((r) => !dismissedRunIds.has(r.sessionId)),
    [runs, dismissedRunIds]
  );
  const designers = React.useMemo(
    () => identities.filter((i) => !i.isOwner && (i.adapterId || i.runtime)),
    [identities]
  );
  const [designerId, setDesignerId] = React.useState('');
  React.useEffect(() => {
    if (designerId || designers.length === 0) return;
    const pick = designers.find((d) => /design|ux|ui/i.test(`${d.role ?? ''} ${d.lane ?? ''}`)) ?? designers[0]!;
    setDesignerId(pick.id);
  }, [designers, designerId]);
  const nameOf = (id: string) => identities.find((i) => i.id === id)?.name ?? id;
  const activeRun = visibleRuns.find((r) => r.state === 'starting' || r.state === 'running') ?? null;

  const loadBoards = React.useCallback(
    async (preferBoardId?: string) => {
      if (!client) return;
      setLoading(true);
      try {
        const list = await client.designBoards();
        setBoards(list);
        const targetId = preferBoardId ?? initialBoardId ?? list[0]?.id;
        if (targetId) {
          const full = await client.designBoard(targetId);
          setActiveBoard(full);
          setRuns(await client.designRuns(full.id));
        } else {
          // No boards yet: show the empty state; nothing is created on the owner's behalf.
          setActiveBoard(null);
        }
      } catch (e) {
        notify.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [client, initialBoardId]
  );

  React.useEffect(() => {
    void loadBoards(initialBoardId);
  }, [loadBoards, initialBoardId]);

  // Listen for element clicks from inside frame iframes (`myaos-design-element-click`)
  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === 'object' && e.data.type === 'myaos-design-element-click') {
        setPinnedElement({
          section: String(e.data.section ?? 'element'),
          text: String(e.data.text ?? ''),
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Automatically switch action mode when frames are selected
  React.useEffect(() => {
    if (selectedFrameIds.length > 0 && actionMode === 'create') {
      setActionMode('update');
    } else if (selectedFrameIds.length === 0 && actionMode !== 'create') {
      setActionMode('create');
    }
  }, [selectedFrameIds.length]);

  const refreshActiveBoard = async () => {
    if (!client || !activeBoard) return;
    try {
      const fresh = await client.designBoard(activeBoard.id);
      setActiveBoard(fresh);
      setRuns(await client.designRuns(activeBoard.id));
      const list = await client.designBoards();
      setBoards(list);
    } catch (e) {
      notify.error((e as Error).message);
    }
  };
  // While an agent is designing, pull the board every 1.5s so frames appear as they are written.
  React.useEffect(() => {
    if (!activeRun || !client || !activeBoard) return;
    const timer = window.setInterval(() => void refreshActiveBoard(), 1500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.sessionId, activeBoard?.id, client]);


  // Canvas mouse pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }
    if (draggingFrameId && frameDragRef.current && activeBoard) {
      const ref = frameDragRef.current;
      const dx = (e.clientX - ref.startClientX) / zoom;
      const dy = (e.clientY - ref.startClientY) / zoom;
      const nextX = Math.round(ref.origX + dx);
      const nextY = Math.round(ref.origY + dy);
      setActiveBoard((prev) =>
        prev
          ? {
              ...prev,
              frames: (prev.frames ?? []).map((f) => (f.id === ref.frameId ? { ...f, x: nextX, y: nextY } : f)),
            }
          : prev
      );
    }
  };

  const handleCanvasMouseUp = async () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingFrameId && frameDragRef.current && client && activeBoard) {
      const frame = (activeBoard.frames ?? []).find((f) => f.id === draggingFrameId);
      setDraggingFrameId(null);
      frameDragRef.current = null;
      if (frame) {
        try {
          await client.updateDesignFrame(frame.id, { x: frame.x, y: frame.y });
        } catch {
          /* ignore */
        }
      }
    }
  };

  /** Starts an agent session on a board. Frames appear on the canvas as the agent writes them. */
  const startRun = async (boardId: string, input: Omit<StartDesignRunInput, 'agentId' | 'actorId'>) => {
    if (!client) return;
    if (!designerId) throw new Error('No coworker with an agent runtime is available to design. Add one on the Coworkers screen.');
    const run = await client.startDesignRun(boardId, { ...input, agentId: designerId, actorId: ownerId });
    setRuns((prev) => [run, ...prev.filter((r) => r.sessionId !== run.sessionId)]);
    notify.success(`${nameOf(run.agentId)} is working on it. Frames appear on the canvas as they are written.`);
  };

  const handleGenerateOrIterate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !activeBoard || !prompt.trim()) return;
    setBusy(true);
    try {
      if (actionMode === 'create') {
        await startRun(activeBoard.id, { kind: 'new', prompt: prompt.trim(), device, variants: variantCount });
      } else {
        await startRun(activeBoard.id, {
          kind: 'iterate',
          action: actionMode,
          prompt: prompt.trim(),
          frameIds: selectedFrameIds,
          pinnedElement: pinnedElement?.section ?? null,
        });
      }
      setPrompt('');
      setPinnedElement(null);
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickFork = async (frame: DesignFrame) => {
    if (!client || !activeBoard) return;
    setBusy(true);
    try {
      await startRun(activeBoard.id, {
        kind: 'iterate',
        action: 'fork',
        prompt: prompt.trim() || `Explore a clearly different layout for ${frame.title}`,
        frameIds: [frame.id],
      });
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelRun = async (run: DesignRun) => {
    if (!client) return;
    try {
      const updated = await client.cancelDesignRun(run.boardId, run.sessionId, ownerId);
      setRuns((prev) => prev.map((r) => (r.sessionId === updated.sessionId ? updated : r)));
    } catch (err) {
      notify.error((err as Error).message);
    }
  };

  const handleDismissRun = async (sessionId: string) => {
    setDismissedRunIds((prev) => new Set([...prev, sessionId]));
    setRuns((prev) => prev.filter((r) => r.sessionId !== sessionId));
    if (client && activeBoard) {
      try {
        await client.dismissDesignRun(activeBoard.id, sessionId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleClearFailedRuns = async () => {
    const failedIds = runs.filter((r) => r.state === 'failed').map((r) => r.sessionId);
    setDismissedRunIds((prev) => new Set([...prev, ...failedIds]));
    setRuns((prev) => prev.filter((r) => r.state !== 'failed'));
    if (client && activeBoard) {
      try {
        await client.clearDesignRuns(activeBoard.id, 'failed');
        notify.success('Cleared failed design runs');
      } catch (err) {
        notify.error((err as Error).message);
      }
    }
  };

  const handleRetryRun = async (r: DesignRun) => {
    void handleDismissRun(r.sessionId);
    setPrompt(r.prompt);
    try {
      if (r.kind === 'new') {
        await startRun(r.boardId, { kind: 'new', prompt: r.prompt, device: r.device || 'phone', variants: 1 });
      } else {
        await startRun(r.boardId, {
          kind: 'iterate',
          action: 'update',
          prompt: r.prompt,
          frameIds: r.frameIds || [],
        });
      }
    } catch (err) {
      notify.error((err as Error).message);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !newBoardTitle.trim()) return;
    setBusy(true);
    try {
      if (newBoardMode === 'extracted' && !newBoardProjectId) throw new Error('Choose the project whose UI should be brought in.');
      if (newBoardMode === 'greenfield' && !newBoardDesc.trim()) throw new Error('Describe what should be designed.');
      const created = await client.createDesignBoard({
        title: newBoardTitle.trim(),
        description: newBoardDesc.trim() || null,
        mode: newBoardMode,
        projectId: newBoardProjectId || null,
        jobId: newBoardJobId || null,
        createdBy: ownerId,
      });
      const scope = newBoardScope.split(',').map((x) => x.trim()).filter(Boolean);
      await startRun(
        created.id,
        newBoardMode === 'greenfield'
          ? { kind: 'new', prompt: newBoardDesc.trim(), device: newBoardDevice, variants: newBoardVariants }
          : {
              kind: 'from-code',
              prompt: newBoardDesc.trim() || 'Recreate the current UI so we can review and iterate on it.',
              device: newBoardDevice,
              scope,
            }
      );
      setShowNewBoardModal(false);
      setNewBoardTitle('');
      setNewBoardDesc('');
      setNewBoardScope('');
      await loadBoards(created.id);
      window.location.hash = href({ name: 'design-studio', boardId: created.id });
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleExtractRepoUi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !activeBoard) return;
    setBusy(true);
    try {
      const scope = extractPaths.split(',').map((x) => x.trim()).filter(Boolean);
      await startRun(activeBoard.id, {
        kind: 'from-code',
        prompt: extractPrompt.trim() || 'Recreate the current UI so we can review and iterate on it.',
        device: extractDevice,
        scope,
      });
      setShowExtractModal(false);
      setExtractPaths('');
      setExtractPrompt('');
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTransition = async (frame: DesignFrame, to: DesignFrameStatus, label: string) => {
    if (!client) return;
    setBusy(true);
    try {
      await client.transitionDesignFrame(frame.id, to, ownerId, label);
      await refreshActiveBoard();
      notify.success(`"${frame.title}": ${label}`);
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !requestBrief.trim()) return;
    setBusy(true);
    try {
      const res = await client.createDesignRequest({
        brief: requestBrief.trim(),
        projectId: requestProjectId || undefined,
        deviceTargets: requestDevices,
        requestedBy: ownerId,
      });
      setShowRequestModal(false);
      setRequestBrief('');
      await loadBoards(res.boardId);
      window.location.hash = href({ name: 'design-studio', boardId: res.boardId });
      notify.success(
        res.assigneeId ? `Design task assigned to ${nameOf(res.assigneeId)}` : `Design task created without an assignee. ${res.assignmentReason}`
      );
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !approvingFrame) return;
    setBusy(true);
    try {
      const targetFiles = approveTargetFiles
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await client.approveDesignFrame(approvingFrame.id, {
        actorId: ownerId,
        note: approveNote.trim() || null,
        dispatchBuildTask: approveDispatchBuild,
        assigneeId: approveAssigneeId,
        targetFiles: targetFiles.length > 0 ? targetFiles : approvingFrame.sourceFiles,
      });
      setApprovingFrame(null);
      setApproveNote('');
      await refreshActiveBoard();
      notify.success(
        res.task
          ? `Approved "${res.frame.title}" and handed it to ${nameOf(approveAssigneeId)} to build`
          : `Approved "${res.frame.title}"`
      );
    } catch (err) {
      notify.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFrame = async (frameId: string) => {
    if (!client || !activeBoard) return;
    try {
      await client.deleteDesignFrame(frameId);
      setSelectedFrameIds((prev) => prev.filter((id) => id !== frameId));
      await refreshActiveBoard();
    } catch (err) {
      notify.error((err as Error).message);
    }
  };

  const frames = activeBoard?.frames ?? [];
  const frameMap = new Map(frames.map((f) => [f.id, f]));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
      {statusBanner && (
        <div
          role="status"
          className={cn(
            'flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs',
            statusBanner.tone === 'ok'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/35 bg-red-500/10 text-red-200'
          )}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
      {/* Top Studio Header Bar */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <Palette className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Design Studio</span>
                <Tag tone="observed">Infinite Canvas</Tag>
              </div>
            </div>
          </div>

          <select
            aria-label="Select Design Board"
            value={activeBoard?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (id) {
                window.location.hash = href({ name: 'design-studio', boardId: id });
                void loadBoards(id);
              }
            }}
            className="rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.frameCount ?? b.frames?.length ?? 0} frames)
              </option>
            ))}
          </select>

          <Button size="sm" variant="glass" onClick={() => setShowNewBoardModal(true)}>
            <Plus className="size-3.5" /> New board
          </Button>

          <Button
            size="sm"
            variant="glass"
            onClick={() => setShowRequestModal(true)}
            title="Create a job and a linked design task for a design agent"
          >
            <Sparkles className="size-3.5 text-amber-400" /> New design request
          </Button>

          <Button
            size="sm"
            variant="glass"
            disabled={!activeBoard}
            onClick={() => setShowExtractModal(true)}
            title="Have an agent recreate the project's current screens on this canvas so you can iterate on them"
          >
            <FolderGit2 className="size-3.5 text-sky-400" /> Bring in existing UI
          </Button>
        </div>

        {/* Zoom & Canvas Controls */}
        <div className="flex items-center gap-2">
          {activeBoard?.designTokens?.brandName && (
            <span className="hidden rounded-md border border-border/60 bg-foreground/[0.04] px-2 py-1 font-mono text-[11px] text-muted-foreground lg:inline-block">
              Tokens: {activeBoard.designTokens.brandName}
            </span>
          )}
          <div className="glass-panel inline-flex items-center gap-1 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              title="Zoom Out"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[44px] text-center font-mono text-xs">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              title="Zoom In"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPan({ x: 24, y: 24 });
                setZoom(0.78);
              }}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              title="Reset Pan & Zoom"
            >
              <Maximize2 className="size-3" />
            </button>
          </div>
          <Button size="sm" variant="glass" onClick={refreshActiveBoard} title="Sync workspace .html frame files">
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Infinite 2D Canvas Surface */}
      <div
        data-canvas-bg="true"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.06 : -0.06;
            setZoom((z) => Math.max(0.35, Math.min(1.6, Number((z + delta).toFixed(2)))));
          } else {
            setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
          }
        }}
        className={cn(
          'relative flex-1 overflow-hidden rounded-2xl border border-border/80 bg-[#090b10] select-none',
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        )}
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.11) 1px, transparent 1px)',
          backgroundSize: `${Math.max(12, Math.round(24 * zoom))}px ${Math.max(12, Math.round(24 * zoom))}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Canvas Hint Overlay (Top-Left) */}
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-white/10 bg-black/65 px-2.5 py-1 text-[11px] text-white/75 backdrop-blur-md">
            Drag background or two-finger scroll to pan · ⌘/Ctrl + Scroll to zoom · Click any frame element to pin instructions
          </span>
          {selectedFrameIds.length > 0 && (
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 backdrop-blur-md">
              {selectedFrameIds.length} frame(s) selected for iteration
              <button
                type="button"
                onClick={() => setSelectedFrameIds([])}
                className="ml-1 underline hover:text-white"
              >
                Clear
              </button>
            </span>
          )}
        </div>

        {/* No board yet: the two ways in */}
        {!loading && !activeBoard && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="glass-panel flex w-full max-w-2xl flex-col gap-4 rounded-2xl p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">Start a design</h2>
                <p className="text-xs text-muted-foreground">
                  An agent builds every frame live on this canvas. You review and iterate here before anyone builds it.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewBoardMode('greenfield');
                    setShowNewBoardModal(true);
                  }}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background/40 p-4 text-left hover:bg-background/70"
                >
                  <Sparkles className="size-4 text-amber-400" />
                  <span className="text-sm font-semibold">Design something new</span>
                  <span className="text-xs text-muted-foreground">
                    A feature, page or app that doesn't exist yet, optionally based on a project.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewBoardMode('extracted');
                    setShowNewBoardModal(true);
                  }}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background/40 p-4 text-left hover:bg-background/70"
                >
                  <Layers className="size-4 text-sky-400" />
                  <span className="text-sm font-semibold">Bring in existing UI</span>
                  <span className="text-xs text-muted-foreground">
                    Recreate a project's current screens, all or some, to review and iterate on.
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
        {activeBoard && frames.length === 0 && !activeRun && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
            <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-3 text-xs text-muted-foreground">
              This board is empty. Describe a design below, or use "Bring in existing UI".
            </p>
          </div>
        )}

        {/* Transformed 2D Stage */}
        <div
          data-canvas-bg="true"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0"
        >
          {/* SVG Lineage Connectors between Parent and Forked Frames */}
          <svg
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={4000}
            height={3000}
          >
            {frames.map((f) => {
              if (!f.parentFrameId) return null;
              const parent = frameMap.get(f.parentFrameId);
              if (!parent) return null;
              const startX = parent.x + parent.width;
              const startY = parent.y + 180;
              const endX = f.x;
              const endY = f.y + 180;
              const midX = (startX + endX) / 2;
              return (
                <g key={`edge-${parent.id}-${f.id}`}>
                  <path
                    d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                    fill="none"
                    stroke="rgba(240, 180, 76, 0.55)"
                    strokeWidth={2.5}
                    strokeDasharray="6 5"
                  />
                  <circle cx={startX} cy={startY} r={4} fill="#f0b44c" />
                  <circle cx={endX} cy={endY} r={5} fill="#f0b44c" />
                </g>
              );
            })}
          </svg>

          {/* Artboard Frames */}
          {frames.map((frame) => {
            const isSelected = selectedFrameIds.includes(frame.id);
            const isCodeView = Boolean(codeViewFrameIds[frame.id]);
            const activeVerNum = previewVersionByFrame[frame.id] ?? frame.version;
            const activeVerObj = frame.versions?.find((v) => v.version === activeVerNum);
            const htmlToRender = activeVerObj ? activeVerObj.htmlContent : frame.htmlContent;

            return (
              <div
                key={frame.id}
                style={{
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                }}
                className={cn(
                  'absolute flex flex-col rounded-2xl border bg-[#11141d] shadow-2xl transition-shadow',
                  frame.status === 'superseded' && 'opacity-60 grayscale',
                  frame.status === 'approved'
                    ? 'border-emerald-400/70 ring-2 ring-emerald-400/30'
                    : frame.status === 'review'
                      ? 'border-sky-400/70 ring-2 ring-sky-400/30'
                      : isSelected
                      ? 'border-amber-400 ring-2 ring-amber-400/40'
                      : 'border-white/15 hover:border-white/30'
                )}
              >
                {/* Draggable Frame Header Chrome */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggingFrameId(frame.id);
                    frameDragRef.current = {
                      frameId: frame.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: frame.x,
                      origY: frame.y,
                    };
                  }}
                  className="flex cursor-move items-center justify-between gap-2 rounded-t-2xl border-b border-white/10 bg-[#171b26] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedFrameIds((prev) =>
                          prev.includes(frame.id) ? prev.filter((id) => id !== frame.id) : [...prev, frame.id]
                        );
                      }}
                      title="Select frame to iterate or fork"
                      className="size-3.5 cursor-pointer accent-amber-400"
                    />
                    <Move className="size-3.5 shrink-0 text-white/40" />
                    <span className="truncate text-xs font-semibold text-white">{frame.title}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* Version Scrubber Pills (v1, v2, ...) */}
                    {(frame.versions?.length ?? 1) > 1 ? (
                      <div className="inline-flex items-center rounded-md bg-black/40 p-0.5">
                        {(frame.versions ?? [])
                          .slice()
                          .reverse()
                          .map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewVersionByFrame((prev) => ({ ...prev, [frame.id]: v.version }));
                              }}
                              className={cn(
                                'rounded px-1.5 py-0.5 font-mono text-[10px]',
                                activeVerNum === v.version
                                  ? 'bg-amber-400 text-black font-bold'
                                  : 'text-white/60 hover:text-white'
                              )}
                            >
                              v{v.version}
                            </button>
                          ))}
                      </div>
                    ) : (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
                        v{frame.version}
                      </span>
                    )}

                    <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/60">
                      {frame.device} · {frame.width}×{frame.height}
                    </span>

                    <span
                      data-testid={`frame-status-${frame.id}`}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        STATUS_CHIP[frame.status]
                      )}
                    >
                      {frame.status === 'approved' && <CheckCircle2 className="size-3" />}
                      {STATUS_LABEL[frame.status]}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCodeViewFrameIds((prev) => ({ ...prev, [frame.id]: !prev[frame.id] }));
                      }}
                      title="Toggle Live UI / HTML Code"
                      className={cn(
                        'rounded p-1 text-white/60 hover:bg-white/10 hover:text-white',
                        isCodeView && 'bg-amber-400/20 text-amber-300'
                      )}
                    >
                      {isCodeView ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteFrame(frame.id);
                      }}
                      title="Delete Frame"
                      className="rounded p-1 text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Source file & notes strip */}
                {(frame.sourceFiles.length > 0 || frame.notes) && (
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-[#131722] px-3 py-1 text-[11px] text-white/60">
                    {frame.sourceFiles.length > 0 ? (
                      <span className="truncate font-mono text-amber-300/90">
                        {frame.sourceFiles.join(', ')}
                      </span>
                    ) : (
                      <span className="truncate">{frame.notes}</span>
                    )}
                    {frame.parentFrameId && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-amber-400">
                        <GitBranch className="size-3" /> Forked
                      </span>
                    )}
                  </div>
                )}

                {/* Frame Viewport (Live Sandboxed Iframe OR Editable Code Inspector) */}
                <div
                  style={{ height: frame.height }}
                  className="relative w-full overflow-hidden bg-[#0b0d13]"
                >
                  {isCodeView ? (
                    <div className="flex h-full flex-col">
                      <textarea
                        value={htmlToRender}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveBoard((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  frames: (prev.frames ?? []).map((f) =>
                                    f.id === frame.id ? { ...f, htmlContent: val } : f
                                  ),
                                }
                              : prev
                          );
                        }}
                        className="h-full w-full resize-none bg-[#0a0c12] p-3 font-mono text-xs text-emerald-300 focus:outline-none"
                      />
                      <div className="flex justify-end border-t border-white/10 bg-[#141824] p-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!client) return;
                            await client.updateDesignFrame(frame.id, { htmlContent: frame.htmlContent });
                            setCodeViewFrameIds((prev) => ({ ...prev, [frame.id]: false }));
                            await refreshActiveBoard();
                            notify.success(`Saved HTML changes to ${frame.title}`);
                          }}
                        >
                          Save & Render v{frame.version + 1}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      title={frame.title}
                      sandbox="allow-scripts"
                      srcDoc={htmlToRender}
                      className="h-full w-full border-0"
                    />
                  )}
                </div>

                {/* Frame Action Footer Bar */}
                <div className="flex items-center justify-between gap-2 rounded-b-2xl border-t border-white/10 bg-[#171b26] px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFrameIds([frame.id]);
                        setActionMode('update');
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                        isSelected && actionMode === 'update'
                          ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                          : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                      )}
                    >
                      <Sparkles className="size-3" /> Iterate
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleQuickFork(frame)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
                      title="Fork a new variation right next to this frame on the canvas"
                    >
                      <CopyPlus className="size-3" /> Fork Variant
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(frame.status === 'draft' || frame.status === 'iterating') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTransition(frame, 'review', 'sent to review')}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
                      >
                        Send to review
                      </button>
                    )}
                    {frame.status === 'review' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTransition(frame, 'iterating', 'changes requested')}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
                      >
                        Request changes
                      </button>
                    )}
                    {frame.status === 'superseded' && frame.supersededBy && frameMap.get(frame.supersededBy) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = frameMap.get(frame.supersededBy!)!;
                          setSelectedFrameIds([next.id]);
                          setPan({ x: 24 - next.x * zoom, y: 24 - next.y * zoom });
                        }}
                        className="max-w-[11rem] truncate rounded-lg border border-white/20 px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                        title="Go to the approved frame that replaced this one"
                      >
                        Superseded by {frameMap.get(frame.supersededBy)!.title} →
                      </button>
                    )}
                    {frame.status !== 'superseded' && frame.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => {
                          setApprovingFrame(frame);
                          setApproveTargetFiles(frame.sourceFiles.join(', '));
                          setApproveNote('');
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                          frame.status === 'approved'
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        )}
                      >
                        <CheckCircle2 className="size-3.5" />
                        {frame.status === 'approved' ? 'Approved · Hand Off Again' : frame.status === 'review' ? 'Approve' : 'Approve & Build'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent runs on this board */}
      {visibleRuns.length > 0 && (
        <div className="glass-panel flex flex-col gap-2 rounded-xl px-4 py-2.5 text-xs" aria-label="Design runs">
          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5 text-[11px]">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Recent Runs</span>
            {visibleRuns.some((r) => r.state === 'failed') && (
              <button
                type="button"
                onClick={() => void handleClearFailedRuns()}
                className="font-medium text-red-400 hover:text-red-300 hover:underline cursor-pointer transition-colors"
              >
                Clear all failed ({visibleRuns.filter((r) => r.state === 'failed').length})
              </button>
            )}
          </div>
          {visibleRuns.slice(0, 5).map((r) => {
            const live = r.state === 'starting' || r.state === 'running';
            return (
              <div key={r.sessionId} className="flex flex-wrap items-center gap-2.5 py-0.5">
                <Tag tone={live ? 'observed' : r.state === 'failed' ? 'risk' : 'quiet'}>
                  {live ? 'Designing' : r.state === 'failed' ? 'Failed' : r.state === 'stopped' ? 'Stopped' : 'Done'}
                </Tag>
                <span className="font-medium">{nameOf(r.agentId)}</span>
                <span className="text-muted-foreground">
                  {r.kind === 'new' ? 'new design' : r.kind === 'from-code' ? 'existing UI' : 'iteration'}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground/80" title={r.prompt}>
                  {r.prompt}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {r.framesTouched} frame{r.framesTouched === 1 ? '' : 's'}
                </span>
                {r.error && (
                  <span
                    className="max-w-[35%] truncate text-red-300 font-mono text-[11px] bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-md"
                    title={r.error}
                  >
                    {r.error}
                  </span>
                )}
                {live && (
                  <Button size="sm" variant="glass" onClick={() => void handleCancelRun(r)}>
                    <Square className="size-3" /> Stop
                  </Button>
                )}
                {r.state === 'failed' && (
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() => void handleRetryRun(r)}
                    className="border-red-400/30 text-red-200 hover:bg-red-500/20 text-xs py-1 h-7"
                    title="Retry this design run"
                  >
                    <RotateCcw className="size-3 mr-1" /> Retry
                  </Button>
                )}
                {!live && (
                  <button
                    type="button"
                    onClick={() => void handleDismissRun(r.sessionId)}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground cursor-pointer transition-colors"
                    title="Dismiss this run pill"
                    aria-label="Dismiss run"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Studio Iteration & Generation Dock */}
      <form
        onSubmit={handleGenerateOrIterate}
        className="glass-panel flex flex-col gap-2 rounded-2xl border border-border px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-foreground">Canvas Action:</span>
            {(
              [
                { id: 'create', label: '+ New Frames on Canvas' },
                {
                  id: 'update',
                  label: `↻ Update Selected (${selectedFrameIds.length || 0})`,
                },
                {
                  id: 'fork',
                  label: `⑂ Fork Variant from Selected (${selectedFrameIds.length || 0})`,
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActionMode(m.id)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  actionMode === m.id
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.06] text-muted-foreground hover:text-foreground'
                )}
              >
                {m.label}
              </button>
            ))}

            {pinnedElement && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] text-amber-300">
                <Pin className="size-3" /> Pinned: <code>{pinnedElement.section}</code>
                <button
                  type="button"
                  onClick={() => setPinnedElement(null)}
                  className="ml-1 text-white/70 hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
          </div>

          {/* Designer, viewport & variant count */}
          <div className="flex items-center gap-2">
            <select
              aria-label="Designer"
              value={designerId}
              onChange={(e) => setDesignerId(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
            >
              {designers.length === 0 && <option value="">No coworker with an agent runtime</option>}
              {designers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} designs
                </option>
              ))}
            </select>
            <div className="inline-flex items-center rounded-lg border border-border bg-background/60 p-0.5">
              {(
                [
                  { id: 'phone', icon: <Smartphone className="size-3.5" />, label: 'Phone' },
                  { id: 'tablet', icon: <Tablet className="size-3.5" />, label: 'Tablet' },
                  { id: 'desktop', icon: <Laptop className="size-3.5" />, label: 'Web' },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDevice(d.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs',
                    device === d.id ? 'glass-chosen text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  {d.icon} {d.label}
                </button>
              ))}
            </div>

            {actionMode === 'create' && (
              <select
                aria-label="Number of variants"
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              >
                <option value={1}>1 Frame</option>
                <option value={2}>2 Variations</option>
                <option value={3}>3 Variations</option>
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              actionMode === 'create'
                ? 'Describe a new feature, page, or mobile flow to build onto the canvas (e.g., "Hair Journey Timeline & Hairstyle Inference cards")…'
                : actionMode === 'fork'
                  ? 'Describe how the forked variant should differ (e.g., "Try a split calendar + visual grid with sticky bottom bar")…'
                  : 'Describe what to update on the selected frame(s) (e.g., "Make the top metrics foldable and add a filter pill bar")…'
            }
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={busy || !activeBoard || !designerId || !prompt.trim() || (actionMode !== 'create' && selectedFrameIds.length === 0)}
          >
            <Send className="size-3.5" />
            {busy
              ? 'Starting…'
              : actionMode === 'create'
                ? variantCount > 1
                  ? `Design ${variantCount} directions`
                  : 'Design it'
                : actionMode === 'fork'
                  ? 'Make a variant'
                  : 'Update frame'}
          </Button>
        </div>
      </form>

      {/* Modal 1: Create New Board (Greenfield vs Extract Current Codebase UI) */}
      {showNewBoardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateBoard}
            className="glass-panel flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-popover p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">New design board</h2>
              <button
                type="button"
                onClick={() => setShowNewBoardModal(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setNewBoardMode('greenfield')}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all cursor-pointer',
                  newBoardMode === 'greenfield'
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-border bg-background/40 hover:bg-background/70'
                )}
              >
                <Sparkles className="size-4 text-amber-400" />
                <span className="text-xs font-semibold">Design something new</span>
                <span className="text-[11px] text-muted-foreground">
                  A feature, page or app that doesn't exist yet. Optionally grounded in a project.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setNewBoardMode('extracted')}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all cursor-pointer',
                  newBoardMode === 'extracted'
                    ? 'border-sky-400 bg-sky-500/10'
                    : 'border-border bg-background/40 hover:bg-background/70'
                )}
              >
                <Layers className="size-4 text-sky-400" />
                <span className="text-xs font-semibold">Bring in existing UI</span>
                <span className="text-[11px] text-muted-foreground">
                  An agent recreates a project's current screens, all or some, so you can iterate on them.
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Board name</label>
              <Input
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder="e.g., Myavana Hair Journey v2 or DeployGuard Supervisor Shift Flow"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">
                {newBoardMode === 'greenfield' ? 'What should be designed?' : 'Anything to focus on? (optional)'}
              </label>
              <Textarea
                value={newBoardDesc}
                onChange={(e) => setNewBoardDesc(e.target.value)}
                placeholder={
                  newBoardMode === 'greenfield'
                    ? 'Describe the feature, page or app: who it is for, what they do, and what done looks like.'
                    : 'e.g. focus on the checkout flow and its empty states'
                }
                rows={3}
                required={newBoardMode === 'greenfield'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Device</label>
                <select
                  value={newBoardDevice}
                  onChange={(e) => setNewBoardDevice(e.target.value as DesignDeviceKind)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  <option value="phone">Phone</option>
                  <option value="tablet">Tablet</option>
                  <option value="desktop">Web</option>
                </select>
              </div>
              {newBoardMode === 'greenfield' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Directions to explore</label>
                  <select
                    value={newBoardVariants}
                    onChange={(e) => setNewBoardVariants(Number(e.target.value))}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                  >
                    <option value={1}>One design</option>
                    <option value={2}>2 directions</option>
                    <option value={3}>3 directions</option>
                    <option value={4}>4 directions</option>
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Which screens (blank = whole app)</label>
                  <Input
                    value={newBoardScope}
                    onChange={(e) => setNewBoardScope(e.target.value)}
                    placeholder="e.g. checkout, src/screens/Home.tsx"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Designer</label>
              <select
                value={designerId}
                onChange={(e) => setDesignerId(e.target.value)}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
              >
                {designers.length === 0 && <option value="">No coworker with an agent runtime</option>}
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.role ? ` · ${d.role}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  Project {newBoardMode === 'extracted' ? '(required)' : '(optional)'}
                </label>
                <select
                  value={newBoardProjectId}
                  onChange={(e) => setNewBoardProjectId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  <option value="">{newBoardMode === 'extracted' ? 'Choose a project…' : 'No project'}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Link to Active Job (optional)</label>
                <select
                  value={newBoardJobId}
                  onChange={(e) => setNewBoardJobId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  <option value="">None</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      #{j.number} · {j.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="glass" onClick={() => setShowNewBoardModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !newBoardTitle.trim() ||
                  !designerId ||
                  (newBoardMode === 'greenfield' ? !newBoardDesc.trim() : !newBoardProjectId)
                }
              >
                {busy ? 'Starting…' : 'Create board and start'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Extract Current Codebase UI onto Canvas */}
      {showExtractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleExtractRepoUi}
            className="glass-panel flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-popover p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Bring in existing UI</h2>
              <button
                type="button"
                onClick={() => setShowExtractModal(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {nameOf(designerId)} reads the project and recreates its current screens on this board, as they are in the code today, so you can review and iterate before anyone builds.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Project</label>
                <span className="rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs">
                  {projects.find((p) => p.id === activeBoard?.projectId)?.name ?? 'This board has no project. Create a new board for a project instead.'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Target Viewport</label>
                <select
                  value={extractDevice}
                  onChange={(e) => setExtractDevice(e.target.value as DesignDeviceKind)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  <option value="desktop">Web (1440×900)</option>
                  <option value="phone">Phone (390×844)</option>
                  <option value="tablet">Tablet (834×1112)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">
                Which screens or paths (comma-separated; blank = the whole app)
              </label>
              <Input
                value={extractPaths}
                onChange={(e) => setExtractPaths(e.target.value)}
                placeholder="e.g., apps/desktop/src/screens/home.tsx, apps/desktop/src/screens/coworkers.tsx"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Focus / Iteration Goal (optional)</label>
              <Input
                value={extractPrompt}
                onChange={(e) => setExtractPrompt(e.target.value)}
                placeholder="e.g., Focus on the header navigation and quick-dispatch cards"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="glass" onClick={() => setShowExtractModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !activeBoard?.projectId || !designerId}>
                <FolderGit2 className="size-3.5" /> {busy ? 'Starting…' : 'Recreate on this board'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New design request (job + linked design task + board) */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleRequestSubmit}
            className="glass-panel flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-popover p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">New design request</h2>
              <button type="button" onClick={() => setShowRequestModal(false)} className="text-sm text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Creates a job and a linked design task for a design agent, plus a board for the result. Approved designs are handed to the engineers on the same job.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Brief</label>
              <textarea
                value={requestBrief}
                onChange={(e) => setRequestBrief(e.target.value)}
                rows={4}
                placeholder="What should be designed, for whom, and any constraints"
                className="rounded-lg border border-border bg-background/80 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Project (optional)</label>
              <select
                value={requestProjectId}
                onChange={(e) => setRequestProjectId(e.target.value)}
                className="rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Devices</label>
              <div className="flex gap-3 text-xs">
                {(['phone', 'tablet', 'desktop'] as DesignDeviceKind[]).map((d) => (
                  <label key={d} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={requestDevices.includes(d)}
                      onChange={(e) => setRequestDevices((prev) => (e.target.checked ? [...prev, d] : prev.filter((x) => x !== d)))}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowRequestModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !requestBrief.trim()}>
                {busy ? 'Creating…' : 'Create request'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Approve Design Frame & Hand Off to Coding Agent */}
      {approvingFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleApproveSubmit}
            className="glass-panel flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-popover p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-400" />
                <h2 className="text-base font-semibold">Approve Design & Hand Off to Build</h2>
              </div>
              <button
                type="button"
                onClick={() => setApprovingFrame(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
              <div className="font-semibold text-emerald-300">
                {approvingFrame.title} (v{approvingFrame.version} · {approvingFrame.device})
              </div>
              <p className="mt-1 text-muted-foreground">
                Approving this frame locks its HTML/CSS specification as a <strong>VERIFIED</strong> Design Evidence artifact and hands the exact specification to your engineering agent.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Target Repository Files to Create/Update</label>
              <Input
                value={approveTargetFiles}
                onChange={(e) => setApproveTargetFiles(e.target.value)}
                placeholder="e.g., apps/desktop/src/screens/home.tsx"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Implementation Notes for Agent (optional)</label>
              <Textarea
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="Any specific state bindings or API endpoints the agent should wire up when building this approved UI…"
                rows={2}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={approveDispatchBuild}
                onChange={(e) => setApproveDispatchBuild(e.target.checked)}
                className="size-4 accent-emerald-400"
              />
              Immediately create a Build Task & wake coding agent with this approved UI spec
            </label>

            {approveDispatchBuild && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Assign Build Task To</label>
                <select
                  value={approveAssigneeId}
                  onChange={(e) => setApproveAssigneeId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  {identities
                    .filter((i) => !i.isOwner)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.role ?? i.runtime ?? i.id})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="glass" onClick={() => setApprovingFrame(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                <CheckCircle2 className="size-3.5" /> Approve & Dispatch Build
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
