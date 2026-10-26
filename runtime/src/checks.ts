import fs from 'node:fs';
import path from 'node:path';
import type * as T from './api/types.ts';
import { readArtifact, saveArtifact } from './artifacts.ts';
import { runShell, type CommandResult } from './exec.ts';
import { ConflictError, InputError, NotFoundError, type Repo } from './store/repo.ts';
import * as workspaces from './workspaces.ts';

// Runtime-owned checks are the "Observed" tier: the runtime chose the directory,
// ran the command itself, and keeps the real exit code and output.

export interface CheckerOptions {
  repo: Repo;
  workspaceRoots: string[];
  worktreeRoot: string;
  artifactsDir: string;
  timeoutMs?: number;
}

interface Worktree {
  path: string;
  baseSha: string;
  repoPath: string;
}

export interface CheckOutcome {
  taskId: string;
  command: string;
  worktree: string;
  result: CommandResult;
  evidence: T.Evidence;
}

export interface VerificationOutcome {
  taskId: string;
  ok: boolean;
  exitCode: number | null;
  evidenceId: string | null;
  error: string | null;
}

export class Checker {
  private readonly repo: Repo;
  private readonly workspaceRoots: string[];
  private readonly worktreeRoot: string;
  private readonly artifactsDir: string;
  private readonly timeoutMs: number;

  constructor(opts: CheckerOptions) {
    this.repo = opts.repo;
    this.workspaceRoots = opts.workspaceRoots;
    this.worktreeRoot = opts.worktreeRoot;
    this.artifactsDir = opts.artifactsDir;
    this.timeoutMs = opts.timeoutMs ?? 15 * 60_000;
  }

  async runTaskCheck(jobId: string, taskId: string): Promise<CheckOutcome> {
    const job = this.repo.getJob(jobId);
    const task = this.repo.getTask(taskId);
    if (task.jobId !== job.id) throw new InputError('This task belongs to a different job');
    const command = task.checkCommand?.trim();
    if (!command) throw new ConflictError('This task has no check command to run');
    const worktree = await this.ensureJobWorktree(job);
    const result = await runShell(command, worktree.path, this.timeoutMs);
    const evidence = this.recordRun(job.id, task, command, result, worktree.path);
    return { taskId: task.id, command, worktree: worktree.path, result, evidence };
  }

  async snapshot(jobId: string, actorId?: string): Promise<T.Evidence> {
    const job = this.repo.getJob(jobId);
    const worktree = await this.ensureJobWorktree(job);
    const status = await runShell('git status --porcelain=v1', worktree.path, 30_000);
    const diff = await runShell('git diff HEAD --no-color --no-ext-diff', worktree.path, 60_000);
    const changed = status.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const statusArtifact = saveArtifact(this.artifactsDir, status.stdout, 'text/plain; charset=utf-8');
    const diffArtifact = saveArtifact(this.artifactsDir, diff.stdout || '', 'text/x-diff; charset=utf-8');
    for (const artifact of [statusArtifact, diffArtifact]) {
      this.repo.addArtifact(artifact);
    }
    const state = workspaces.workspaceState(worktree.path);
    return this.repo.appendEvidence({
      jobId: job.id,
      kind: 'diff',
      class: 'OBSERVED',
      summary:
        changed.length === 0
          ? 'Worktree snapshot: no file changes'
          : `Worktree snapshot: ${changed.length} changed file${changed.length === 1 ? '' : 's'}`,
      payload: {
        changedFiles: changed,
        status: status.stdout,
        statusArtifact: statusArtifact.sha256,
        diffArtifact: diffArtifact.sha256,
        diffTruncated: diff.truncated,
        diffExitCode: diff.exitCode,
        actorId: actorId ?? null,
      },
      artifactRefs: [statusArtifact.sha256, diffArtifact.sha256],
      command: 'git status --porcelain && git diff HEAD',
      exitCode: status.exitCode,
      commitSha: state.headSha,
      worktree: worktree.path,
      recordedBy: 'runtime',
      recordedByKind: 'system',
    });
  }

