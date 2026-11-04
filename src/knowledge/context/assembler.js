'use strict';
/**
 * Context Assembly Service: builds a bounded, relevant, permission-filtered, traceable
 * Context Package for one agent and one task. Not "dump the knowledge base".
 *
 * Selection tiers (never exceeds the token budget; mandatory tiers are truncated, not dropped):
 *  T0 system constraints, task + acceptance criteria
 *  T1 authoritative policies/instructions, approved decisions & requirements
 *  T2 task-linked commitments, relevant documents (chunk excerpts), skills
 *  T3 lessons, recent high-impact changes, people/roles
 */
const { newId, sha256, toJson, parseJson, estimateTokens } = require('../core/util');
const { assertCan, rank, can, makePrincipal } = require('../core/access');
const { forbidden, notFound, invalid } = require('../core/errors');
const { SYSTEM_CONSTRAINTS, wrapEvidence } = require('../core/security');
const { tokenize } = require('../retrieval/embeddings');

const IMPACT_WEIGHT = { task: 1, constraint: 1, policy: 1, instruction: 1, decision: 1, requirement: 1, fact: 0.7, document_chunk: 0.6, commitment: 0.5, skill: 0.4, lesson: 0.2, change: 0.2, person: 0.1 };
const MAX_ITEM_TOKENS = 450;

class ContextAssembler {
  constructor({ db, audit, events, clock, settings, search, knowledge, commitments, work, skills, sources, notifier, agentDirectory }) {
    Object.assign(this, { db, audit, events, clock, settings, search, knowledge, commitments, work, skills, sources, notifier, agentDirectory });
  }

  /** Resolve who the context is FOR. Retrieval always runs as that agent, capped by the requester's own clearance. */
  _target(principal, agentId) {
    if (!agentId || agentId === principal.id) return principal;
    assertCan(principal, 'context.assemble_for_others');
    const t = this.agentDirectory && this.agentDirectory.resolve(agentId, principal.orgId);
    if (!t) throw invalid(`Unknown agent: ${agentId}`);
    const p = makePrincipal({ ...t, orgId: principal.orgId });
    return rank(p.clearance) > rank(principal.clearance) ? makePrincipal({ ...t, orgId: principal.orgId, clearance: principal.clearance }) : p;
  }

