import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GitBranchItem, GitCommitItem, GitDiffSummary, WorkspaceState } from './api/types.ts';

// Git/workspace helpers. The runtime runs git itself, so the result is Observed
// state; a failure is returned as unknown, never as "clean".

const UNKNOWN: WorkspaceState = {
  exists: false,
  isGit: false,
  branch: null,
  headSha: null,
  dirty: false,
  unknown: true,
  error: 'The directory could not be inspected.',
};

function git(cwd: string, args: string[], timeout = 5000): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

let cachedGitAvailable: boolean | null = null;

export function gitAvailable(): boolean {
  if (cachedGitAvailable !== null) return cachedGitAvailable;
  try {
    execFileSync('git', ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    cachedGitAvailable = true;
    return true;
  } catch {
    cachedGitAvailable = false;
    return false;
  }
}

export function workspaceState(dir: string): WorkspaceState {
  const resolved = path.resolve(expand(dir));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ...UNKNOWN, error: 'The directory does not exist.' };
  }
  try {
    const inside = git(resolved, ['rev-parse', '--is-inside-work-tree']);
    if (inside !== 'true') {
      return { exists: true, isGit: false, branch: null, headSha: null, dirty: false, unknown: false, error: null };
    }
    const branch = git(resolved, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const headSha = git(resolved, ['rev-parse', 'HEAD']);
    const status = git(resolved, ['status', '--porcelain']);
    return {
      exists: true,
      isGit: true,
      branch: branch === 'HEAD' ? null : branch,
      headSha: headSha || null,
      dirty: status.length > 0,
      unknown: false,
      error: null,
    };
  } catch (e) {
    return { exists: true, isGit: false, branch: null, headSha: null, dirty: false, unknown: true, error: (e as Error).message };
  }
}

export function expand(p: string): string {
  if (p === '~') return os.homedir();
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

export function isInside(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

export function assertUnderRoots(target: string, roots: string[]): string {
  const resolved = path.resolve(expand(target));
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new WorkspaceError(`Path ${resolved} is outside the allowed workspace roots (${roots.join(', ')})`);
  }
  return resolved;
}

export class WorkspaceError extends Error {}

export interface AttachResult {
  name: string;
  path: string;
  state: WorkspaceState;
  remoteUrl: string | null;
}

export function attach(pathInput: string, roots: string[]): AttachResult {
  const dir = assertUnderRoots(pathInput, roots);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new WorkspaceError(`No directory at ${dir}`);
  }
  const state = workspaceState(dir);
  let remoteUrl: string | null = null;
  try {
    remoteUrl = git(dir, ['remote', 'get-url', 'origin']) || null;
  } catch {
    remoteUrl = null;
  }
  return { name: path.basename(dir), path: dir, state, remoteUrl };
}

export function clone(url: string, parentInput: string, name: string | undefined, roots: string[]): AttachResult {
  if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(url)) {
    throw new WorkspaceError('Only http(s), ssh and git URLs can be cloned.');
  }
  const parent = assertUnderRoots(parentInput, roots);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const derived = name?.trim() || url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() || 'project';
  const target = path.join(parent, derived);
  if (fs.existsSync(target)) throw new WorkspaceError(`A folder already exists at ${target}`);
  try {
    execFileSync('git', ['clone', '--quiet', url, target], {
      encoding: 'utf8',
      timeout: 10 * 60 * 1000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new WorkspaceError(`git clone failed: ${(e as Error).message}`);
  }
  return { name: derived, path: target, state: workspaceState(target), remoteUrl: url };
}

export function createFolder(pathInput: string, initGit: boolean, roots: string[]): AttachResult {
  const dir = assertUnderRoots(pathInput, roots);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    throw new WorkspaceError(`The folder is not empty: ${dir}`);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (initGit) {
    try {
      execFileSync('git', ['init', '--quiet', dir], { encoding: 'utf8', timeout: 5000 });
      execFileSync('git', ['-C', dir, 'checkout', '--quiet', '-b', 'main'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) {
      throw new WorkspaceError(`Could not initialise git: ${(e as Error).message}`);
    }
  }
  return { name: path.basename(dir), path: dir, state: workspaceState(dir), remoteUrl: null };
}

export function createWorktree(repoPath: string, worktreePath: string, branch: string, base: string): void {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true, mode: 0o700 });
  try {
    execFileSync('git', ['-C', repoPath, 'worktree', 'add', '-b', branch, worktreePath, base], {
      encoding: 'utf8',
      timeout: 120_000,
    });
  } catch (e) {
    throw new WorkspaceError(`Could not create a worktree: ${(e as Error).message}`);
  }
}

export function ensureWorktree(repoPath: string, worktreePath: string, branch: string, base: string): void {
  if (fs.existsSync(path.join(worktreePath, '.git'))) return;
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true, mode: 0o700 });
  try {
    execFileSync('git', ['-C', repoPath, 'worktree', 'add', '-b', branch, worktreePath, base], {
      encoding: 'utf8',
      timeout: 120_000,
    });
  } catch (e) {
    // The branch may already exist from an earlier run: attach it instead.
    try {
      execFileSync('git', ['-C', repoPath, 'worktree', 'add', worktreePath, branch], {
        encoding: 'utf8',
        timeout: 120_000,
      });
    } catch {
      throw new WorkspaceError(`Could not create a worktree: ${(e as Error).message}`);
    }
  }
}

