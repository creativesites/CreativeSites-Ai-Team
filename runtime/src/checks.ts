import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findExecutable } from './adapters.ts';
const execFileAsync = promisify(execFile);
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

export interface IntegrationOutcome {
  status: 'merged' | 'already_integrated' | 'conflict' | 'skipped';
  taskId: string;
  branch: string | null;
  jobBranch: string;
  commitSha?: string | null;
  conflicts?: string[];
  reason?: string;
}

export function taskShortId(taskId: string): string {
  return `task-${taskId.replace(/^task[_-]?/, '').slice(-6)}`;
}

export function taskBranchName(jobNumber: number, taskId: string): string {
  return `myaos/job-${jobNumber}-${taskShortId(taskId)}`;
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
    const worktree = await this.workDirFor(job, task.id);
    const result = await runShell(command, worktree.path, this.timeoutMs);
    const evidence = this.recordRun(job.id, task, command, result, worktree.path);
    return { taskId: task.id, command, worktree: worktree.path, result, evidence };
  }

  /**
   * Commits the job worktree so the verifier can re-run checks on a clean
   * checkout of exactly what the builder produced. Evidence is Observed: the
   * runtime ran git and kept the commit SHA and patch artifact.
   */
  async commitWorktree(jobId: string, message = 'session changes', taskId?: string | null): Promise<{ committed: boolean; commitSha: string; evidence: T.Evidence | null }> {
    const job = this.repo.getJob(jobId);
    const worktree = await this.workDirFor(job, taskId);
    const status = await runShell('git status --porcelain=v1', worktree.path, 30_000);
    const changed = status.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const before = workspaces.workspaceState(worktree.path);
    if (!changed.length) return { committed: false, commitSha: before.headSha ?? worktree.baseSha, evidence: null };

    const diffArtifact = saveArtifact(this.artifactsDir, (await runShell('git diff HEAD --no-color', worktree.path, 60_000)).stdout, 'text/x-diff; charset=utf-8');
    this.repo.addArtifact(diffArtifact);
    const safeMessage = `myaos job ${job.number}: ${message}`.replace(/'/g, "'\\''").slice(0, 240);
    const commit = await runShell(
      `git add -A && git -c user.name=MyaOS -c user.email=myaos@localhost commit --quiet -m '${safeMessage}'`,
      worktree.path,
      120_000
    );
    if (commit.exitCode !== 0) {
      throw new ConflictError(`Could not commit the worktree: ${commit.stderr.slice(-800) || `exit ${commit.exitCode}`}`);
    }
    const after = workspaces.workspaceState(worktree.path);
    const commitSha = after.headSha ?? worktree.baseSha;
    const stat = await runShell('git show --stat --oneline --no-color HEAD', worktree.path, 30_000);
    const statArtifact = saveArtifact(this.artifactsDir, stat.stdout, 'text/plain; charset=utf-8');
    this.repo.addArtifact(statArtifact);
    const evidence = this.repo.appendEvidence({
      jobId: job.id,
      taskId: taskId ?? null,
      kind: 'diff',
      class: 'OBSERVED',
      summary: `Committed ${changed.length} file${changed.length === 1 ? '' : 's'} at ${commitSha.slice(0, 12)}`,
      payload: {
        commitSha,
        message: safeMessage,
        changedFiles: changed,
        patchArtifact: diffArtifact.sha256,
        statArtifact: statArtifact.sha256,
        stat: stat.stdout.slice(0, 4000),
      },
      artifactRefs: [diffArtifact.sha256, statArtifact.sha256],
      command: `git add -A && git commit -m '${safeMessage}'`,
      exitCode: 0,
      commitSha,
      worktree: worktree.path,
      recordedBy: 'runtime',
      recordedByKind: 'system',
    });
    return { committed: true, commitSha, evidence };
  }

  async snapshot(jobId: string, actorId?: string, taskId?: string | null): Promise<T.Evidence> {
    const job = this.repo.getJob(jobId);
    const worktree = await this.workDirFor(job, taskId);
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
    const isNonCode = job.kind && job.kind !== 'code';
    const selected = taskIds?.length
      ? taskIds.map((id) => {
          const task = this.repo.getTask(id);
          if (task.jobId !== job.id) throw new NotFoundError(`task ${id} not found on this job`);
          return task;
        })
      : job.tasks.filter((t) => Boolean(t.checkCommand) || isNonCode);
    if (!selected.length) {
      if (isNonCode) {
        const observed = this.repo.appendEvidence({
          jobId: job.id,
          kind: 'review',
          class: 'OBSERVED',
          summary: `Independent verification of ${job.kind} job deliverable by ${actorId}`,
          payload: { kind: job.kind, verifiedBy: actorId, verifiedAt: new Date().toISOString() },
          recordedBy: 'runtime',
          recordedByKind: 'system',
        });
        const verified = this.repo.verifyEvidence(observed.id, {
          verifiedBy: actorId,
          note: `Independent verification of ${job.kind} job deliverable`,
        });
        return {
          ok: true,
          base: job.baseSha ?? 'non-code',
          results: [{ taskId: job.id, ok: true, exitCode: 0, evidenceId: verified.id, error: null }],
        };
      }
      throw new ConflictError('No task with a check command to verify');
    }

    const hasCheckCommands = selected.some((t) => Boolean(t.checkCommand?.trim()));
    const worktree = hasCheckCommands ? await this.worktreeForJob(job) : null;
    const base = worktree
      ? (workspaces.workspaceState(worktree.path).headSha ?? worktree.baseSha)
      : (job.baseSha ?? 'non-code');
    const results: VerificationOutcome[] = [];

    for (const task of selected) {
      if (task.assigneeId && task.assigneeId === actorId) {
        results.push({ taskId: task.id, ok: false, exitCode: null, evidenceId: null, error: 'The verifier cannot be the task assignee' });
        continue;
      }
      const command = task.checkCommand?.trim();
      if (!command) {
        if (isNonCode) {
          const taskEvidence = job.evidence.find((e) => e.taskId === task.id && e.class !== 'VERIFIED' && e.recordedBy !== actorId);
          if (!taskEvidence) {
            results.push({ taskId: task.id, ok: false, exitCode: null, evidenceId: null, error: 'No deliverable evidence recorded for this non-code task' });
            continue;
          }
          const verified = this.repo.verifyEvidence(taskEvidence.id, {
            verifiedBy: actorId,
            note: `Independent verification of ${job.kind} deliverable`,
          });
          results.push({ taskId: task.id, ok: true, exitCode: 0, evidenceId: verified.id, error: null });
          continue;
        }
        results.push({ taskId: task.id, ok: false, exitCode: null, evidenceId: null, error: 'No check command' });
        continue;
      }
      // K8: a task's work lives on its own branch until it is integrated, so verify that head.
      const taskWt = this.repo.findTaskWorktree(task.id);
      const taskHead = taskWt && fs.existsSync(path.join(taskWt.path, '.git')) ? workspaces.workspaceState(taskWt.path).headSha : null;
      const taskBase = taskHead ?? base;
      const cleanPath = path.join(this.worktreeRoot, `verify-${job.number}-${Date.now()}-${task.id.slice(-4)}`);
      try {
        workspaces.createDetachedWorktree(worktree!.repoPath, cleanPath, taskBase);
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
            note: `The runtime re-ran the check in a clean worktree at ${taskBase}`,
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
        workspaces.removeWorktree(worktree!.repoPath, cleanPath);
      }
    }
    await this.applyVerificationToTasks(job.id, actorId, results);
    return { ok: results.every((r) => r.ok), base, results };
  }

  /**
   * Task lifecycle after verification (K3). A passing re-run moves a task waiting in
   * needs_review to verified. A check that ran and failed returns the task to its
   * assignee as `assigned`, with the failing criterion in the reason, and a job in the
   * verify stage goes back to build. Results that never ran a check (the verifier is
   * the assignee, no command, no worktree) change nothing.
   */
  private async applyVerificationToTasks(jobId: string, actorId: string, results: VerificationOutcome[]): Promise<void> {
    const failures: { taskId: string; reason: string }[] = [];
    for (const r of results) {
      let task: T.Task;
      try {
        task = this.repo.getTask(r.taskId);
      } catch {
        continue; // a non-code job result is keyed by the job id
      }
      if (r.ok) {
        if (task.status === 'needs_review') {
          try {
            this.repo.transitionTask(task.id, 'verified', { actorId, actorKind: 'agent', reason: 'independent check passed' });
          } catch (e) {
            if (!(e instanceof ConflictError)) throw e;
          }
          await this.integrateTaskSafely(jobId, task.id);
        }
        continue;
      }
      const ran = (r.exitCode !== null && r.exitCode !== 0) || /timed out/i.test(r.error ?? '');
      if (!ran) continue;
      const criteria = this.repo.taskCriterionTexts(task.id);
      const failing = criteria.length ? `criterion "${criteria.join('"; "')}"` : `task "${task.title}"`;
      failures.push({ taskId: task.id, reason: `Verification failed on ${failing}: ${r.error ?? `check exited ${r.exitCode}`}` });
    }
    if (failures.length) this.repo.returnFailedVerification(jobId, failures, actorId);
  }

  /**
   * Phase 2 Ship Actions: ships a verified/approved job's worktree changes into
   * the project repository via merge, cherry-pick, or branch publication, and
   * records OBSERVED git evidence.
   */
  async ship(jobId: string, input: T.ShipJobInput): Promise<T.ShipJobResult> {
    if (!input.actorId?.trim()) throw new InputError('actorId is required');
    const job = this.repo.getJob(jobId);
    const pendingApprovals = job.approvals.filter((a) => a.status === 'pending');
    if (pendingApprovals.length > 0) {
      throw new ConflictError(`Cannot ship while ${pendingApprovals.length} approval(s) are still pending`);
    }
    const strategy = input.strategy ?? 'merge';
    if (!['merge', 'cherry-pick', 'branch', 'pr'].includes(strategy)) {
      throw new InputError('strategy must be one of: merge, cherry-pick, branch, pr');
    }
    // WP5 5.3: a pull request needs the GitHub CLI; fail before anything is pushed.
    const gh = strategy === 'pr' ? findExecutable('gh') : null;
    if (strategy === 'pr' && !gh) throw new ConflictError('Opening a pull request needs the GitHub CLI (gh) installed and signed in. Nothing was pushed.');

    // Ensure any dirty worktree state is committed first
    const committed = await this.commitWorktree(job.id, input.message ?? `ship ${job.title}`);
    const worktree = await this.worktreeForJob(job);
    const repoState = workspaces.workspaceState(worktree.repoPath);
    const targetBranch = input.targetBranch?.trim() || repoState.branch || 'main';
    const jobBranch = `myaos/job-${job.number}`;
    let finalSha = committed.commitSha;
    let commandUsed = `git branch -f ${jobBranch} ${committed.commitSha}`;

    if (strategy === 'merge') {
      commandUsed = `git merge --no-ff ${committed.commitSha} -m 'Merge ${jobBranch}: ${job.title.replace(/'/g, '')}'`;
      const mergeRes = await runShell(
        `git -c user.name=MyaOS -c user.email=myaos@localhost merge --no-ff ${committed.commitSha} -m 'Merge ${jobBranch}: ${job.title.replace(/'/g, '')}'`,
        worktree.repoPath,
        60_000
      );
      if (mergeRes.exitCode !== 0) {
        throw new ConflictError(`Git merge failed: ${mergeRes.stderr.slice(-600) || mergeRes.stdout.slice(-600)}`);
      }
      finalSha = workspaces.workspaceState(worktree.repoPath).headSha ?? committed.commitSha;
    } else if (strategy === 'cherry-pick') {
      commandUsed = `git cherry-pick ${committed.commitSha}`;
      const cpRes = await runShell(
        `git -c user.name=MyaOS -c user.email=myaos@localhost cherry-pick ${committed.commitSha}`,
        worktree.repoPath,
        60_000
      );
      if (cpRes.exitCode !== 0 && !/nothing to commit|previous cherry-pick is now empty/i.test(cpRes.stdout + cpRes.stderr)) {
        throw new ConflictError(`Git cherry-pick failed: ${cpRes.stderr.slice(-600) || cpRes.stdout.slice(-600)}`);
      }
      finalSha = workspaces.workspaceState(worktree.repoPath).headSha ?? committed.commitSha;
    }

    let prUrl: string | null = null;
    if (strategy === 'pr') {
      const remote = input.remote?.trim() || 'origin';
      const run = (cmd: string, args: string[]) => execFileAsync(cmd, args, { cwd: worktree.repoPath, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
      try {
        await run('git', ['branch', '-f', jobBranch, committed.commitSha]);
      } catch {
        /* the job branch is checked out in its worktree and already at this commit */
      }
      try {
        await run('git', ['push', '-u', remote, `${jobBranch}:${jobBranch}`]);
      } catch (e) {
        throw new ConflictError(`git push to ${remote} failed: ${String((e as { stderr?: string }).stderr ?? (e as Error).message).slice(-600)}`);
      }
      const body = [
        `Job #${job.number}: ${job.title}`,
        job.brief ? `\n${job.brief}` : '',
        job.criteria.length ? `\nAcceptance criteria:\n${job.criteria.map((c) => `- ${c.text} (${c.evidenceClass})`).join('\n')}` : '',
        '\nOpened by the MyaOS runtime after verification and owner approval.',
      ].join('\n');
      try {
        const out = await run(gh!, ['pr', 'create', '--draft', '--base', targetBranch, '--head', jobBranch, '--title', `${job.title} (job #${job.number})`, '--body', body]);
        prUrl = String(out.stdout).trim().split('\n').filter((l) => /^https?:\/\//.test(l.trim())).pop() ?? null;
      } catch (e) {
        throw new ConflictError(`The branch was pushed, but gh pr create failed: ${String((e as { stderr?: string }).stderr ?? (e as Error).message).slice(-600)}`);
      }
      if (!prUrl) throw new ConflictError('gh pr create did not print a pull request URL');
      commandUsed = `git push -u ${remote} ${jobBranch} && gh pr create --draft --base ${targetBranch} --head ${jobBranch}`;
      finalSha = committed.commitSha;
    }

    const shipStatus: T.ShipStatus =
      strategy === 'merge' ? 'merged' : strategy === 'cherry-pick' ? 'cherry_picked' : strategy === 'pr' ? 'pr_opened' : 'branch_pushed';
    const shipPayload = {
      strategy,
      targetBranch,
      jobBranch,
      commitSha: finalSha,
      shippedBy: input.actorId,
      shippedAt: new Date().toISOString(),
      ...(prUrl ? { prUrl } : {}),
    };
    const evidence = this.repo.appendEvidence({
      jobId: job.id,
      kind: 'deploy',
      class: 'OBSERVED',
      summary: prUrl
        ? `Pull request opened: ${prUrl} (${jobBranch} → ${targetBranch} at ${finalSha.slice(0, 12)})`
        : `Shipped via ${strategy} to ${strategy === 'branch' ? jobBranch : targetBranch} at ${finalSha.slice(0, 12)}`,
      payload: shipPayload,
      command: commandUsed,
      exitCode: 0,
      commitSha: finalSha,
      worktree: worktree.repoPath,
      recordedBy: 'runtime',
      recordedByKind: 'system',
    });
    const updatedJob = this.repo.setJobShipped(job.id, {
      shipSha: finalSha,
      shipStatus,
      shipPayload,
    });
    return {
      ok: true,
      job: updatedJob,
      strategy,
      branch: strategy === 'branch' || strategy === 'pr' ? jobBranch : targetBranch,
      targetBranch: strategy === 'branch' ? jobBranch : targetBranch,
      commitSha: finalSha,
      evidence,
      ...(prUrl ? { prUrl } : {}),
    };
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

  async worktreeForJob(job: T.JobDetail): Promise<Worktree> {
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

  /** The task's own worktree when one was created for it, otherwise the job worktree. */
  private async workDirFor(job: T.JobDetail, taskId?: string | null): Promise<Worktree> {
    if (taskId) {
      const tw = this.repo.findTaskWorktree(taskId);
      if (tw && fs.existsSync(path.join(tw.path, '.git'))) {
        return { path: tw.path, baseSha: tw.baseSha ?? 'HEAD', repoPath: this.jobRepoPath(job) };
      }
    }
    return this.worktreeForJob(job);
  }

  /**
   * K8: one worktree and branch per task, `myaos/job-<n>-task-<id>`, created from the job's
   * integration branch `myaos/job-<n>`. (Git cannot hold both `myaos/job-<n>` and
   * `myaos/job-<n>/task-<m>`: one ref would be a file and a directory, so the separator is `-`.)
   */
  async worktreeForTask(job: T.JobDetail, task: T.Task): Promise<Worktree & { branch: string; jobBranch: string }> {
    const jobWt = await this.worktreeForJob(job); // creates the integration branch from the base when missing
    const jobBranch = `myaos/job-${job.number}`;
    const branch = taskBranchName(job.number, task.id);
    const existing = this.repo.findTaskWorktree(task.id);
    if (existing && fs.existsSync(path.join(existing.path, '.git'))) {
      if (existing.state !== 'active') this.repo.setWorktreeState(existing.id, 'active');
      return { path: existing.path, baseSha: existing.baseSha ?? 'HEAD', repoPath: jobWt.repoPath, branch: existing.branch ?? branch, jobBranch };
    }
    const base = workspaces.workspaceState(jobWt.path).headSha ?? jobWt.baseSha;
    const worktreePath = path.join(this.worktreeRoot, `job-${job.number}-${job.id.slice(-6)}-${taskShortId(task.id)}`);
    workspaces.ensureWorktree(jobWt.repoPath, worktreePath, branch, base);
    this.repo.recordWorktree({ jobId: job.id, taskId: task.id, path: worktreePath, branch, baseSha: base });
    return { path: worktreePath, baseSha: base, repoPath: jobWt.repoPath, branch, jobBranch };
  }

  private readonly integrationQueue = new Map<string, Promise<unknown>>();

  /**
   * K8: merges the task branch into the job branch with a merge commit (no fast-forward),
   * once the task is verified or done. Serialised per job because every merge happens in
   * the job worktree. A merge that fails is aborted cleanly, the task goes to needs_human
   * with the conflicting paths in the reason, and both branches stay as they were.
   */
  integrateTask(job: T.JobDetail, task: T.Task): Promise<IntegrationOutcome> {
    const prior = this.integrationQueue.get(job.id) ?? Promise.resolve();
    const run = prior.catch(() => undefined).then(() => this.integrateTaskNow(job.id, task.id));
    this.integrationQueue.set(job.id, run);
    return run;
  }

  /** integrateTask for hooks: never throws, because completion handling must not fail on a merge. */
  async integrateTaskSafely(jobId: string, taskId: string): Promise<IntegrationOutcome | null> {
    try {
      const job = this.repo.getJob(jobId);
      const task = this.repo.getTask(taskId);
      if (task.status !== 'done' && task.status !== 'verified') return null;
      return await this.integrateTask(job, task);
    } catch (e) {
      console.error('[checker] task integration failed:', (e as Error).message);
      return null;
    }
  }

  private async integrateTaskNow(jobId: string, taskId: string): Promise<IntegrationOutcome> {
    const job = this.repo.getJob(jobId);
    const task = this.repo.getTask(taskId);
    const jobBranch = `myaos/job-${job.number}`;
    const tw = this.repo.findTaskWorktree(task.id);
    if (!tw || !tw.branch || !fs.existsSync(path.join(tw.path, '.git'))) {
      return { status: 'skipped', taskId, branch: null, jobBranch, reason: 'the task has no worktree' };
    }
    if (task.status !== 'done' && task.status !== 'verified') {
      return { status: 'skipped', taskId, branch: tw.branch, jobBranch, reason: `the task is ${task.status}` };
    }
    const jobWt = await this.worktreeForJob(job);
    // Whatever the agent left uncommitted is part of the task; the job worktree must be clean to merge.
    await this.commitWorktree(job.id, `task ${task.title}`.slice(0, 120), task.id);
    await this.commitDirty(jobWt.path, `myaos job ${job.number}: job worktree changes before integrating ${tw.branch}`);

    const already = await runShell(`git merge-base --is-ancestor ${tw.branch} ${jobBranch}`, jobWt.path, 30_000);
    if (already.exitCode === 0) {
      this.repo.setWorktreeState(tw.id, 'integrated');
      return { status: 'already_integrated', taskId, branch: tw.branch, jobBranch, commitSha: workspaces.workspaceState(jobWt.path).headSha ?? null };
    }
    const message = `Merge ${tw.branch}: ${task.title.replace(/['"\\\n]/g, ' ').slice(0, 120)}`;
    const merge = await runShell(
      `git -c user.name=MyaOS -c user.email=myaos@localhost merge --no-ff -m '${message}' ${tw.branch}`,
      jobWt.path,
      120_000
    );
    if (merge.exitCode === 0) {
      const sha = workspaces.workspaceState(jobWt.path).headSha ?? null;
      this.repo.setWorktreeState(tw.id, 'integrated');
      this.repo.appendEvidence({
        jobId: job.id,
        taskId: task.id,
        kind: 'command',
        class: 'OBSERVED',
        summary: `Integrated ${tw.branch} into ${jobBranch} at ${(sha ?? '').slice(0, 12)}`,
        payload: { branch: tw.branch, jobBranch, mergeCommit: sha },
        command: `git merge --no-ff ${tw.branch}`,
        exitCode: 0,
        commitSha: sha,
        worktree: jobWt.path,
        recordedBy: 'runtime',
        recordedByKind: 'system',
      });
      return { status: 'merged', taskId, branch: tw.branch, jobBranch, commitSha: sha };
    }
    const conflicts = (await runShell('git diff --name-only --diff-filter=U', jobWt.path, 30_000)).stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    await runShell('git merge --abort', jobWt.path, 30_000);
    const reason = conflicts.length
      ? `merge conflict integrating ${tw.branch} into ${jobBranch}: ${conflicts.join(', ')}`
      : `could not merge ${tw.branch} into ${jobBranch}: ${(merge.stderr || merge.stdout).trim().slice(-300)}`;
    try {
      this.repo.transitionTask(task.id, 'needs_human', { actorId: 'runtime:integration', actorKind: 'system', reason });
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
    return { status: 'conflict', taskId, branch: tw.branch, jobBranch, conflicts, reason };
  }

  private async commitDirty(dir: string, message: string): Promise<void> {
    const status = await runShell('git status --porcelain=v1', dir, 30_000);
    if (!status.stdout.trim()) return;
    await runShell(
      `git add -A && git -c user.name=MyaOS -c user.email=myaos@localhost commit --quiet -m '${message.replace(/'/g, '').slice(0, 240)}'`,
      dir,
      120_000
    );
  }

  private jobRepoPath(job: T.JobDetail): string {
    if (!job.projectId) throw new ConflictError('This job is not bound to a project with a repository');
    const project = this.repo.getProject(job.projectId);
    const repoRow = project.repos.find((r) => r.path);
    if (!repoRow?.path) throw new ConflictError('This project has no repository path to run checks in');
    return workspaces.assertUnderRoots(repoRow.path, this.workspaceRoots);
  }
}
