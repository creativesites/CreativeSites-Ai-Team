/**
 * Environment allowlist for agent processes (security review S3). Agents get what
 * a CLI needs to run and authenticate, and nothing of the runtime's own state.
 */
const EXACT = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'TERM', 'COLORTERM', 'TZ',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE',
  'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'COMSPEC', 'PATHEXT',
]);
const PREFIXES = ['LC_', 'XDG_', 'ANTHROPIC_', 'CLAUDE_', 'GEMINI_', 'GOOGLE_', 'OPENAI_', 'CODEX_', 'ANTIGRAVITY_', 'AWS_', 'VERTEX_'];
/** Never passed, even when a prefix would match. */
const DENY_PREFIXES = ['MYAOS_'];

export function agentEnv(source: NodeJS.ProcessEnv, extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  // The owner can pass extra variables by name (comma-separated) without widening the defaults.
  const pass = new Set((source.MYAOS_AGENT_ENV_PASS ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (DENY_PREFIXES.some((p) => k.startsWith(p))) continue;
    if (EXACT.has(k) || pass.has(k) || PREFIXES.some((p) => k.startsWith(p))) out[k] = v;
  }
  // Extras come from the runtime itself (adapters.env keys, PATH fix-ups): trusted.
  for (const [k, v] of Object.entries(extra)) out[k] = v;
  return out;
}
