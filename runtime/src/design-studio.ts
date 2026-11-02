import fs from 'node:fs';
import path from 'node:path';
import type * as T from './api/types.ts';
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
 * Ensures the `.myaos/designs/<boardId>/<frameId>.html` file is written on disk so
 * coding/design agents can surgically edit frames using standard file tools.
 */
export function writeFrameFileToDisk(
  baseDir: string,
  boardId: string,
  frameId: string,
  htmlContent: string
): string {
  const dir = path.join(baseDir, '.myaos', 'designs', boardId);
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
 * Discovers UI screen/component files inside a project repository and extracts
 * their structure into interactive baseline canvas frames (`mode: 'extracted'`).
 */
export function extractRepoScreensToFrames(
  repo: Repo,
  board: T.DesignBoard,
  projectRoot: string,
  targetPaths?: string[],
  deviceOverride?: T.DesignDeviceKind,
  promptHint?: string | null
): T.DesignFrame[] {
  const discoveredFiles: string[] = [];

  if (targetPaths && targetPaths.length > 0) {
    for (const rel of targetPaths) {
      const full = path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        discoveredFiles.push(full);
      }
    }
  }

  if (discoveredFiles.length === 0) {
    const searchDirs = [
      path.join(projectRoot, 'apps/desktop/src/screens'),
      path.join(projectRoot, 'src/screens'),
      path.join(projectRoot, 'src/pages'),
      path.join(projectRoot, 'app'),
      path.join(projectRoot, 'mobile/app'),
      path.join(projectRoot, 'src/components'),
    ];
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && /\.(tsx|jsx|vue|svelte|html)$/i.test(entry.name) && !entry.name.startsWith('_')) {
            discoveredFiles.push(path.join(dir, entry.name));
            if (discoveredFiles.length >= 4) break;
          } else if (entry.isDirectory() && discoveredFiles.length < 4) {
            const subDir = path.join(dir, entry.name);
            const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isFile() && /\.(tsx|jsx)$/i.test(sub.name) && !sub.name.startsWith('_')) {
                discoveredFiles.push(path.join(subDir, sub.name));
                if (discoveredFiles.length >= 4) break;
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (discoveredFiles.length >= 4) break;
    }
  }

  const createdFrames: T.DesignFrame[] = [];
  if (discoveredFiles.length === 0) {
    // Fallback if repo has no standard screen dir yet: synthesize a baseline overview frame for the repo
    const html = buildExtractedComponentHtml({
      repoName: board.designTokens?.brandName ?? path.basename(projectRoot),
      relPath: 'src/App.tsx',
      headings: [board.title, 'Workspace UI Baseline'],
      buttons: ['Primary Action', 'Filter', 'Settings'],
      badges: ['Live', 'Baseline v1'],
      paragraphs: [promptHint || `Extracted baseline surface from ${path.basename(projectRoot)}.`],
      device: deviceOverride ?? 'desktop',
      tokens: board.designTokens,
    });
    const frame = repo.createDesignFrame({
      boardId: board.id,
      title: `${path.basename(projectRoot)} · Baseline UI`,
      device: deviceOverride ?? 'desktop',
      sourceFiles: ['src/App.tsx'],
      htmlContent: html,
      notes: `Extracted baseline from ${projectRoot}`,
      authorId: 'atlas',
    });
    const htmlPath = writeFrameFileToDisk(projectRoot, board.id, frame.id, html);
    createdFrames.push(repo.updateDesignFrame(frame.id, { htmlPath, bumpVersion: false }));
    return createdFrames;
  }

  for (const fullPath of discoveredFiles.slice(0, 4)) {
    const relPath = path.relative(projectRoot, fullPath);
    const source = fs.readFileSync(fullPath, 'utf8');
    const parsed = analyzeUiSourceFile(source, relPath);
    const inferredDevice: T.DesignDeviceKind =
      deviceOverride ?? (relPath.includes('mobile') || relPath.includes('phone') ? 'phone' : 'desktop');
    const html = buildExtractedComponentHtml({
      repoName: board.designTokens?.brandName ?? path.basename(projectRoot),
      relPath,
      headings: parsed.headings,
      buttons: parsed.buttons,
      badges: parsed.badges,
      paragraphs: parsed.paragraphs,
      inputs: parsed.inputs,
      device: inferredDevice,
      tokens: board.designTokens,
      promptHint: promptHint ?? undefined,
    });
    const frame = repo.createDesignFrame({
      boardId: board.id,
      title: `${parsed.screenTitle} (${path.basename(relPath)})`,
      device: inferredDevice,
      sourceFiles: [relPath],
      htmlContent: html,
      notes: `Extracted from ${relPath}${promptHint ? ` · ${promptHint}` : ''}`,
      authorId: 'atlas',
    });
    const htmlPath = writeFrameFileToDisk(projectRoot, board.id, frame.id, html);
    createdFrames.push(repo.updateDesignFrame(frame.id, { htmlPath, bumpVersion: false }));
  }

  return createdFrames;
}