  async assemble(principal, params) {
    assertCan(principal, 'context.assemble');
    const agent = this._target(principal, params.agentId);
    const cfg = this.settings.all();
    const budget = params.budgetTokens || cfg.contextDefaultBudgetTokens;
    const task = params.taskId ? this.work.getTask(params.taskId) : null;
    if (params.taskId && !task) throw notFound('task', params.taskId);
    const projectId = params.projectId || (task && task.projectId) || null;
    if (projectId && !(agent.projectIds === '*' || agent.projectIds.includes(projectId) || ['owner', 'orchestrator', 'approver'].includes(agent.role))) throw forbidden(`Agent has no access to project ${projectId}`);
    const queryText = [params.query, task && task.title, task && task.description, task && (task.acceptanceCriteria || []).join(' ')].filter(Boolean).join('. ');
    if (!queryText.trim()) throw invalid('Provide a taskId or a query');
    const candidates = []; const excluded = []; const warnings = [];
    const add = (c) => candidates.push({ tier: 2, score: 0, ...c, tokens: 0 });

    // T0 — constraints and task
    add({ tier: 0, type: 'constraint', refType: 'constraint', refId: 'system', title: 'System and security constraints', excerpt: SYSTEM_CONSTRAINTS.map((c, i) => `${i + 1}. ${c}`).join('\n'), trust: 'policy', rationale: 'Fixed runtime policy; outranks all retrieved content', fingerprint: sha256(SYSTEM_CONSTRAINTS.join('|')), score: 100 });
    if (task) {
      const ex = [`Task ${task.id}: ${task.title}`, task.description || '', `Status: ${task.status}${task.assigneeId ? `; assignee: ${task.assigneeId}` : ''}`,
        (task.acceptanceCriteria || []).length ? 'Acceptance criteria:\n' + task.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${typeof c === 'string' ? c : JSON.stringify(c)}`).join('\n') : 'Acceptance criteria: none recorded (ask the Orchestrator before assuming).',
        (task.dependencies || []).length ? `Depends on: ${task.dependencies.join(', ')}` : ''].filter(Boolean).join('\n');
      add({ tier: 0, type: 'task', refType: 'task', refId: task.id, title: `Task: ${task.title}`, excerpt: ex, trust: 'organisational_record', rationale: 'The assigned task and its acceptance criteria', fingerprint: sha256(JSON.stringify([task.title, task.description, task.acceptanceCriteria, task.status, task.updatedAt])), score: 99 });
    }

    // T1 — authoritative guidance (policies/instructions always considered; requirements/decisions by relevance)
    const guidance = this.knowledge.current(agent, { projectId, types: ['policy', 'instruction'], limit: 30 });
    for (const k of guidance) if (k.authority >= 3) add({ tier: 1, classification: k.classification, type: k.type, refType: 'knowledge', refId: k.id, title: `${k.type}: ${k.title}`, excerpt: k.content, authority: k.authority, trust: 'organisational_record', sourceTs: k.effectiveAt || k.capturedAt, rationale: `Authoritative ${k.type} (${k.authorityName}) applies to every agent in scope`, fingerprint: this._kfp(k), score: 50 + k.authority });
    const kHits = await this.search.search(agent, { query: queryText, types: ['knowledge'], projectId, limit: 25, audit: false, includeSuperseded: true });
    const kMap = new Map(this.knowledge.list(agent, { projectId, limit: 2000, includeInactive: true }).map((k) => [k.id, k]));
    for (const h of kHits.results) {
      if (candidates.some((c) => c.refId === h.id)) continue;
      const k = kMap.get(h.id);
      if (!k) continue;
      if (['superseded', 'archived'].includes(k.status)) { excluded.push({ refType: 'knowledge', refId: k.id, title: k.title, reason: `${k.status}: no longer current` }); continue; }
      if (k.status === 'disputed') { excluded.push({ refType: 'knowledge', refId: k.id, title: k.title, reason: 'disputed: unresolved conflict' }); continue; }
      if (!['accepted', 'verified'].includes(k.status)) { excluded.push({ refType: 'knowledge', refId: k.id, title: k.title, reason: `not accepted (status ${k.status})` }); continue; }
      const tier = ['requirement', 'decision', 'policy', 'instruction'].includes(k.type) ? 1 : 3;
      add({ tier, classification: k.classification, type: k.type, refType: 'knowledge', refId: k.id, title: `${k.type}: ${k.title}`, excerpt: k.content, authority: k.authority, trust: 'organisational_record', sourceTs: k.effectiveAt || k.capturedAt, score: h.score + k.authority * 5, rationale: `Relevant ${k.type} (${k.authorityName}); matched ${Object.keys(h.explain.via).join('+')}`, fingerprint: this._kfp(k), provenance: k.sourceRef });
    }

    // T2 — commitments linked to the task, then relevant project commitments
    if (task) for (const c of this.commitments.commitmentsForTask(agent, task.id)) add({ tier: 2, type: 'commitment', refType: 'commitment', refId: c.id, title: `Commitment (${c.status})`, excerpt: `${c.description}${c.deadlineAt ? ` — due ${c.deadlineAt}` : ''}${c.requester ? ` — requested by ${c.requester}` : ''}`, trust: 'organisational_record', rationale: 'Linked to this task: the task exists to satisfy it', fingerprint: this._cfp(c), score: 80 });
    const cHits = await this.search.search(agent, { query: queryText, types: ['commitment'], projectId, limit: 6, audit: false });
    for (const h of cHits.results) {
      if (candidates.some((c) => c.refId === h.id)) continue;
      const c = this.db.get('SELECT * FROM ki_commitments WHERE id=?', [h.id]);
      if (!c || !['accepted', 'assigned', 'in_progress', 'blocked'].includes(c.status)) continue;
      add({ tier: 2, type: 'commitment', refType: 'commitment', refId: c.id, title: `Related commitment (${c.status})`, excerpt: c.description + (c.deadline_at ? ` — due ${c.deadline_at}` : ''), trust: 'organisational_record', rationale: 'Open commitment relevant to this task', fingerprint: this._cfp(this.commitments._shape(c)), score: h.score });
    }

    // T2 — document excerpts (quarantined/injection-flagged chunks are filtered by search for agents)
    const dHits = await this.search.search(agent, { query: queryText, types: ['document'], projectId, limit: 10, audit: false });
    if (dHits.warnings.length) warnings.push(...dHits.warnings);
    for (const h of dHits.results) {
      const chunk = this.db.get('SELECT text, text_hash FROM ki_chunks WHERE id=?', [h.id]);
      add({ tier: 2, classification: h.classification, type: 'document_chunk', refType: 'chunk', refId: h.id, title: h.title, excerpt: chunk ? chunk.text : h.excerpt, trust: 'untrusted_evidence', sourceTs: null, score: h.score, rationale: `Document excerpt relevant to the task (${Object.keys(h.explain.via).join('+')}); current version ${h.citation.versionNo}`, fingerprint: chunk ? chunk.text_hash : sha256(h.excerpt), provenance: h.citation });
    }

    // T2 — skills (HOW), selected not bulk-loaded
    const sel = this.skills ? this.skills.select({ text: queryText, taskType: params.taskType, max: params.maxSkills || 3 }) : [];
    for (const s of sel) add({ tier: 2, type: 'skill', refType: 'skill', refId: s.skill.id, title: `Skill: ${s.skill.id} v${s.skill.version || '?'}`, excerpt: `${s.skill.description}\n(Full procedure: ${s.skill.path.split('/community/')[1] ? 'community/' + s.skill.path.split('/community/')[1] : s.skill.path}; hash ${s.skill.hash.slice(0, 12)})`, trust: 'policy', rationale: `Selected: ${s.reason}`, fingerprint: s.skill.hash, score: 40 + s.score * 10, provenance: { skillId: s.skill.id, version: s.skill.version, hash: s.skill.hash } });

    // T3 — recent changes + people
    const since = params.since || new Date(this.clock.now().getTime() - 7 * 86400000).toISOString();
    if (projectId) {
      const evs = this.db.all(`SELECT * FROM ki_events WHERE org_id=? AND project_id=? AND ts>? AND importance IN ('high','critical') AND type IN ('knowledge.accepted','knowledge.superseded','knowledge.conflict_resolved','document.superseded','commitment.accepted','commitment.fulfilled') ORDER BY ts DESC LIMIT 8`, [agent.orgId, projectId, since]);
      const qset = new Set(tokenize(queryText));
      for (const e of evs) {
        const overlap = tokenize(e.summary).filter((t) => qset.has(t)).length;
        add({ tier: 3, type: 'change', refType: 'event', refId: e.id, title: `Recent change (${e.type})`, excerpt: `${e.ts}: ${e.summary}`, trust: 'organisational_record', rationale: overlap ? 'Recent high-impact change touching task vocabulary' : 'Recent high-impact change in this project', fingerprint: sha256(e.id), score: 10 + overlap * 5 });
      }
      for (const p of this.sources.people(agent, { projectId }).slice(0, 3)) add({ tier: 3, type: 'person', refType: 'person', refId: p.id, title: `Person: ${p.name || p.id}`, excerpt: `${p.name || p.id} — ${p.sources} captured message(s) on ${p.platforms.join(', ')}; requested ${p.commitmentsRequested} commitment(s); owns ${p.commitmentsOwned} open`, trust: 'organisational_record', rationale: 'Active source of instructions in this project', fingerprint: sha256(p.id + p.sources), score: 5 });
    }

    // ---- budget (greedy within tier, tiers in order). T0 truncated to fit, never dropped.
    candidates.forEach((c) => { c.tokens = Math.min(estimateTokens(c.excerpt), MAX_ITEM_TOKENS * (c.tier === 0 ? 3 : 1)); });
    candidates.sort((a, b) => a.tier - b.tier || b.score - a.score);
    let used = 0; const chosen = [];
    for (const c of candidates) {
      if (c.tier === 0) { chosen.push(c); used += c.tokens; continue; }
      if (used + c.tokens > budget) { excluded.push({ refType: c.refType, refId: c.refId, title: c.title, reason: `budget: ${c.tokens} tokens would exceed remaining ${Math.max(0, budget - used)}` }); continue; }
      chosen.push(c); used += c.tokens;
    }
    if (used > budget) warnings.push(`Mandatory items alone use ${used} tokens, above the ${budget} budget.`);
    chosen.forEach((c) => { if (estimateTokens(c.excerpt) > c.tokens) { c.excerpt = c.excerpt.slice(0, c.tokens * 4) + '…'; c.truncated = true; } });

    // ---- warnings: open conflicts touching chosen knowledge
    const kIds = chosen.filter((c) => c.refType === 'knowledge').map((c) => c.refId);
    if (kIds.length) {
      const cf = this.db.all(`SELECT * FROM ki_conflicts WHERE status='open' AND (a_id IN (${kIds.map(() => '?').join(',')}) OR b_id IN (${kIds.map(() => '?').join(',')}))`, [...kIds, ...kIds]);
      cf.forEach((c) => warnings.push(`Open conflict ${c.id} involves included knowledge (${c.reason}). Treat the higher-authority record as current and ask the Orchestrator if unsure.`));
    }
    const supersededDocs = candidates.filter((c) => c.provenance && c.provenance.current === false).length;
    if (supersededDocs) warnings.push(`${supersededDocs} excerpt(s) come from superseded document versions.`);

    // ---- persist
    const id = newId('ctx'); const now = this.clock.iso();
    const fingerprint = sha256(chosen.map((c) => `${c.refType}:${c.refId}:${c.fingerprint}`).join('|'));
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_context_packages(id,agent_id,task_id,project_id,org_id,purpose,query,budget_tokens,token_estimate,status,previous_package_id,assembled_at,assembled_by,params_json,warnings_json,excluded_json,skills_json,fingerprint)
        VALUES (?,?,?,?,?,?,?,?,?, 'active',?,?,?,?,?,?,?,?)`,
      [id, agent.id, params.taskId || null, projectId, agent.orgId, params.purpose || 'task', params.query || null, budget, used, params.previousPackageId || null, now, principal.id,
        toJson({ taskType: params.taskType, since, maxSkills: params.maxSkills, requestedBy: principal.id }), toJson(warnings), toJson(excluded), toJson(sel.map((s) => ({ id: s.skill.id, version: s.skill.version, hash: s.skill.hash, reason: s.reason }))), fingerprint]);
      chosen.forEach((c, i) => this.db.run(`INSERT INTO ki_context_items(id,package_id,ordinal,item_type,ref_type,ref_id,ref_fingerprint,title,excerpt,authority,source_ts,score,rationale,token_estimate,trust,flags_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [newId('cti'), id, i, c.type, c.refType, c.refId, c.fingerprint, c.title, c.excerpt, c.authority ?? null, c.sourceTs || null, c.score, c.rationale, c.tokens, c.trust, toJson({ truncated: !!c.truncated, provenance: c.provenance || null })]));
      this.audit.record({ principal, action: 'context.assemble', entityType: 'context_package', entityId: id, orgId: agent.orgId, projectId, detail: { forAgent: agent.id, taskId: params.taskId || null, items: chosen.length, tokens: used, excluded: excluded.length, fingerprint } });
      const protectedRefs = chosen.filter((c) => ['confidential', 'restricted'].includes(c.classification)).map((c) => c.refId);
      if (protectedRefs.length) this.audit.record({ principal, action: 'context.protected_access', entityType: 'context_package', entityId: id, orgId: agent.orgId, projectId, detail: { refs: protectedRefs } });
    });
    return this.get(principal, id);
  }

  _kfp(k) { return sha256(`${k.id}|${k.status}|${k.authority}|${k.content}|${k.supersededBy || ''}`); }
  _cfp(c) { return sha256(`${c.id}|${c.status}|${c.deadlineAt || ''}|${c.description}|${c.responsibleId || ''}`); }

  /* --------------------------------------------------------------- reads */
  get(principal, id) {
    assertCan(principal, 'context.assemble');
    const p = this.db.get('SELECT * FROM ki_context_packages WHERE id=?', [id]);
    if (!p || p.org_id !== principal.orgId) throw notFound('context_package', id);
    if (p.agent_id !== principal.id && !can(principal, 'context.assemble_for_others')) throw notFound('context_package', id);
    const items = this.db.all('SELECT * FROM ki_context_items WHERE package_id=? ORDER BY ordinal', [id]).map((i) => ({
      id: i.id, ordinal: i.ordinal, type: i.item_type, refType: i.ref_type, refId: i.ref_id, title: i.title, excerpt: i.excerpt, authority: i.authority, sourceTs: i.source_ts, score: i.score, rationale: i.rationale, tokens: i.token_estimate, trust: i.trust, fingerprint: i.ref_fingerprint, ...parseJson(i.flags_json, {}) }));
    const pkg = { id: p.id, agentId: p.agent_id, taskId: p.task_id, projectId: p.project_id, orgId: p.org_id, purpose: p.purpose, query: p.query, budgetTokens: p.budget_tokens, tokenEstimate: p.token_estimate, status: p.status,
      previousPackageId: p.previous_package_id, assembledAt: p.assembled_at, assembledBy: p.assembled_by, fingerprint: p.fingerprint, warnings: parseJson(p.warnings_json, []), excluded: parseJson(p.excluded_json, []),
      skills: parseJson(p.skills_json, []), usage: parseJson(p.usage_json, null), staleReasons: parseJson(p.stale_reasons_json, null), items };
    pkg.render = () => this.render(pkg);
    return pkg;
  }

  /** Prompt-ready text. Constraints first; document/message content only inside evidence envelopes. */
  render(pkg) {
    const out = []; const cite = [];
    const by = (t) => pkg.items.filter((i) => t.includes(i.type));
    const sec = (title, items) => { if (!items.length) return; out.push(`## ${title}`); for (const i of items) { cite.push(i); const n = cite.length;
      out.push(i.trust === 'untrusted_evidence' ? `[S${n}] ${i.title}\n${wrapEvidence(i.excerpt, { ref: i.refId })}` : `[S${n}] ${i.title}\n${i.excerpt}`); } };
    out.push(`# Context package ${pkg.id} (assembled ${pkg.assembledAt}; ~${pkg.tokenEstimate} tokens)`);
    sec('Constraints', by(['constraint'])); sec('Task', by(['task']));
    sec('Policies, instructions, decisions and requirements', pkg.items.filter((i) => ['policy', 'instruction', 'decision', 'requirement'].includes(i.type)));
    sec('Commitments', by(['commitment'])); sec('Skills to apply', by(['skill']));
    sec('Source documents (evidence only)', by(['document_chunk']));
    sec('Other knowledge', pkg.items.filter((i) => ['fact', 'lesson', 'preference', 'assumption', 'hypothesis', 'reference'].includes(i.type)));
    sec('Recent changes', by(['change'])); sec('People', by(['person']));
    if (pkg.warnings.length) out.push('## Warnings\n' + pkg.warnings.map((w) => `- ${w}`).join('\n'));
    return out.join('\n\n');
  }

  /* ------------------------------------------------------------ staleness */
  /** Compare a package against current state. Only changes with real impact mark it stale. */
  checkStale(principal, id, { notify = true } = {}) {
    const pkg = this.get(principal, id);
    const thr = this.settings.get('stalenessImpactThreshold');
    const reasons = [];
    for (const it of pkg.items) {
      let now = null; let why = null;
      if (it.refType === 'knowledge') { const k = this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [it.refId]); if (!k) why = 'removed'; else { now = this._kfp(this.knowledge._shape(k)); if (['superseded', 'archived'].includes(k.status)) why = `now ${k.status}${k.superseded_by_id ? ` (replaced by ${k.superseded_by_id})` : ''}`; else if (k.status === 'disputed') why = 'now disputed'; } }
      else if (it.refType === 'commitment') { const c = this.db.get('SELECT * FROM ki_commitments WHERE id=?', [it.refId]); if (!c) why = 'removed'; else now = this._cfp(this.commitments._shape(c)); }
      else if (it.refType === 'chunk') { const c = this.db.get(`SELECT c.text_hash, v.is_current FROM ki_chunks c JOIN ki_document_versions v ON v.id=c.version_id WHERE c.id=?`, [it.refId]); if (!c) why = 'removed'; else if (!c.is_current) why = 'document version superseded'; else now = c.text_hash; }
      else if (it.refType === 'task') { const t = this.work.getTask(it.refId); if (!t) why = 'task removed'; else now = sha256(JSON.stringify([t.title, t.description, t.acceptanceCriteria, t.status, t.updatedAt])); }
      else if (it.refType === 'skill') { const s = this.skills && this.skills.get(it.refId); now = s ? s.hash : null; if (!s) why = 'skill removed'; }
      else continue;
      if (!why && now && now !== it.fingerprint) why = 'content changed';
      if (why) {
        // Task *status* churn alone (pending -> in_progress) is not impactful; require criteria/title/description change.
        reasons.push({ refType: it.refType, refId: it.refId, title: it.title, change: why, impact: IMPACT_WEIGHT[it.type] ?? 0.3 });
      }
    }
    // new high-importance events since assembly that overlap the package vocabulary
    if (pkg.projectId) {
      const vocab = new Set(tokenize([pkg.query, ...pkg.items.filter((i) => ['task', 'requirement', 'decision', 'instruction', 'policy'].includes(i.type)).map((i) => i.title)].join(' ')));
      const known = new Set(pkg.items.map((i) => i.refId));
      for (const e of this.db.all(`SELECT * FROM ki_events WHERE org_id=? AND project_id=? AND ts>? AND importance IN ('high','critical') AND type IN ('knowledge.accepted','knowledge.superseded','knowledge.conflict','knowledge.conflict_resolved','document.superseded','commitment.accepted') ORDER BY ts`, [pkg.orgId, pkg.projectId, pkg.assembledAt])) {
        if (known.has(e.entity_id)) continue;
        const toks = tokenize(e.summary); const overlap = toks.filter((t) => vocab.has(t)).length / Math.max(4, toks.length);
        if (overlap >= 0.15) reasons.push({ refType: 'event', refId: e.id, title: e.summary, change: 'new relevant change', impact: Math.min(1, 0.4 + overlap) });
      }
    }
    const impact = reasons.reduce((m, r) => Math.max(m, r.impact), 0);
    const stale = impact >= thr;
    if (stale && pkg.status === 'active') {
      this.db.run(`UPDATE ki_context_packages SET status='stale', stale_reasons_json=? WHERE id=?`, [toJson(reasons), id]);
      this.audit.record({ principal, action: 'context.stale', entityType: 'context_package', entityId: id, orgId: pkg.orgId, projectId: pkg.projectId, detail: { impact, reasons: reasons.length } });
    }
    let notified = false;
    if (stale && notify && !this.db.get('SELECT stale_notified_at n FROM ki_context_packages WHERE id=?', [id]).n) {
      this.db.run('UPDATE ki_context_packages SET stale_notified_at=? WHERE id=?', [this.clock.iso(), id]);
      this.events.emit({ type: 'context.stale', entityType: 'context_package', entityId: id, orgId: pkg.orgId, projectId: pkg.projectId, importance: 'high', summary: `Context for agent ${pkg.agentId}${pkg.taskId ? ` on ${pkg.taskId}` : ''} is stale: ${reasons[0].title} (${reasons[0].change})`, payload: { reasons } });
      if (this.notifier) { try { this.notifier.notify({ to: 'Orchestrator', type: 'CONTEXT_STALE', subject: `Stale context: ${pkg.agentId}${pkg.taskId ? ' / ' + pkg.taskId : ''}`, body: reasons.map((r) => `- ${r.title}: ${r.change}`).join('\n'), packageId: id, taskId: pkg.taskId, agentId: pkg.agentId }); notified = true; } catch (_) { /* notifier failure must not break checks */ } }
    }
    return { packageId: id, stale: stale || pkg.status === 'stale', impact: +impact.toFixed(2), threshold: thr, reasons, notified, ignoredLowImpact: reasons.length > 0 && !stale };
  }

