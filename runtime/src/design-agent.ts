import fs from 'node:fs';
import path from 'node:path';
import type * as T from './api/types.ts';
import type { SessionManager } from './acp/session-manager.ts';
import { myaosHome } from './config.ts';
import { InputError, type Repo } from './store/repo.ts';

// Design Studio runs: a real agent session builds designs as HTML files in the
// board's own folder, and every file it writes becomes (or updates) a frame on
// the canvas as soon as it lands. Nothing here invents a design.

const DEVICE_SIZE: Record<T.DesignDeviceKind, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
  custom: { width: 1280, height: 800 },
};

const FRAME_HEADER = /^\s*<!--\s*myaos:frame\b([^>]*)-->/i;

export function designsRoot(): string {
  return path.join(myaosHome(), 'designs');
}

/** The board's folder: the agent's working directory, outside every project repo. */
export function boardDir(boardId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(boardId)) throw new InputError('invalid board id');
  return path.join(designsRoot(), boardId);
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  const v = (m?.[1] ?? m?.[2] ?? '').trim();
  return v || null;
}

function parseHeader(html: string) {
  const m = html.match(FRAME_HEADER);
  const attrs = m?.[1] ?? '';
  const deviceRaw = (attr(attrs, 'device') ?? 'phone').toLowerCase();
  const device = (['phone', 'tablet', 'desktop', 'custom'].includes(deviceRaw) ? deviceRaw : 'phone') as T.DesignDeviceKind;
  const num = (v: string | null) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined);
  return {
    title: attr(attrs, 'title'),
    device,
    width: num(attr(attrs, 'width')),
    height: num(attr(attrs, 'height')),
    parent: attr(attrs, 'parent'),
    notes: attr(attrs, 'notes'),
    source: (attr(attrs, 'source') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Brings the board in line with the HTML files in its folder: a known file
 * updates its frame (new version), a new file becomes a new frame. Returns
 * the frames that changed.
 */
export function ingestBoardFolder(repo: Repo, boardId: string, authorId: string): T.DesignFrame[] {
  const dir = boardDir(boardId);
  if (!fs.existsSync(dir)) return [];
  const board = repo.getDesignBoard(boardId);
  const byPath = new Map((board.frames ?? []).filter((f) => f.htmlPath).map((f) => [path.resolve(f.htmlPath!), f]));
  const changed: T.DesignFrame[] = [];

  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.toLowerCase().endsWith('.html')) continue;
    const file = path.join(dir, name);
    let html: string;
    try {
      if (!fs.statSync(file).isFile()) continue;
      html = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!html.trim()) continue;
    const meta = parseHeader(html);
    const existing = byPath.get(path.resolve(file));

    if (existing) {
      if (existing.htmlContent === html) continue;
      changed.push(
        repo.updateDesignFrame(existing.id, {
          htmlContent: html,
          ...(meta.title ? { title: meta.title } : {}),
          ...(meta.source.length ? { sourceFiles: meta.source } : {}),
          status: existing.status === 'approved' ? 'iterating' : existing.status,
          authorId,
          notes: meta.notes ?? existing.notes,
          bumpVersion: true,
        })
      );
      continue;
    }

    const size = DEVICE_SIZE[meta.device];
    const parentFrameId = meta.parent && (board.frames ?? []).some((f) => f.id === meta.parent) ? meta.parent : null;
    const created = repo.createDesignFrame({
      boardId,
      parentFrameId,
      title: meta.title ?? name.replace(/\.html$/i, '').replace(/[-_]+/g, ' '),
      device: meta.device,
      width: meta.width ?? size.width,
      height: meta.height ?? size.height,
      sourceFiles: meta.source,
      htmlContent: html,
      notes: meta.notes,
      authorId,
    });
    changed.push(repo.updateDesignFrame(created.id, { htmlPath: file, bumpVersion: false }));
  }
  return changed;
}

/** Frames being iterated must live in the board folder so the agent can edit them in place. */
function moveFrameIntoFolder(repo: Repo, frame: T.DesignFrame): T.DesignFrame {
  const dir = boardDir(frame.boardId);
  if (frame.htmlPath && path.dirname(path.resolve(frame.htmlPath)) === dir) return frame;
  const file = path.join(dir, `${frame.id}.html`);
  fs.writeFileSync(file, frame.htmlContent, 'utf8');
  return repo.updateDesignFrame(frame.id, { htmlPath: file, bumpVersion: false });
}

