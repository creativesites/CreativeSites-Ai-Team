import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Session-scoped agent tokens (programme plan K4, security review S1/S2).
 * Only a SHA-256 of each token is stored. A token is bound to one identity and
 * optionally one session, job and task; the actor of every tool call comes from
 * the token, never from the request body.
 */

export interface AgentPrincipal {
  kind: 'agent';
  tokenId: string;
  identityId: string;
  sessionId: string | null;
  jobId: string | null;
  taskId: string | null;
  role: string;
}

export const AGENT_TOKEN_PREFIX = 'myaos_agt_';
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function issueAgentToken(
  db: DatabaseSync,
  input: { identityId: string; sessionId?: string | null; jobId?: string | null; taskId?: string | null; role?: string; ttlMs?: number; now?: Date }
): { token: string; tokenId: string; expiresAt: string } {
  const token = AGENT_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  const tokenId = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
  db.prepare(
    `INSERT INTO session_tokens (id, token_hash, identity_id, session_id, job_id, task_id, role, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(tokenId, hash(token), input.identityId, input.sessionId ?? null, input.jobId ?? null, input.taskId ?? null, input.role ?? 'member', now.toISOString(), expiresAt);
  return { token, tokenId, expiresAt };
}

/** Resolves a bearer value to an agent principal, or null when it is not a live agent token. */
export function resolveAgentToken(db: DatabaseSync, bearer: string | undefined, now = new Date()): AgentPrincipal | null {
  const given = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!given.startsWith(AGENT_TOKEN_PREFIX)) return null;
  const row = db.prepare('SELECT * FROM session_tokens WHERE token_hash = ?').get(hash(given)) as Record<string, string | null> | undefined;
  if (!row || row.revoked_at || String(row.expires_at) <= now.toISOString()) return null;
  return {
    kind: 'agent',
    tokenId: String(row.id),
    identityId: String(row.identity_id),
    sessionId: row.session_id ?? null,
    jobId: row.job_id ?? null,
    taskId: row.task_id ?? null,
    role: String(row.role),
  };
}

export function revokeSessionTokens(db: DatabaseSync, sessionId: string, now = new Date()): number {
  return Number(
    db.prepare('UPDATE session_tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL').run(now.toISOString(), sessionId).changes
  );
}
