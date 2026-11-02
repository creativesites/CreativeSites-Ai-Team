import fs from 'node:fs';
import path from 'node:path';
import type * as T from './api/types.ts';
import { boardDir } from './design-agent.ts';
import type { Orchestrator } from './orchestrator.ts';
import type { Repo } from './store/repo.ts';

/**
 * Extracts CSS variables, font families, and brand palette tokens from an attached project repository.
 */
export function extractProjectDesignTokens(projectRoot: string | null): T.DesignTokens {
  const tokens: T.DesignTokens = {
    brandName: projectRoot ? path.basename(projectRoot) : 'MyaOS Studio',
    fontSans: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontMono: 'Geist Mono, ui-monospace, SFMono-Regular, monospace',
    colors: {
      background: '#0c0e14',
      surface: '#141822',
      surfaceElevated: '#1c2230',
      foreground: '#f1f3f9',
      muted: '#8e96aa',
      primary: '#f0b44c',
      accent: '#4a9eff',
      success: '#2ecc8b',
      danger: '#f05a5a',
      border: 'rgba(255,255,255,0.1)',
    },
    cssVariables: {},
  };

  if (!projectRoot || !fs.existsSync(projectRoot)) return tokens;

  const candidateCssFiles = [
    path.join(projectRoot, 'src/index.css'),
    path.join(projectRoot, 'src/App.css'),
    path.join(projectRoot, 'app/globals.css'),
    path.join(projectRoot, 'apps/desktop/src/index.css'),
    path.join(projectRoot, 'apps/desktop/src/styles/roast-room.css'),
  ];

  for (const cssFile of candidateCssFiles) {
    if (!fs.existsSync(cssFile)) continue;
    try {
      const raw = fs.readFileSync(cssFile, 'utf8');
      const varMatches = raw.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;}\n]+);/g);
      for (const m of varMatches) {
        const key = m[1]?.trim();
        const val = m[2]?.trim();
        if (key && val && Object.keys(tokens.cssVariables!).length < 40) {
          tokens.cssVariables![key] = val;
        }
      }
    } catch {
      /* ignore unreadable css */
    }
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name) tokens.brandName = pkg.name.replace(/^@[^/]+\//, '');
    } catch {
      /* ignore */
    }
  }

  return tokens;
}

/**
 * Writes a frame's HTML to the board folder (`~/.myaos/designs/<boardId>/<frameId>.html`),
 * where design agents edit it with ordinary file tools. Never inside a project repo:
 * `_baseDir` is ignored and kept only so existing callers keep compiling.
 */
export function writeFrameFileToDisk(
  _baseDir: string,
  boardId: string,
  frameId: string,
  htmlContent: string
): string {
  const dir = boardDir(boardId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${frameId}.html`);
  fs.writeFileSync(filePath, htmlContent, 'utf8');
  return filePath;
}

/**
 * Synchronizes any direct agent file edits made to `.myaos/designs/<boardId>/*.html`
 * back into SQLite `design_frames` and `design_frame_versions`.
 */
export function syncBoardFramesFromDisk(repo: Repo, boardId: string): T.DesignBoard {
  const board = repo.getDesignBoard(boardId);
  for (const frame of board.frames ?? []) {
    if (frame.htmlPath && fs.existsSync(frame.htmlPath)) {
      try {
        const diskHtml = fs.readFileSync(frame.htmlPath, 'utf8');
        if (diskHtml.trim() && diskHtml !== frame.htmlContent) {
          repo.updateDesignFrame(frame.id, {
            htmlContent: diskHtml,
            notes: 'Updated via workspace file sync',
            bumpVersion: true,
          });
        }
      } catch {
        /* ignore */
      }
    }
  }
  return repo.getDesignBoard(boardId);
}

/**
 * Parses `[DESIGN_FRAME: title="..." device="phone|tablet|desktop" id="..."] ... [/DESIGN_FRAME]`
 * blocks emitted in an agent response and applies them to the board.
 */
export function ingestAgentDesignDirectives(
  repo: Repo,
  boardId: string,
  agentId: string,
  assistantText: string,
  baseDir: string
): T.DesignFrame[] {
  const createdOrUpdated: T.DesignFrame[] = [];
  const regex = /\[DESIGN_FRAME:([^\]]+)\]([\s\S]*?)\[\/DESIGN_FRAME\]/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(assistantText)) !== null) {
    const attrsRaw = match[1] ?? '';
    const htmlBody = (match[2] ?? '').trim();
    if (!htmlBody) continue;
    const getAttr = (name: string): string | null => {
      const m = attrsRaw.match(new RegExp(`${name}=(?:"([^"]+)"|'([^']+)'|([^\\s\\]]+))`, 'i'));
      return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim() || null;
    };
    const frameId = getAttr('id');
    const title = getAttr('title') ?? 'Agent UI Frame';
    const device = (getAttr('device') ?? 'phone') as T.DesignDeviceKind;
    const parentFrameId = getAttr('parent');
    const notes = getAttr('notes');

    if (frameId) {
      try {
        const existing = repo.getDesignFrame(frameId);
        const htmlPath = writeFrameFileToDisk(baseDir, boardId, existing.id, htmlBody);
        const updated = repo.updateDesignFrame(existing.id, {
          title,
          htmlContent: htmlBody,
          htmlPath,
          notes: notes ?? 'Updated by agent directive',
          authorId: agentId,
          bumpVersion: true,
        });
        createdOrUpdated.push(updated);
        continue;
      } catch {
        /* frameId does not exist yet; create new */
      }
    }

    const created = repo.createDesignFrame({
      boardId,
      parentFrameId,
      title,
      device: ['phone', 'tablet', 'desktop', 'custom'].includes(device) ? device : 'phone',
      htmlContent: htmlBody,
      notes: notes ?? 'Generated by agent directive',
      authorId: agentId,
    });
    const htmlPath = writeFrameFileToDisk(baseDir, boardId, created.id, htmlBody);
    repo.updateDesignFrame(created.id, { htmlPath, bumpVersion: false });
    createdOrUpdated.push(repo.getDesignFrame(created.id));
  }
  return createdOrUpdated;
}

