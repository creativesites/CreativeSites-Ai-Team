import type { DatabaseSync } from 'node:sqlite';
import { listAccounts } from './accounts.ts';
import { checkAccountIsolation } from './isolation.ts';
import { startTaskUsage, stopTaskUsage } from './taskUsage.ts';

/**
 * Wires K9 (AI account isolation) and per-task usage rows into session start.
 * Pure database logic; the session manager calls it with what it already knows.
 */
export const ISOLATION_PREFIX = 'AI account isolation (K9): ';

export interface SessionAccountDecision {
  ok: boolean;
  reason?: string;
  /** The account the session's usage is attributed to, when one is known. */
  accountId: string | null;
}

export function decideSessionAccount(db: DatabaseSync, projectId: string | null, adapterAccountId: string | null): SessionAccountDecision {
  let project: { ai_account_id: string | null; confidential: number | null } | undefined;
  try {
    project = projectId
      ? (db.prepare('SELECT ai_account_id, confidential FROM projects WHERE id = ?').get(projectId) as typeof project)
      : undefined;
  } catch {
    return { ok: true, accountId: null }; // an older store without the usage tables: nothing to enforce
  }
  const accounts = listAccounts(db, { includeArchived: true });
  const result = checkAccountIsolation({ aiAccountId: project?.ai_account_id ?? null, confidential: project?.confidential ?? 0 }, adapterAccountId, accounts);
  if (!result.ok) return { ok: false, reason: result.reason, accountId: null };
  const byLogin = adapterAccountId ? accounts.find((a) => !a.archivedAt && a.adapterAccountId === adapterAccountId) : undefined;
  return { ok: true, accountId: project?.ai_account_id ?? byLogin?.id ?? null };
}

export function startSessionUsage(
  db: DatabaseSync,
  input: { accountId: string | null; sessionId: string; taskId: string | null; jobId: string | null; agentId: string; taskType: string | null }
): string | null {
  if (!input.accountId) return null;
  try {
    return startTaskUsage(db, {
      accountId: input.accountId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      jobId: input.jobId,
      agentId: input.agentId,
      taskType: input.taskType,
    }).id;
  } catch {
    return null; // usage is an estimate; never block work on it
  }
}

/** Closes any open usage row for the session (called when a turn ends). */
export function stopSessionUsage(db: DatabaseSync, sessionId: string): number {
  let n = 0;
  try {
    for (const r of db.prepare('SELECT id FROM task_usage WHERE session_id = ? AND ended_at IS NULL').all(sessionId) as { id: string }[]) {
      stopTaskUsage(db, r.id);
      n++;
    }
  } catch {
    /* older store */
  }
  return n;
}