  sweepStale(principal, { projectId } = {}) {
    assertCan(principal, 'context.assemble_for_others');
    const rows = this.db.all(`SELECT id FROM ki_context_packages WHERE org_id=? AND status='active' ${projectId ? 'AND project_id=?' : ''}`, projectId ? [principal.orgId, projectId] : [principal.orgId]);
    const stale = rows.map((r) => this.checkStale(principal, r.id)).filter((r) => r.stale);
    return { checked: rows.length, stale };
  }

  async refresh(principal, id) {
    const old = this.get(principal, id);
    const fresh = await this.assemble(principal, { agentId: old.agentId, taskId: old.taskId, projectId: old.projectId, query: old.query, budgetTokens: old.budgetTokens, purpose: old.purpose, previousPackageId: id, taskType: undefined });
    this.db.run(`UPDATE ki_context_packages SET status='superseded' WHERE id=?`, [id]);
    const oldRefs = new Map(old.items.map((i) => [`${i.refType}:${i.refId}`, i])); const newRefs = new Map(fresh.items.map((i) => [`${i.refType}:${i.refId}`, i]));
    const diff = { added: [...newRefs.keys()].filter((k) => !oldRefs.has(k)), removed: [...oldRefs.keys()].filter((k) => !newRefs.has(k)), changed: [...newRefs.keys()].filter((k) => oldRefs.has(k) && oldRefs.get(k).fingerprint !== newRefs.get(k).fingerprint) };
    this.audit.record({ principal, action: 'context.refresh', entityType: 'context_package', entityId: fresh.id, orgId: fresh.orgId, projectId: fresh.projectId, detail: { previous: id, ...diff } });
    return { package: fresh, diff };
  }