/**
 * Approves a design frame on the canvas, records Observed evidence of the approved version,
 * and optionally dispatches an implementation task to a coding agent with the exact approved HTML/JSX spec.
 */
export async function approveFrameAndHandoff(
  repo: Repo,
  orchestrator: Orchestrator,
  frameId: string,
  input: T.ApproveDesignFrameInput
): Promise<T.ApproveDesignFrameResult> {
  const frame = repo.getDesignFrame(frameId);
  const board = repo.getDesignBoard(frame.boardId);
  const actorId = input.actorId?.trim() || 'winston';
  const nowIso = new Date().toISOString();

  // 1. Record what was approved: the runtime observed this exact frame version.
  // An approval is the owner's decision, not a re-run check, so it is never Verified.
  const evidence = repo.appendEvidence({
    jobId: board.jobId ?? undefined,
    kind: 'artifact',
    class: 'OBSERVED',
    summary: `Owner ${actorId} approved design frame: ${frame.title} (v${frame.version}, ${frame.device})`,
    payload: {
      boardId: board.id,
      boardTitle: board.title,
      frameId: frame.id,
      frameTitle: frame.title,
      version: frame.version,
      device: frame.device,
      width: frame.width,
      height: frame.height,
      sourceFiles: input.targetFiles ?? frame.sourceFiles,
      htmlPath: frame.htmlPath,
      note: input.note ?? null,
    },
    recordedBy: 'runtime',
    recordedByKind: 'system',
  });

  // 2. Mark the frame approved in SQLite
  const approvedFrame = repo.updateDesignFrame(frame.id, {
    status: 'approved',
    approvedBy: actorId,
    approvedAt: nowIso,
    evidenceId: evidence.id,
    sourceFiles: input.targetFiles ?? frame.sourceFiles,
    notes: input.note ? `${frame.notes ? `${frame.notes} · ` : ''}Approved: ${input.note}` : frame.notes,
    bumpVersion: false,
  });

  // 3. Optionally create & dispatch a Build Task to an engineering agent
  let createdTask: T.Task | null = null;
  let startedSession: T.Session | null = null;

  if (input.dispatchBuildTask && board.jobId) {
    const assigneeId = input.assigneeId?.trim() || 'atlas';
    const targetFilesList = (input.targetFiles && input.targetFiles.length > 0 ? input.targetFiles : approvedFrame.sourceFiles).join(', ');
    createdTask = repo.createTask(board.jobId, {
      title: `Implement approved UI design: ${approvedFrame.title} (v${approvedFrame.version})`,
      assigneeId,
      mode: 'build',
      gate: 'none',
    });

    const handoffPrompt = [
      `DESIGN STUDIO APPROVED UI HANDOFF — IMPLEMENT EXACT SPECIFICATION`,
      `Approved Frame: "${approvedFrame.title}" (v${approvedFrame.version}, viewport: ${approvedFrame.device} ${approvedFrame.width}x${approvedFrame.height})`,
      `Approved By: ${actorId} (Evidence ID: ${evidence.id})`,
      input.note ? `Owner Implementation Note: ${input.note}` : '',
      targetFilesList ? `Target Repository Files to Update/Create: ${targetFilesList}` : '',
      approvedFrame.htmlPath ? `Approved Design HTML File in Workspace: ${approvedFrame.htmlPath}` : '',
      `\nApproved HTML/UI Specification:\n\`\`\`html\n${approvedFrame.htmlContent.slice(0, 6000)}\n\`\`\``,
      `\nInstructions: Translate this approved UI design faithfully into the production codebase${targetFilesList ? ` (${targetFilesList})` : ''}, preserving layout, hierarchy, and tokens. Run typecheck/build when complete.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const wakeRes = await orchestrator.wakeAgent(assigneeId, {
        fromActorId: actorId,
        fromActorKind: 'human',
        jobId: board.jobId,
        roomId: board.roomId,
        taskId: createdTask.id,
        reason: `Implement approved Design Studio frame: ${approvedFrame.title}`,
        prompt: handoffPrompt,
      });
      startedSession = wakeRes.session;
    } catch {
      /* agent wake is best-effort if no CLI adapter is installed in test env */
    }
  }

  return {
    frame: approvedFrame,
    evidence,
    task: createdTask,
    session: startedSession,
  };
}