export function createDetachedWorktree(repoPath: string, worktreePath: string, base: string): void {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true, mode: 0o700 });
  try {
    execFileSync('git', ['-C', repoPath, 'worktree', 'add', '--detach', worktreePath, base], {
      encoding: 'utf8',
      timeout: 120_000,
    });
  } catch (e) {
    throw new WorkspaceError(`Could not create a clean worktree: ${(e as Error).message}`);
  }
}

export function removeWorktree(repoPath: string, worktreePath: string): void {
  try {
    execFileSync('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktreePath], {
      encoding: 'utf8',
      timeout: 60_000,
    });
  } catch {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
}

export type { GitBranchItem, GitCommitItem, GitDiffSummary };

export function gitBranches(dir: string): GitBranchItem[] {
  const resolved = path.resolve(expand(dir));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];
  try {
    const raw = git(resolved, ['branch', '-a', '--format=%(HEAD)|%(refname)|%(refname:short)']);
    if (!raw) return [];
    const lines = raw.split('\n').filter(Boolean);
    const branches: GitBranchItem[] = [];
    const seenNames = new Set<string>();

    for (const line of lines) {
      const parts = line.split('|');
      const isCurrent = parts[0]?.trim() === '*';
      const ref = parts[1]?.trim() || '';
      const shortName = parts[2]?.trim() || '';

      if (!shortName || shortName.endsWith('/HEAD') || ref.includes('HEAD')) {
        continue;
      }

      if (!seenNames.has(shortName)) {
        seenNames.add(shortName);
        branches.push({
          name: shortName,
          ref,
          isCurrent,
          isRemote: ref.startsWith('refs/remotes/'),
        });
      }
    }

    branches.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      if (a.isRemote !== b.isRemote) return a.isRemote ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return branches;
  } catch {
    return [];
  }
}

export function gitCommits(dir: string, limit = 15, branch?: string): GitCommitItem[] {
  const resolved = path.resolve(expand(dir));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];
  try {
    const args = ['log', '-n', String(limit), '--format=%H|%h|%s|%an|%cI'];
    if (branch && branch.trim()) {
      args.push(branch.trim());
    }
    const raw = git(resolved, args);
    if (!raw) return [];
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, author, date] = line.split('|');
        return {
          hash: hash || '',
          shortHash: shortHash || '',
          subject: subject || '',
          author: author || '',
          date: date || '',
        };
      });
  } catch {
    return [];
  }
}

const MAX_DIFF_BYTES = 256 * 1024;