  /**
   * Independent verification: a different actor asks the runtime to re-run each
   * task's check in a fresh worktree at the job's base commit. Passing runs become
   * VERIFIED evidence; failing runs are recorded as Observed failures.
   */
  async verify(jobId: string, actorId: string, taskIds?: string[]): Promise<{ ok: boolean; base: string; results: VerificationOutcome[] }> {
    if (!actorId.trim()) throw new InputError('actorId is required');
    this.repo.getIdentity(actorId); // must be a real coworker, not a string
    const job = this.repo.getJob(jobId);
    const selected = taskIds?.length
      ? taskIds.map((id) => {
          const task = this.repo.getTask(id);
          if (task.jobId !== job.id) throw new NotFoundError(`task ${id} not found on this job`);
          return task;
        })
      : job.tasks.filter((t) => Boolean(t.checkCommand));
    if (!selected.length) throw new ConflictError('No task with a check command to verify');
    const worktree = await this.ensureJobWorktree(job);
    const base = worktree.baseSha;
    const results: VerificationOutcome[] = [];

    for (const task of selected) {
      const command = task.checkCommand?.trim();
      if (!command) {
        results.push({ taskId: task.id, ok: false, exitCode: null, evidenceId: null, error: 'No check command' });
        continue;
      }
      if (task.assigneeId && task.assigneeId === actorId) {
        results.push({ taskId: task.id, ok: false, exitCode: null, evidenceId: null, error: 'The verifier cannot be the task assignee' });
        continue;
      }
      const cleanPath = path.join(this.worktreeRoot, `verify-${job.number}-${Date.now()}-${task.id.slice(-4)}`);
      try {
        workspaces.createDetachedWorktree(worktree.repoPath, cleanPath, base);
      } catch (e) {
        results.push({ taskId: task.id, ok: false, exitCode: null, evidenceId: null, error: (e as Error).message });
        continue;
      }
      try {
        const result = await runShell(command, cleanPath, this.timeoutMs);
        const state = workspaces.workspaceState(cleanPath);
        const observed = this.recordRun(job.id, task, command, result, cleanPath);
        if (result.exitCode === 0) {
          const verified = this.repo.verifyEvidence(observed.id, {
            verifiedBy: actorId,
            note: `The runtime re-ran the check in a clean worktree at ${base}`,
            command,
            exitCode: result.exitCode,
            commitSha: state.headSha,
            worktree: cleanPath,
          });
          results.push({ taskId: task.id, ok: true, exitCode: result.exitCode, evidenceId: verified.id, error: null });
        } else {
          results.push({
            taskId: task.id,
            ok: false,
            exitCode: result.exitCode,
            evidenceId: observed.id,
            error: result.timedOut ? 'The check timed out' : `The check exited ${result.exitCode}`,
          });
        }
      } finally {
        workspaces.removeWorktree(worktree.repoPath, cleanPath);
      }
    }
    return { ok: results.every((r) => r.ok), base, results };
  }

  readArtifact(sha256: string): { bytes: Buffer; mime: string } | null {
    const artifact = this.repo.getArtifact(sha256);
    const bytes = readArtifact(this.artifactsDir, sha256);
    return bytes ? { bytes, mime: artifact.mime ?? 'application/octet-stream' } : null;
  }

  private recordRun(jobId: string, task: T.Task, command: string, result: CommandResult, worktree: string): T.Evidence {
    const stdoutArtifact = saveArtifact(this.artifactsDir, result.stdout, 'text/plain; charset=utf-8');
    const stderrArtifact = saveArtifact(this.artifactsDir, result.stderr, 'text/plain; charset=utf-8');
    for (const artifact of [stdoutArtifact, stderrArtifact]) this.repo.addArtifact(artifact);
    const state = workspaces.workspaceState(worktree);
    const kind: T.Evidence['kind'] = /\b(test|spec|jest|vitest|pytest|go test|cargo test|npm test)\b/i.test(command) ? 'test' : 'command';
    return this.repo.appendEvidence({
      jobId,
      taskId: task.id,
      kind,
      class: 'OBSERVED',
      summary: `${command} — exit ${result.exitCode ?? 'no code'}${result.timedOut ? ' (timed out)' : ''}`,
      payload: {
        stdout: result.stdout.slice(-4000),
        stderr: result.stderr.slice(-4000),
        stdoutArtifact: stdoutArtifact.sha256,
        stderrArtifact: stderrArtifact.sha256,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        truncated: result.truncated,
        signal: result.signal,
      },
      artifactRefs: [stdoutArtifact.sha256, stderrArtifact.sha256],
      command,
      exitCode: result.exitCode,
      commitSha: state.headSha,
      worktree,
      recordedBy: 'runtime',
      recordedByKind: 'system',
    });
  }

  private async ensureJobWorktree(job: T.JobDetail): Promise<Worktree> {
    const existing = this.repo.findWorktree(job.id);
    if (existing && fs.existsSync(path.join(existing.path, '.git'))) {
      const state = workspaces.workspaceState(existing.path);
      return { path: existing.path, baseSha: existing.baseSha ?? state.headSha ?? 'HEAD', repoPath: this.jobRepoPath(job) };
    }
    const repoPath = this.jobRepoPath(job);
    const state = workspaces.workspaceState(repoPath);
    const base = job.baseSha ?? state.headSha ?? 'HEAD';
    const worktreePath = path.join(this.worktreeRoot, `job-${job.number}-${job.id.slice(-6)}`);
    workspaces.ensureWorktree(repoPath, worktreePath, `myaos/job-${job.number}`, base);
    const created = workspaces.workspaceState(worktreePath);
    this.repo.recordWorktree({ jobId: job.id, path: worktreePath, branch: `myaos/job-${job.number}`, baseSha: created.headSha ?? base });
    this.repo.setJobBaseSha(job.id, created.headSha ?? base);
    return { path: worktreePath, baseSha: created.headSha ?? base, repoPath };
  }

  private jobRepoPath(job: T.JobDetail): string {
    if (!job.projectId) throw new ConflictError('This job is not bound to a project with a repository');
    const project = this.repo.getProject(job.projectId);
    const repoRow = project.repos.find((r) => r.path);
    if (!repoRow?.path) throw new ConflictError('This project has no repository path to run checks in');
    return workspaces.assertUnderRoots(repoRow.path, this.workspaceRoots);
  }
}
