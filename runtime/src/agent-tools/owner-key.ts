import crypto from 'node:crypto';

/**
 * Owner key (security review S1). Agents run as the owner's OS user, so they can
 * read the runtime token file. Actions only the owner may take additionally
 * require an owner key that the desktop holds (in the macOS Keychain) and the
 * runtime never stores: it keeps only a SHA-256 of it in settings.
 *
 * Enforcement starts once a key is enrolled. Enrolment is allowed only while no
 * key exists; the desktop shows the enrolled fingerprint so a key it did not
 * create is noticed.
 */

export const OWNER_KEY_HEADER = 'x-myaos-owner-key';
export const OWNER_KEY_SETTING = 'ownerKeyHash';

/** Routes that move authority: approval decisions, shipping, policy and budget changes, settings, forced stages. */
const RESERVED: { method: string; pattern: RegExp; when?: (body: Record<string, unknown>) => boolean }[] = [
  { method: 'POST', pattern: /^\/v1\/approvals\/[^/]+\/decision$/ },
  { method: 'POST', pattern: /^\/v1\/jobs\/[^/]+\/ship$/ },
  { method: 'POST', pattern: /^\/v1\/jobs\/[^/]+\/stage$/, when: (b) => b.force === true },
  { method: 'POST', pattern: /^\/v1\/policies$/ },
  { method: 'PATCH', pattern: /^\/v1\/policies\/[^/]+$/ },
  { method: 'DELETE', pattern: /^\/v1\/policies\/[^/]+$/ },
  { method: 'POST', pattern: /^\/v1\/budgets$/ },
  { method: 'POST', pattern: /^\/v1\/settings$/ },
  { method: 'POST', pattern: /^\/v1\/adapters\/env$/ },
  { method: 'POST', pattern: /^\/v1\/timesheets\/[^/]+\/approve$/ },
  { method: 'POST', pattern: /^\/v1\/standups\/run-now$/ },
];

export function isReserved(method: string, pathname: string, body: Record<string, unknown>): boolean {
  return RESERVED.some((r) => r.method === method && r.pattern.test(pathname) && (!r.when || r.when(body)));
}

export const hashOwnerKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');
export const fingerprint = (hash: string) => hash.slice(0, 16).replace(/(.{4})(?=.)/g, '$1-');

export function ownerKeyMatches(given: string | string[] | undefined, storedHash: string): boolean {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(hashOwnerKey(given));
  const b = Buffer.from(storedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