function buildPrompt(
  repo: Repo,
  board: T.DesignBoard,
  agent: T.Identity,
  input: T.StartDesignRunInput,
  dir: string,
  frames: T.DesignFrame[]
): string {
  const device = input.device ?? (input.kind === 'iterate' ? frames[0]?.device : undefined) ?? 'phone';
  const size = DEVICE_SIZE[device];
  let project: T.Project | null = null;
  if (board.projectId) {
    try {
      project = repo.getProject(board.projectId);
    } catch {
      project = null;
    }
  }
  const tokens = board.designTokens;
  const lines: string[] = [
    `You are ${agent.name}, working in the MyaOS Design Studio. The owner reviews every design on a canvas before anything is built, so make each one real enough to judge.`,
    '',
    `Your working folder is the design board: ${dir}`,
    `Board: ${board.title}${board.description ? ` — ${board.description}` : ''}`,
    '',
    'HOW TO DELIVER',
    '- Each screen or design is ONE self-contained .html file written directly in the working folder (no subfolders).',
    '- The very first line of every file must be a header comment, for example:',
    `  <!-- myaos:frame title="Checkout" device="${device}" notes="one line on the idea" -->`,
    `  Add width="..." height="..." only for a non-standard size. Default size for ${device}: ${size.width}x${size.height}.`,
    '- Inline all CSS. No build step, no frameworks, no external requests except Google Fonts. Small inline JS only for interaction states.',
    '- Write each file as soon as it is ready, one at a time: the owner watches them appear on the canvas.',
    '- Do not create or change anything outside the working folder. Reading the project is allowed.',
    '- Use realistic content. Where real data is unknown, use clearly labelled examples such as [Customer name], never lorem ipsum.',
    '- When you finish, reply with the files you wrote and one line on each.',
  ];

  if (project?.rootPath) {
    lines.push('', 'PROJECT (read-only)', `- ${project.name}: ${project.rootPath}`);
    for (const r of project.repos ?? []) if (r.path && r.path !== project.rootPath) lines.push(`- repo: ${r.path}`);
  }
  if (tokens && Object.keys(tokens).length) {
    lines.push('', 'Design tokens found in the project (use them unless asked otherwise):', JSON.stringify(tokens).slice(0, 1500));
  }

  lines.push('', 'THE REQUEST', input.prompt.trim(), '');
  if (input.kind === 'new') {
    const n = Math.max(1, Math.min(4, input.variants ?? 1));
    lines.push(
      n > 1
        ? `Design ${n} clearly different directions for this, one file each, device "${device}". Name them so the difference is obvious.`
        : `Design this for device "${device}". Use several files if it has several screens.`
    );
    if (project) lines.push('Read the project first so the design fits its product, copy and visual language.');
  } else if (input.kind === 'from-code') {
    if (!project?.rootPath) throw new InputError('recreating existing UI needs a board linked to a project');
    const scope = (input.scope ?? []).filter(Boolean);
    lines.push(
      'Recreate the CURRENT UI of the project faithfully from its code, so the owner can review and iterate on it before any build work.',
      scope.length ? `Only these screens or paths: ${scope.join(', ')}` : 'Cover the whole app: one file per screen, starting with the main ones.',
      'Reproduce layout, copy, colours, spacing and states as they are in the code today. Do not improve anything yet.',
      'In each header add source="relative/path.tsx,..." listing the source files that screen reflects.',
      `Use device "${device}" unless a screen is clearly built for another size.`
    );
  } else {
    if (frames.length === 0) throw new InputError('iterate needs at least one frame');
    const action = input.action ?? 'update';
    lines.push(action === 'update' ? 'Change these frames IN PLACE (edit the files; keep their first line):' : 'Make NEW variants of these frames (new files with parent="<frame id>" in the header; leave the originals untouched):');
    for (const f of frames) lines.push(`- ${f.title} (frame id ${f.id}, ${f.device} ${f.width}x${f.height}): ${f.htmlPath}`);
    if (input.pinnedElement) lines.push(`The owner pinned this element; focus the change there: ${input.pinnedElement}`);
  }
  return lines.join('\n');
}

interface Watch {
  watcher: fs.FSWatcher | null;
  poll: NodeJS.Timeout;
  timer: NodeJS.Timeout | null;
}

export class DesignRunner {
  private readonly repo: Repo;
  private readonly sessions: SessionManager;
  private readonly watches = new Map<string, Watch>();

  constructor(opts: { repo: Repo; sessions: SessionManager }) {
    this.repo = opts.repo;
    this.sessions = opts.sessions;
  }