export function gitDiff(
  dir: string,
  options?: { branch?: string; base?: string; mode?: 'working' | 'compare' }
): GitDiffSummary {
  const resolved = path.resolve(expand(dir));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { diff: '', files: [], truncated: false };
  }

  const mode = options?.mode || 'working';
  const branch = options?.branch?.trim();
  const base = options?.base?.trim() || 'main';

  try {
    let files: { path: string; status: string }[] = [];
    let diff = '';
    let truncated = false;

    if (mode === 'compare') {
      const targetBranch = branch || 'HEAD';
      const range = `${base}...${targetBranch}`;

      // Get list of changed files
      try {
        const rawFiles = execFileSync('git', ['-C', resolved, 'diff', '--name-status', range], {
          encoding: 'utf8',
          timeout: 10_000,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 16 * 1024 * 1024,
        }).trim();

        files = rawFiles
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('\t');
            return {
              status: parts[0]?.trim() || 'M',
              path: parts[parts.length - 1]?.trim() || '',
            };
          });
      } catch {
        files = [];
      }

      // Get unified diff text with truncation safety
      try {
        const rawDiff = execFileSync('git', ['-C', resolved, 'diff', range], {
          encoding: 'utf8',
          timeout: 15_000,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 16 * 1024 * 1024,
        }).trim();

        if (rawDiff.length > MAX_DIFF_BYTES) {
          diff = rawDiff.slice(0, MAX_DIFF_BYTES) + '\n\n... (Diff truncated at 256 KB. Inspect individual files or use Git CLI for full details)';
          truncated = true;
        } else {
          diff = rawDiff;
        }
      } catch (err) {
        diff = `(Unable to retrieve full unified diff: ${(err as Error).message})`;
      }
    } else {
      // mode === 'working'
      let currentBranch: string | null = null;
      try {
        currentBranch = git(resolved, ['rev-parse', '--abbrev-ref', 'HEAD']);
      } catch {
        currentBranch = null;
      }

      const isCurrent = !branch || branch === 'HEAD' || (currentBranch && branch === currentBranch);

      if (isCurrent) {
        // Working directory uncommitted changes vs HEAD
        const statusRaw = git(resolved, ['status', '--porcelain=v1']);
        files = statusRaw
          .split('\n')
          .filter(Boolean)
          .map((line) => ({
            status: line.slice(0, 2).trim(),
            path: line.slice(3).trim(),
          }));

        try {
          const rawDiff = execFileSync('git', ['-C', resolved, 'diff', 'HEAD'], {
            encoding: 'utf8',
            timeout: 10_000,
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
          }).trim();

          if (rawDiff.length > MAX_DIFF_BYTES) {
            diff = rawDiff.slice(0, MAX_DIFF_BYTES) + '\n\n... (Diff truncated at 256 KB)';
            truncated = true;
          } else {
            diff = rawDiff;
          }
        } catch {
          diff = '';
        }
      } else {
        // Working directory files vs specified branch
        try {
          const rawFiles = execFileSync('git', ['-C', resolved, 'diff', '--name-status', branch], {
            encoding: 'utf8',
            timeout: 10_000,
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
          }).trim();

          files = rawFiles
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const parts = line.split('\t');
              return {
                status: parts[0]?.trim() || 'M',
                path: parts[parts.length - 1]?.trim() || '',
              };
            });
        } catch {
          files = [];
        }

        try {
          const rawDiff = execFileSync('git', ['-C', resolved, 'diff', branch], {
            encoding: 'utf8',
            timeout: 15_000,
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
          }).trim();

          if (rawDiff.length > MAX_DIFF_BYTES) {
            diff = rawDiff.slice(0, MAX_DIFF_BYTES) + '\n\n... (Diff truncated at 256 KB)';
            truncated = true;
          } else {
            diff = rawDiff;
          }
        } catch (err) {
          diff = `(Unable to retrieve diff against ${branch}: ${(err as Error).message})`;
        }
      }
    }

    return { diff, files, truncated };
  } catch {
    return { diff: '', files: [], truncated: false };
  }
}

export interface ProjectFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface ProjectFileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  truncated: boolean;
  isBinary: boolean;
}

export interface GitWorktreeItem {
  path: string;
  head: string;
  shortHead: string;
  branch: string;
  isMain: boolean;
  detached: boolean;
  clean?: boolean;
}

export function listProjectFiles(dir: string, subPath = '', maxEntries = 150): ProjectFileItem[] {
  const resolvedRoot = path.resolve(expand(dir));
  const targetDir = subPath ? path.resolve(resolvedRoot, subPath) : resolvedRoot;
  if (!isInside(resolvedRoot, targetDir) || !fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return [];
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const items: ProjectFileItem[] = [];
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '.DS_Store') continue;
      const full = path.join(targetDir, e.name);
      const isDir = e.isDirectory();
      let size: number | undefined;
      try {
        if (!isDir) size = fs.statSync(full).size;
      } catch {
        /* ignore */
      }
      const rel = path.relative(resolvedRoot, full);
      items.push({ name: e.name, path: rel, isDirectory: isDir, size });
      if (items.length >= maxEntries) break;
    }
    return items.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
  } catch {
    return [];
  }
}

