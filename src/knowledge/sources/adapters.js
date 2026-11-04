'use strict';
/**
 * Ingestion adapters. Each adapter maps an external payload to capture()/ingest() calls and enforces an
 * explicit allow-list scope: nothing outside the authorised channels/folders is ever read or stored.
 * No network access here; a connector (Slack app, webhook) hands payloads to these functions.
 */
const fs = require('fs');
const path = require('path');
const { forbidden, invalid } = require('../core/errors');

/** Slack Events/export message shape -> source. `scope` = { workspace, channels:[ids], projectByChannel?:{} } */
function captureSlackMessage(ki, principal, msg, scope) {
  if (!scope || !Array.isArray(scope.channels) || !scope.channels.length) throw invalid('Slack adapter needs an explicit channel allow-list');
  if (!scope.channels.includes(msg.channel)) {
    ki.audit.record({ principal, action: 'source.rejected_out_of_scope', outcome: 'denied', entityType: 'source', orgId: principal.orgId, detail: { platform: 'slack', channel: msg.channel } });
    throw forbidden(`Channel ${msg.channel} is not in the authorised scope`);
  }
  if (msg.subtype && !['thread_broadcast'].includes(msg.subtype)) return { skipped: msg.subtype };
  const tsMs = Number(String(msg.ts).split('.')[0]) * 1000;
  return ki.sources.capture(principal, {
    kind: 'message', platform: 'slack', workspace: scope.workspace, channel: msg.channel, messageId: msg.ts, threadId: msg.thread_ts || null,
    authorId: msg.user, authorName: msg.user_name || msg.user, originalTs: new Date(tsMs).toISOString(),
    originalUrl: scope.workspace_url ? `${scope.workspace_url}/archives/${msg.channel}/p${String(msg.ts).replace('.', '')}` : null,
    text: msg.text, projectId: (scope.projectByChannel || {})[msg.channel] || scope.projectId || null, classification: scope.classification || 'internal',
  });
}

/** Import files from an allow-listed root. Duplicates and unchanged files are ignored (content hash). */
async function importFolder(ki, principal, { root, allowedRoots, projectId, category = 'general', recursive = true, maxFiles = 500 }) {
  const real = fs.realpathSync(root);
  if (!allowedRoots || !allowedRoots.some((r) => { const rr = fs.realpathSync(r); return real === rr || real.startsWith(rr + path.sep); })) throw forbidden('Folder is outside the authorised import roots');
  const out = { imported: [], duplicates: [], failed: [] };
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    const f = path.join(dir, e.name);
    if (e.isSymbolicLink()) return []; // never follow links out of scope
    return e.isDirectory() ? (recursive ? walk(f) : []) : [f];
  });
  for (const f of walk(real).slice(0, maxFiles)) {
    try {
      const r = await ki.documents.ingest(principal, { path: f, filename: path.basename(f), projectId, category, sourceKind: 'import', lineageKey: `import:${path.relative(real, f)}` });
      (r.duplicate ? out.duplicates : out.imported).push({ file: path.relative(real, f), documentId: r.documentId, versionNo: r.versionNo });
    } catch (e) { out.failed.push({ file: path.relative(real, f), error: e.message }); }
  }
  return out;
}

/** Existing community threads (markdown) as source documents — read-only import, idempotent. */
async function importCommunityThreads(ki, principal, { threadsDir, projectId, limit = 200 }) {
  const files = fs.existsSync(threadsDir) ? fs.readdirSync(threadsDir).filter((f) => f.endsWith('.md')).sort().slice(0, limit) : [];
  const out = { imported: 0, duplicates: 0 };
  for (const f of files) {
    const r = await ki.documents.ingest(principal, { path: path.join(threadsDir, f), filename: f, category: 'thread', projectId, sourceKind: 'import', lineageKey: `thread:${f}`, process: 'none' });
    r.duplicate ? out.duplicates++ : out.imported++;
  }
  return out;
}

module.exports = { captureSlackMessage, importFolder, importCommunityThreads };
