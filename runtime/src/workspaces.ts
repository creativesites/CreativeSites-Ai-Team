import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceState } from './api/types.ts';

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

export function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
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