export function readProjectFile(dir: string, relPath: string, maxBytes = 256 * 1024): ProjectFileContent {
  const resolvedRoot = path.resolve(expand(dir));
  const targetFile = path.resolve(resolvedRoot, relPath);
  if (!isInside(resolvedRoot, targetFile) || !fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
    throw new Error('File not found or outside project directory');
  }
  const stat = fs.statSync(targetFile);
  const size = stat.size;
  // Check if binary by reading first 512 bytes
  const fd = fs.openSync(targetFile, 'r');
  const buffer = Buffer.alloc(Math.min(size, 512));
  fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);
  const isBinary = buffer.includes(0);
  if (isBinary) {
    return {
      path: relPath,
      name: path.basename(relPath),
      content: '(Binary file)',
      size,
      truncated: false,
      isBinary: true,
    };
  }
  const readSize = Math.min(size, maxBytes);
  const contentBuf = Buffer.alloc(readSize);
  const fd2 = fs.openSync(targetFile, 'r');
  fs.readSync(fd2, contentBuf, 0, readSize, 0);
  fs.closeSync(fd2);
  const content = contentBuf.toString('utf8');
  return {
    path: relPath,
    name: path.basename(relPath),
    content,
    size,
    truncated: size > maxBytes,
    isBinary: false,
  };
}

export function gitWorktrees(dir: string): GitWorktreeItem[] {
  const resolved = path.resolve(expand(dir));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];
  try {
    const raw = git(resolved, ['worktree', 'list', '--porcelain']);
    if (!raw) return [];
    const blocks = raw.trim().split('\n\n').filter(Boolean);
    return blocks.map((block) => {
      const lines = block.split('\n');
      let wtPath = '';
      let head = '';
      let branch = '';
      let detached = false;
      for (const l of lines) {
        if (l.startsWith('worktree ')) wtPath = l.slice(9);
        else if (l.startsWith('HEAD ')) head = l.slice(5);
        else if (l.startsWith('branch ')) branch = l.slice(7).replace('refs/heads/', '');
        else if (l === 'detached') detached = true;
      }
      let clean = true;
      try {
        const st = git(wtPath, ['status', '--porcelain=v1']);
        clean = st.trim().length === 0;
      } catch {
        clean = false;
      }
      return {
        path: wtPath,
        head,
        shortHead: head.slice(0, 7),
        branch: branch || (detached ? 'detached HEAD' : 'unknown'),
        isMain: wtPath === resolved,
        detached,
        clean,
      };
    });
  } catch {
    return [];
  }
}

export interface DirectoryListing {
  current: string;
  parent: string | null;
  directories: { name: string; path: string; isGit: boolean }[];
  isGit: boolean;
  exists: boolean;
}

export function listSystemDirectories(dir?: string): DirectoryListing {
  const target = dir?.trim() ? dir.trim() : os.homedir();
  const resolved = path.resolve(expand(target));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { current: resolved, parent: null, directories: [], isGit: false, exists: false };
  }
  const isGit = fs.existsSync(path.join(resolved, '.git'));
  const parent = resolved === '/' ? null : path.dirname(resolved);
  const directories: { name: string; path: string; isGit: boolean }[] = [];
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const full = path.join(resolved, e.name);
      let subGit = false;
      try {
        subGit = fs.existsSync(path.join(full, '.git'));
      } catch {
        /* ignore */
      }
      directories.push({ name: e.name, path: full, isGit: subGit });
    }
    directories.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    /* ignore permission errors */
  }
  return { current: resolved, parent, directories, isGit, exists: true };
}

export function pickFolderOS(defaultDir?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const platform = process.platform;
    if (platform === 'darwin') {
      let script = 'POSIX path of (choose folder with prompt "Select Project Folder"';
      if (defaultDir && fs.existsSync(expand(defaultDir))) {
        const escaped = path.resolve(expand(defaultDir)).replace(/"/g, '\\"');
        script += ` default location POSIX file "${escaped}"`;
      }
      script += ')';
      execFile('osascript', ['-e', script], { timeout: 120000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
        } else {
          resolve(stdout.trim().replace(/\/$/, ''));
        }
      });
    } else if (platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }`;
      execFile('powershell', ['-NoProfile', '-Command', ps], { timeout: 120000 }, (err, stdout) => {
        if (err || !stdout) resolve(null);
        else resolve(stdout.trim().replace(/[\\/]$/, ''));
      });
    } else {
      execFile('zenity', ['--file-selection', '--directory', '--title=Select Project Folder'], { timeout: 120000 }, (err, stdout) => {
        if (err || !stdout) resolve(null);
        else resolve(stdout.trim().replace(/\/$/, ''));
      });
    }
  });
}