  reportUsage(principal, id, { usedRefs = [], note } = {}) {
    const pkg = this.get(principal, id);
    const valid = new Set(pkg.items.map((i) => i.refId));
    const bad = usedRefs.filter((r) => !valid.has(r));
    if (bad.length) throw invalid('usedRefs contains items that are not part of this package', { bad });
    const usage = { usedRefs, note: note || null, reportedAt: this.clock.iso(), reportedBy: principal.id, unused: pkg.items.filter((i) => !usedRefs.includes(i.refId) && i.type !== 'constraint').map((i) => i.refId) };
    this.db.run('UPDATE ki_context_packages SET usage_json=? WHERE id=?', [toJson(usage), id]);
    this.audit.record({ principal, action: 'context.usage', entityType: 'context_package', entityId: id, orgId: pkg.orgId, projectId: pkg.projectId, detail: { used: usedRefs.length } });
    return usage;
  }

  /** What was this agent given? Used to explain an important decision after the fact. */
  history(principal, { agentId, taskId, limit = 20 }) {
    assertCan(principal, 'context.assemble_for_others');
    const w = ['org_id=?']; const p = [principal.orgId];
    if (agentId) { w.push('agent_id=?'); p.push(agentId); }
    if (taskId) { w.push('task_id=?'); p.push(taskId); }
    return this.db.all(`SELECT id, agent_id, task_id, status, assembled_at, token_estimate, fingerprint, previous_package_id FROM ki_context_packages WHERE ${w.join(' AND ')} ORDER BY assembled_at DESC LIMIT ?`, [...p, limit]);
  }
}

module.exports = { ContextAssembler };