  async start(boardId: string, input: T.StartDesignRunInput): Promise<T.DesignRun> {
    if (!['new', 'from-code', 'iterate'].includes(input?.kind)) throw new InputError('kind must be new, from-code or iterate');
    if (!input.prompt?.trim()) throw new InputError('prompt is required');
    const board = this.repo.getDesignBoard(boardId);
    const dir = boardDir(boardId);
    fs.mkdirSync(dir, { recursive: true });

    const frames = input.kind === 'iterate' ? (input.frameIds ?? []).map((id) => {
      const f = this.repo.getDesignFrame(id);
      if (f.boardId !== boardId) throw new InputError(`frame ${id} is on another board`);
      return moveFrameIntoFolder(this.repo, f);
    }) : [];

    const agentId = input.agentId?.trim() || this.defaultDesigner();
    const agent = this.repo.getIdentity(agentId);
    const prompt = buildPrompt(this.repo, board, agent, input, dir, frames);

    const session = await this.sessions.start({
      agentId,
      adapterId: input.adapterId ?? null,
      roomId: board.roomId,
      mode: 'design',
      worktree: dir,
      rawPrompt: true,
      prompt,
    });
    this.repo.appendTranscript(session.id, {
      kind: 'design_request',
      role: 'user',
      title: `Design request (${input.kind})`,
      payload: {
        boardId,
        kind: input.kind,
        prompt: input.prompt.trim(),
        device: input.device ?? null,
        frameIds: frames.map((f) => f.id),
        requestedBy: input.actorId ?? null,
      },
    });
    this.watch(boardId, session.id, agentId);
    return this.toRun(this.repo.getSession(session.id), boardId);
  }

  listRuns(boardId: string): T.DesignRun[] {
    const dir = boardDir(boardId);
    return this.repo
      .listSessions()
      .filter((s) => s.mode === 'design' && s.worktree && path.resolve(s.worktree) === dir)
      .map((s) => this.toRun(s, boardId));
  }

  async cancel(boardId: string, sessionId: string, actorId: string): Promise<T.DesignRun> {
    const run = this.listRuns(boardId).find((r) => r.sessionId === sessionId);
    if (!run) throw new InputError('that session is not a run on this board');
    this.sessions.cancel(sessionId, actorId);
    this.flush(boardId, run.agentId);
    return this.toRun(this.repo.getSession(sessionId), boardId);
  }

  async close(): Promise<void> {
    for (const w of this.watches.values()) this.stopWatch(w);
    this.watches.clear();
  }

  /** A coworker whose role mentions design/UX/UI, else the first with an agent runtime. Never the owner. */
  private defaultDesigner(): string {
    const people = this.repo.listIdentities().filter((i) => !i.isOwner);
    const pick = people.find((i) => /design|ux|ui/i.test(`${i.role ?? ''} ${i.lane ?? ''}`) && (i.adapterId || i.runtime)) ?? people.find((i) => i.adapterId || i.runtime);
    if (!pick) throw new InputError('no coworker with an agent runtime is available to design');
    return pick.id;
  }

  private flush(boardId: string, agentId: string) {
    try {
      ingestBoardFolder(this.repo, boardId, agentId);
    } catch (e) {
      console.warn(`[design] could not read board ${boardId}: ${(e as Error).message}`);
    }
  }

  private watch(boardId: string, sessionId: string, agentId: string) {
    const previous = this.watches.get(sessionId);
    if (previous) this.stopWatch(previous);
    const dir = boardDir(boardId);
    const w: Watch = { watcher: null, timer: null, poll: setInterval(() => tick(), 2000) };
    w.poll.unref();
    const schedule = () => {
      if (w.timer) clearTimeout(w.timer);
      w.timer = setTimeout(() => this.flush(boardId, agentId), 400);
    };
    try {
      w.watcher = fs.watch(dir, schedule);
    } catch {
      w.watcher = null; // polling below still picks files up
    }
    const tick = () => {
      this.flush(boardId, agentId);
      let state: T.SessionState = 'failed';
      try {
        state = this.repo.getSession(sessionId).state;
      } catch {
        /* session gone */
      }
      if (state !== 'starting' && state !== 'running') {
        this.stopWatch(w);
        this.watches.delete(sessionId);
        this.flush(boardId, agentId);
      }
    };
    this.watches.set(sessionId, w);
  }

  private stopWatch(w: Watch) {
    clearInterval(w.poll);
    if (w.timer) clearTimeout(w.timer);
    w.watcher?.close();
  }

  private toRun(s: T.Session, boardId: string): T.DesignRun {
    const entries = this.repo.listTranscript(s.id, 0, 50);
    const req = entries.find((e) => e.kind === 'design_request');
    const p = (req?.payload ?? {}) as { kind?: T.DesignRunKind; prompt?: string; device?: T.DesignDeviceKind | null; frameIds?: string[] };
    const since = s.startedAt;
    const framesTouched = (this.repo.getDesignBoard(boardId).frames ?? []).filter(
      (f) => f.authorId === s.agentId && f.updatedAt >= since
    ).length;
    return {
      sessionId: s.id,
      boardId,
      agentId: s.agentId,
      kind: p.kind ?? 'new',
      prompt: p.prompt ?? '',
      device: p.device ?? null,
      frameIds: p.frameIds ?? [],
      state: s.state,
      error: s.error ?? null,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      framesTouched,
    };
  }
}
