'use strict';
/**
 * Provenance & source capture. A source is ORIGINAL EVIDENCE: platform, workspace,
 * channel, message id, author, original timestamp/URL and the original text.
 * Rows are immutable (DB triggers); redaction is the only permitted change and keeps the hash.
 * Everything derived (knowledge, commitments, summaries) points back here and is labelled
 * as interpretation, never as the source itself.
 */
const { newId, sha256 } = require('../core/util');
const { assertCan, assertWriteScope, checkRead, canRead, rank } = require('../core/access');
const { invalid, notFound, forbidden } = require('../core/errors');
const { scanInjection, scanSecrets, redactSecrets } = require('../core/security');

const KINDS = ['message', 'user_instruction', 'agent_report', 'workflow_event', 'document', 'conversation', 'external_reference'];

class SourceService {
  constructor({ db, audit, events, clock }) { Object.assign(this, { db, audit, events, clock }); }

  capture(principal, s) {
    assertCan(principal, 'source.capture');
    if (!KINDS.includes(s.kind || 'message')) throw invalid(`Unknown source kind: ${s.kind}`);
    if (!s.platform) throw invalid('platform is required');
    if (!s.text || !String(s.text).trim()) throw invalid('text is required');
    assertWriteScope(principal, { project_id: s.projectId });
    const kind = s.kind || 'message';
    const captured = this.clock.iso();
    const secrets = scanSecrets(s.text);
    const text = secrets.length ? redactSecrets(s.text) : String(s.text);
    const classification = secrets.length && rank(s.classification || 'internal') < rank('restricted') ? 'restricted' : (s.classification || 'internal');
    // Trust cannot be self-assigned: only a human owner/approver stating an instruction is 'trusted'.
    const trust = kind === 'user_instruction' && principal.type === 'human' && ['owner', 'approver'].includes(principal.role) ? 'trusted'
      : s.attested ? 'attested' : 'untrusted';
    if (s.messageId) {
      const dup = this.db.get(`SELECT * FROM ki_sources WHERE platform=? AND IFNULL(workspace,'')=? AND IFNULL(channel,'')=? AND message_id=?`, [s.platform, s.workspace || '', s.channel || '', s.messageId]);
      if (dup) return { id: dup.id, duplicate: true };
    }
    const id = newId('src');
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_sources(id,kind,platform,workspace,channel,message_id,thread_id,author_id,author_name,original_ts,original_url,text,text_hash,trust,org_id,project_id,classification,acl_json,captured_at,captured_by,redacted_at,redaction_reason)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, kind, s.platform, s.workspace || null, s.channel || null, s.messageId || null, s.threadId || null, s.authorId || null, s.authorName || null, s.originalTs || null, s.originalUrl || null,
        text, sha256(text), trust, principal.orgId, s.projectId || null, classification, s.acl ? JSON.stringify(s.acl) : null, captured, principal.id, secrets.length ? captured : null, secrets.length ? `secrets_redacted_on_capture:${secrets.join(',')}` : null]);
      this.audit.record({ principal, action: 'source.capture', entityType: 'source', entityId: id, orgId: principal.orgId, projectId: s.projectId || null, detail: { platform: s.platform, channel: s.channel, messageId: s.messageId, kind, trust, secretsRedacted: secrets.length > 0 } });
    });
    return { id, duplicate: false, trust, redacted: secrets.length > 0 };
  }

  get(principal, id) {
    assertCan(principal, 'source.read');
    const s = this.db.get('SELECT * FROM ki_sources WHERE id=?', [id]);
    if (!s || !canRead(principal, s)) throw notFound('source', id);
    return this._shape(s);
  }
  _shape(s) {
    const inj = scanInjection(s.text);
    return { id: s.id, kind: s.kind, platform: s.platform, workspace: s.workspace, channel: s.channel, messageId: s.message_id, threadId: s.thread_id, authorId: s.author_id, authorName: s.author_name,
      originalTs: s.original_ts, originalUrl: s.original_url, text: s.text, textHash: s.text_hash, trust: s.trust, projectId: s.project_id, classification: s.classification,
      capturedAt: s.captured_at, capturedBy: s.captured_by, redacted: !!s.redacted_at, redactionReason: s.redaction_reason, evidenceType: 'original_evidence',
      flags: inj.suspicious ? ['possible_prompt_injection'] : [] };
  }
  list(principal, { projectId, authorId, platform, limit = 100 } = {}) {
    assertCan(principal, 'source.read');
    const w = ['org_id = ?']; const p = [principal.orgId];
    if (projectId) { w.push('project_id = ?'); p.push(projectId); }
    if (authorId) { w.push('author_id = ?'); p.push(authorId); }
    if (platform) { w.push('platform = ?'); p.push(platform); }
    return this.db.all(`SELECT * FROM ki_sources WHERE ${w.join(' AND ')} ORDER BY captured_at DESC LIMIT ?`, [...p, limit]).filter((s) => canRead(principal, s)).map((s) => this._shape(s));
  }

  /** Redaction (e.g. privacy request): replaces text, keeps hash + metadata, audited. */
  redact(principal, id, reason) {
    if (!['owner', 'approver'].includes(principal.role)) throw forbidden('Only owners/approvers can redact sources');
    if (!reason) throw invalid('reason required');
    const s = this.db.get('SELECT * FROM ki_sources WHERE id=?', [id]);
    if (!s || s.org_id !== principal.orgId) throw notFound('source', id);
    this.db.tx(() => {
      this.db.run(`UPDATE ki_sources SET text='[REDACTED]', redacted_at=?, redaction_reason=? WHERE id=?`, [this.clock.iso(), reason, id]);
      this.audit.record({ principal, action: 'source.redact', entityType: 'source', entityId: id, orgId: s.org_id, projectId: s.project_id, detail: { reason } });
    });
    return { redacted: true };
  }

  /** People & sources view: derived from what has been captured, not a roster. */
  people(principal, { projectId } = {}) {
    assertCan(principal, 'source.read');
    const params = [principal.orgId, ...(projectId ? [projectId] : [])];
    const filt = projectId ? 'AND project_id = ?' : '';
    const authors = this.db.all(`SELECT author_id id, MAX(author_name) name, COUNT(*) sources, MAX(captured_at) lastSeen, GROUP_CONCAT(DISTINCT platform) platforms FROM ki_sources WHERE org_id=? AND author_id IS NOT NULL ${filt} GROUP BY author_id ORDER BY sources DESC`, params);
    return authors.map((a) => ({
      ...a, platforms: (a.platforms || '').split(','),
      commitmentsRequested: this.db.get(`SELECT COUNT(*) n FROM ki_commitments WHERE org_id=? AND source_author=? ${filt}`, [principal.orgId, a.id, ...(projectId ? [projectId] : [])]).n,
      commitmentsOwned: this.db.get(`SELECT COUNT(*) n FROM ki_commitments WHERE org_id=? AND responsible_id=? AND status NOT IN ('fulfilled','rejected','cancelled','superseded') ${filt}`, [principal.orgId, a.id, ...(projectId ? [projectId] : [])]).n,
      projects: this.db.all(`SELECT DISTINCT project_id FROM ki_sources WHERE org_id=? AND author_id=? AND project_id IS NOT NULL`, [principal.orgId, a.id]).map((r) => r.project_id),
    }));
  }
  connectedPlatforms(principal) {
    assertCan(principal, 'source.read');
    return this.db.all(`SELECT platform, workspace, COUNT(*) captured, MAX(captured_at) lastCaptured FROM ki_sources WHERE org_id=? GROUP BY platform, workspace`, [principal.orgId]);
  }
}
module.exports = { SourceService, KINDS };