function analyzeUiSourceFile(source: string, relPath: string) {
  const baseName = path.basename(relPath, path.extname(relPath));
  const screenTitle = baseName
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const headings = [...source.matchAll(/<h[1-3][^>]*>([^<{]+)<\/h[1-3]>/gi)]
    .map((m) => m[1]!.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (headings.length === 0) {
    const titleProps = [...source.matchAll(/title=["']([^"']+)["']/gi)].map((m) => m[1]!.trim()).filter(Boolean);
    headings.push(...titleProps.slice(0, 4));
  }
  if (headings.length === 0) headings.push(screenTitle);

  const buttons = [...source.matchAll(/<Button[^>]*>([^<{]+)<\/Button>|<button[^>]*>([^<{]+)<\/button>/gi)]
    .map((m) => (m[1] ?? m[2] ?? '').trim())
    .filter((s) => s.length > 1 && s.length < 32)
    .slice(0, 6);
  if (buttons.length === 0) buttons.push('Save Changes', 'Refresh', 'Configure');

  const inputs = [...source.matchAll(/placeholder=["']([^"']+)["']/gi)]
    .map((m) => m[1]!.trim())
    .filter(Boolean)
    .slice(0, 4);

  const badges = [...source.matchAll(/<(?:Tag|Badge|span)[^>]*>([A-Za-z0-9 ·•_-]{2,22})<\/(?:Tag|Badge|span)>/g)]
    .map((m) => m[1]!.trim())
    .filter(Boolean)
    .slice(0, 6);

  const paragraphs = [...source.matchAll(/<p[^>]*>([^<{]{12,140})<\/p>/gi)]
    .map((m) => m[1]!.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    screenTitle,
    headings: [...new Set(headings)],
    buttons: [...new Set(buttons)],
    inputs: [...new Set(inputs)],
    badges: [...new Set(badges)],
    paragraphs: [...new Set(paragraphs)],
  };
}

function buildExtractedComponentHtml(opts: {
  repoName: string;
  relPath: string;
  headings: string[];
  buttons: string[];
  badges: string[];
  paragraphs: string[];
  inputs?: string[];
  device: T.DesignDeviceKind;
  tokens?: T.DesignTokens;
  promptHint?: string;
}): string {
  const primary = opts.tokens?.colors?.primary ?? '#f0b44c';
  const accent = opts.tokens?.colors?.accent ?? '#4a9eff';
  const mainHeading = opts.headings[0] ?? 'Extracted Screen';
  const subHeadings = opts.headings.slice(1);
  const desc = opts.paragraphs[0] ?? `Live interactive canvas extraction of ${opts.relPath}`;

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #0c0e14;
      --panel: #141822;
      --panel2: #1b2130;
      --border: rgba(255,255,255,0.09);
      --text: #eef1f8;
      --muted: #929bb0;
      --primary: ${primary};
      --accent: ${accent};
      --green: #2ecc8b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: ${opts.device === 'phone' ? '16px 14px 80px' : '24px 28px'};
      line-height: 1.45;
    }
    .top-meta {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      font-size: 11px; color: var(--muted); margin-bottom: 12px;
      padding-bottom: 10px; border-bottom: 1px solid var(--border);
    }
    .code-pill {
      font-family: ui-monospace, SFMono-Regular, monospace;
      background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 6px;
      color: var(--primary);
    }
    .hero {
      display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px;
      margin-bottom: 18px;
    }
    h1 { font-size: ${opts.device === 'phone' ? '20px' : '24px'}; margin: 0 0 4px; font-weight: 700; letter-spacing: -0.02em; }
    .sub { color: var(--muted); font-size: 13px; margin: 0; }
    .btn-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn {
      border: 1px solid var(--border); background: var(--panel2); color: var(--text);
      padding: 7px 13px; border-radius: 9px; font-size: 12.5px; font-weight: 500; cursor: pointer;
    }
    .btn.primary {
      background: linear-gradient(180deg, var(--primary), #d4922a);
      color: #151109; border: 0; font-weight: 600;
    }
    .search-row {
      display: flex; gap: 8px; margin-bottom: 16px;
    }
    .input {
      flex: 1; background: var(--panel); border: 1px solid var(--border);
      color: var(--text); padding: 9px 12px; border-radius: 10px; font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: ${opts.device === 'phone' ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))'};
      gap: 12px;
    }
    .card {
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 13px; padding: 15px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.35);
    }
    .card h3 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
    .card p { margin: 0; font-size: 12.5px; color: var(--muted); }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .badge {
      font-size: 11px; padding: 2px 8px; border-radius: 999px;
      background: rgba(74, 158, 255, 0.14); color: var(--accent); border: 1px solid rgba(74,158,255,0.3);
    }
  </style>
</head>
<body>
  <div class="top-meta" data-section="source-header">
    <span>${opts.repoName} · Baseline UI</span>
    <span class="code-pill">${opts.relPath}</span>
  </div>

  <div class="hero" data-section="screen-header">
    <div>
      <h1>${mainHeading}</h1>
      <p class="sub">${desc}</p>
    </div>
    <div class="btn-row">
      ${opts.buttons
        .map((b, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-section="action-${i}">${b}</button>`)
        .join('\n      ')}
    </div>
  </div>

  ${
    opts.inputs && opts.inputs.length > 0
      ? `<div class="search-row" data-section="inputs">
    ${opts.inputs.map((inp) => `<input class="input" placeholder="${inp}" />`).join('\n    ')}
  </div>`
      : ''
  }

  <div class="grid" data-section="content-grid">
    ${(subHeadings.length > 0 ? subHeadings : ['Overview & Telemetry', 'Active Items', 'Recent Activity'])
      .map(
        (h, idx) => `<div class="card" data-section="card-${idx}">
      <h3>${h}</h3>
      <p>${opts.paragraphs[idx + 1] ?? `Interactive component surface extracted from ${opts.relPath}. Click any element to pin iteration instructions.`}</p>
      <div class="badges">
        <span class="badge">${opts.badges[idx] ?? 'Verified State'}</span>
        <span class="badge" style="color: var(--green); border-color: rgba(46,204,139,0.3); background: rgba(46,204,139,0.12);">Interactive</span>
      </div>
    </div>`
      )
      .join('\n    ')}
  </div>
</body>
</html>`;
}

/**
 * Generates or iterates on canvas frames based on a user prompt (Greenfield or Iteration on existing frames).
 */
export function synthesizeDesignFramesForPrompt(
  repo: Repo,
  board: T.DesignBoard,
  input: T.GenerateDesignInput,
  baseDir: string
): T.DesignFrame[] {
  const action = input.action ?? (input.targetFrameIds && input.targetFrameIds.length > 0 ? 'update' : 'create');
  const device = input.device ?? 'phone';
  const authorId = input.agentId ?? 'atlas';
  const prompt = input.prompt.trim();

  // Case 1: Update or Fork existing frame(s) on the canvas
  if ((action === 'update' || action === 'fork') && input.targetFrameIds && input.targetFrameIds.length > 0) {
    const results: T.DesignFrame[] = [];
    for (const targetId of input.targetFrameIds) {
      const target = repo.getDesignFrame(targetId);
      const iteratedHtml = applyPromptIterationToHtml(target.htmlContent, target.title, prompt, input.pinnedElement);
      if (action === 'update') {
        const htmlPath = writeFrameFileToDisk(baseDir, board.id, target.id, iteratedHtml);
        const updated = repo.updateDesignFrame(target.id, {
          htmlContent: iteratedHtml,
          htmlPath,
          status: 'iterating',
          notes: prompt,
          authorId,
          bumpVersion: true,
        });
        results.push(updated);
      } else {
        // Fork a new variant next to the target frame on the canvas
        const forkedTitle = `${target.title.replace(/\s*\(Fork.*\)$/i, '')} · Variant`;
        const created = repo.createDesignFrame({
          boardId: board.id,
          parentFrameId: target.id,
          title: forkedTitle,
          device: input.device ?? target.device,
          width: target.width,
          height: target.height,
          sourceFiles: target.sourceFiles,
          htmlContent: iteratedHtml,
          notes: `Forked from ${target.title} v${target.version}: ${prompt}`,
          authorId,
        });
        const htmlPath = writeFrameFileToDisk(baseDir, board.id, created.id, iteratedHtml);
        results.push(repo.updateDesignFrame(created.id, { htmlPath, bumpVersion: false }));
      }
    }
    return results;
  }

  // Case 2: Greenfield / Multi-Variant Canvas Generation
  const count = Math.max(1, Math.min(4, input.variantCount ?? (prompt.match(/\b([234])\s+(?:variations?|options?|designs?|screens?)/i) ? Number(RegExp.$1) : 2)));
  const Archetypes = [
    { suffix: 'Option A · Timeline & Cards', layout: 'cards', accent: '#f0b44c' },
    { suffix: 'Option B · Split Interactive Studio', layout: 'split', accent: '#4a9eff' },
    { suffix: 'Option C · Conversational Guided Flow', layout: 'guided', accent: '#2ecc8b' },
    { suffix: 'Option D · Compact High-Density Grid', layout: 'grid', accent: '#c084fc' },
  ];

  const createdFrames: T.DesignFrame[] = [];
  const shortTitle = prompt
    .replace(/^(?:design|create|build|generate|make)\s+(?:\d+\s+)?(?:variations?\s+of\s+|screens?\s+for\s+)?/i, '')
    .slice(0, 42)
    .trim() || board.title;

  for (let i = 0; i < count; i++) {
    const arch = Archetypes[i % Archetypes.length]!;
    const frameTitle = count === 1 ? shortTitle : `${shortTitle} — ${arch.suffix}`;
    const html = buildGreenfieldVariantHtml({
      title: frameTitle,
      prompt,
      device,
      layout: arch.layout as 'cards' | 'split' | 'guided' | 'grid',
      accent: arch.accent,
      brandName: board.designTokens?.brandName ?? 'MyaOS',
    });
    const created = repo.createDesignFrame({
      boardId: board.id,
      title: frameTitle,
      device,
      htmlContent: html,
      notes: prompt,
      authorId,
    });
    const htmlPath = writeFrameFileToDisk(baseDir, board.id, created.id, html);
    createdFrames.push(repo.updateDesignFrame(created.id, { htmlPath, bumpVersion: false }));
  }

  return createdFrames;
}

function applyPromptIterationToHtml(
  existingHtml: string,
  title: string,
  instruction: string,
  pinnedElement?: string | null
): string {
  const bannerHtml = `
  <!-- Iteration Banner applied by Design Studio -->
  <div data-section="iteration-callout" style="margin: 12px 0; padding: 12px 14px; border-radius: 11px; background: rgba(240,180,76,0.12); border: 1px solid rgba(240,180,76,0.4); color: #f6f7fb; font-size: 12.5px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
    <div>
      <strong style="color: #f0b44c; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.06em; display: block; margin-bottom: 2px;">
        Updated Component${pinnedElement ? ` (${pinnedElement})` : ''}
      </strong>
      <span>${instruction.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
    </div>
    <span style="padding: 3px 9px; border-radius: 999px; background: rgba(46,204,139,0.2); color: #2ecc8b; font-size: 11px; font-weight: 600; white-space: nowrap;">Live Iteration</span>
  </div>`;

  if (existingHtml.includes('</body>')) {
    return existingHtml.replace('</body>', `${bannerHtml}\n</body>`);
  }
  return `${existingHtml}\n${bannerHtml}`;
}

function buildGreenfieldVariantHtml(opts: {
  title: string;
  prompt: string;
  device: T.DesignDeviceKind;
  layout: 'cards' | 'split' | 'guided' | 'grid';
  accent: string;
  brandName: string;
}): string {
  const isPhone = opts.device === 'phone';
  const safePrompt = opts.prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTitle = opts.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #0b0d13;
      --surface: #131722;
      --surface-2: #1b2030;
      --line: rgba(255,255,255,0.09);
      --text: #f3f5fa;
      --muted: #939bb0;
      --accent: ${opts.accent};
      --green: #2ecc8b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(ellipse 90% 50% at 50% 0%, ${opts.accent}18, transparent 70%), var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      padding: ${isPhone ? '14px 14px 82px' : '24px 28px'};
      min-height: 100vh;
    }
    .status-bar {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11px; color: var(--muted); margin-bottom: 14px;
    }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px; border-radius: 999px;
      background: ${opts.accent}22; color: var(--accent);
      border: 1px solid ${opts.accent}55; font-size: 11px; font-weight: 600;
    }
    .header { margin-bottom: 18px; }
    .header h1 { font-size: ${isPhone ? '20px' : '24px'}; margin: 6px 0 6px; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.45; }
    .tabs {
      display: flex; gap: 6px; background: var(--surface); padding: 4px;
      border-radius: 11px; border: 1px solid var(--line); margin-bottom: 16px;
    }
    .tab {
      flex: 1; text-align: center; padding: 7px 10px; font-size: 12px; font-weight: 600;
      border-radius: 8px; color: var(--muted); cursor: pointer;
    }
    .tab.active { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
    .layout-container {
      display: grid;
      grid-template-columns: ${opts.layout === 'split' && !isPhone ? '1.2fr 1fr' : opts.layout === 'grid' && !isPhone ? '1fr 1fr' : '1fr'};
      gap: 12px;
    }
    .card {
      background: rgba(19, 23, 34, 0.9);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 15px;
      box-shadow: 0 14px 34px rgba(0,0,0,0.4);
    }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .card-title { font-weight: 600; font-size: 14px; }
    .metric { font-size: 22px; font-weight: 700; color: var(--accent); margin: 4px 0; }
    .list-item {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 12px; border-radius: 10px; background: var(--surface-2);
      margin-top: 8px; font-size: 12.5px;
    }
    .cta-dock {
      ${isPhone ? 'position: fixed; left: 12px; right: 12px; bottom: 12px;' : 'margin-top: 18px;'}
      background: rgba(19, 23, 34, 0.95); backdrop-filter: blur(12px);
      border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    .btn-primary {
      background: var(--accent); color: #0c0e14; border: 0;
      padding: 9px 16px; border-radius: 10px; font-weight: 700; font-size: 12.5px; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="status-bar" data-section="top-bar">
    <span>${opts.brandName}</span>
    <span class="pill">● ${opts.layout.toUpperCase()} LAYOUT</span>
  </div>

  <div class="header" data-section="hero-header">
    <h1>${safeTitle}</h1>
    <p>${safePrompt}</p>
  </div>

  <div class="tabs" data-section="navigation-tabs">
    <div class="tab active" onclick="switchTab(this, 'primary')">Primary View</div>
    <div class="tab" onclick="switchTab(this, 'timeline')">Timeline & History</div>
    <div class="tab" onclick="switchTab(this, 'insights')">AI Insights</div>
  </div>

  <div class="layout-container" id="main-content" data-section="main-stage">
    <div class="card" data-section="primary-card">
      <div class="card-head">
        <span class="card-title">Live Interactive Surface</span>
        <span class="pill">Ready</span>
      </div>
      <div class="metric">98.4% Match</div>
      <p style="margin: 0; font-size: 12px; color: var(--muted);">
        Designed for ${opts.brandName}. Click any section on this frame to pin an iteration note or fork a variation.
      </p>
      <div class="list-item" data-section="step-1">
        <span>1. Personalized State & Inference</span>
        <span style="color: var(--green); font-weight: 600;">Active</span>
      </div>
      <div class="list-item" data-section="step-2">
        <span>2. Interactive Timeline & Media</span>
        <span style="color: var(--accent); font-weight: 600;">Synced</span>
      </div>
    </div>

    <div class="card" data-section="secondary-card">
      <div class="card-head">
        <span class="card-title">Contextual Recommendations</span>
        <span style="font-size: 11px; color: var(--muted);">Updated just now</span>
      </div>
      <div class="list-item" data-section="recommendation-1">
        <div>
          <div style="font-weight: 600;">Proactive Next Action</div>
          <div style="font-size: 11.5px; color: var(--muted);">One-tap user flow with instant feedback</div>
        </div>
        <button class="btn-primary" style="padding: 6px 11px;">Preview</button>
      </div>
      <div class="list-item" data-section="recommendation-2">
        <div>
          <div style="font-weight: 600;">Verification & Telemetry</div>
          <div style="font-size: 11.5px; color: var(--muted);">Connected to live substrate state</div>
        </div>
        <span class="pill">Verified</span>
      </div>
    </div>
  </div>

  <div class="cta-dock" data-section="bottom-action-bar">
    <div style="font-size: 12px;">
      <div style="font-weight: 600;">Ready for Review</div>
      <div style="color: var(--muted); font-size: 11px;">Approve to hand off to coding agent</div>
    </div>
    <button class="btn-primary">Continue →</button>
  </div>

  <script>
    function switchTab(el, view) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
    }
    // Allow parent Design Studio canvas to inspect clicked sections for element-pinned comments
    document.addEventListener('click', function(e) {
      var sec = e.target.closest('[data-section]');
      if (sec && window.parent) {
        window.parent.postMessage({
          type: 'myaos-design-element-click',
          section: sec.getAttribute('data-section'),
          text: (sec.innerText || '').slice(0, 80).replace(/\\s+/g, ' ').trim()
        }, '*');
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Approves a design frame on the canvas, records a VERIFIED Design Evidence artifact,
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

  // 1. Record VERIFIED Design Evidence on the Job (or standalone)
  const evidence = repo.appendEvidence({
    jobId: board.jobId ?? undefined,
    kind: 'artifact',
    class: 'OBSERVED',
    summary: `Approved Design Studio Frame: ${frame.title} (v${frame.version}, ${frame.device})`,
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
  const verifiedEvidence = repo.verifyEvidence(evidence.id, { verifiedBy: actorId });

  // 2. Mark the frame approved in SQLite
  const approvedFrame = repo.updateDesignFrame(frame.id, {
    status: 'approved',
    approvedBy: actorId,
    approvedAt: nowIso,
    evidenceId: verifiedEvidence.id,
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
      `Approved By: ${actorId} (Evidence ID: ${verifiedEvidence.id})`,
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
    evidence: verifiedEvidence,
    task: createdTask,
    session: startedSession,
  };
}
