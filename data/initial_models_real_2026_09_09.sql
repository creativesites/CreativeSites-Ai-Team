-- Honest model registry: ONLY what actually exists as an executable runtime
-- today. The earlier "6 models across Claude+Gemini" version was never
-- applied to this database and, on inspection, wasn't real either - no
-- GEMINI_API_KEY/DEEPSEEK_API_KEY/OPENAI_API_KEY anywhere, no provider SDKs
-- in package.json, and its cost figures (e.g. $0.00008/Mtok for Haiku) don't
-- match any real published pricing - they read as invented, not sourced.
--
-- What's actually available today: Claude Code sessions, where the model
-- tier is switched with the `/model` command (haiku | sonnet | opus). That's
-- the only real, working "model routing" primitive in this environment.
-- Gemini/DeepSeek/OpenAI rows can be added for real once API keys exist and
-- an actual execution path (a runtime that isn't a Claude Code session) is
-- built to run agents against them - that is real, separate infrastructure
-- work, not a data-entry task.

INSERT INTO model_registry (
  id, provider, model_id, display_name, capabilities, context_tokens,
  tool_support, computer_use, vision, speed_tier, capability_tier,
  estimated_cost_per_mtok, availability, best_for, avoid_for, notes
) VALUES
('model-claude-haiku-45', 'Claude', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',
 '["coding","simple-reasoning","classification","edits"]', 200000, 1, 0, 1,
 'fastest', 'cheap', NULL, 'available',
 'typo fixes,variable renames,simple classification,log/summary reading,mechanical edits',
 'multi-file architecture,security review,ambiguous requirements',
 'Real cost figures were not available at authoring time - do not re-add invented per-token numbers. Selected today via the /model command in a Claude Code session.'),

('model-claude-sonnet-5', 'Claude', 'claude-sonnet-5', 'Claude Sonnet 5',
 '["coding","reasoning","architecture","security","design"]', 200000, 1, 1, 1,
 'medium', 'mid', NULL, 'available',
 'general coding,debugging,most feature work,moderate architecture decisions',
 'the hardest architecture/security calls where a second opinion at higher effort is worth the cost',
 'Default working tier for this organization today. Selected via /model sonnet.'),

('model-claude-opus-5', 'Claude', 'claude-opus-5', 'Claude Opus 5',
 '["coding","reasoning","architecture","security","design","complex-analysis"]', 200000, 1, 1, 1,
 'slow', 'top', NULL, 'available',
 'system architecture,security-sensitive design,ambiguous/high-stakes decisions,cross-cutting refactors',
 'high-volume simple tasks - wasteful, not wrong',
 'Escalation target when Sonnet is insufficient or the task is explicitly high-stakes. Selected via /model opus.');

-- Escalation chain for general work: start cheap, escalate only on real need.
-- This mirrors the actual mechanism available today (switching /model within
-- or between Claude Code sessions) rather than a fictional multi-provider chain.
INSERT INTO escalation_chains (id, task_type, step, model_id, max_attempts, reason) VALUES
('esc-general-1', 'general', 1, 'model-claude-haiku-45', 1, 'Cheapest tier first for anything not yet known to need more'),
('esc-general-2', 'general', 2, 'model-claude-sonnet-5', 1, 'Default escalation when Haiku is ambiguous or insufficient'),
('esc-general-3', 'general', 3, 'model-claude-opus-5', 1, 'Final escalation for high-stakes or repeatedly-failed work'),

('esc-architecture-1', 'architecture', 1, 'model-claude-sonnet-5', 1, 'Architecture work starts at Sonnet, not Haiku - low-effort tier is not credible for this task type'),
('esc-architecture-2', 'architecture', 2, 'model-claude-opus-5', 1, 'Escalate to Opus for genuinely hard or high-stakes architecture calls'),

('esc-security-1', 'security', 1, 'model-claude-sonnet-5', 1, 'Security review starts at Sonnet minimum'),
('esc-security-2', 'security', 2, 'model-claude-opus-5', 1, 'Escalate to Opus when a security finding is ambiguous or high-severity');

-- Added per Winston (2026-09-09): Gemini access is real, via the Antigravity
-- runtime (already a registered organizational identity, agent-8 - see
-- AGENTS_REGISTRY.md, self-registered 2026-09-08 as "Automated Browser QA &
-- Production Testing"). This is NOT a raw API call model_router.js can
-- invoke in-process today - it's a separate IDE/runtime a human (or
-- orchestrator, once that exists) spawns as its own session, same as
-- spawning a Claude Code agent. Availability is quota-based (Winston: weekly
-- limit, resets tomorrow) rather than pay-per-token, so cost fields stay
-- NULL rather than inventing a number - there isn't a per-token price to cite.
INSERT INTO model_registry (
  id, provider, model_id, display_name, capabilities, context_tokens,
  tool_support, computer_use, vision, speed_tier, capability_tier,
  estimated_cost_per_mtok, availability, best_for, avoid_for, notes
) VALUES
('model-gemini-antigravity', 'Gemini', 'gemini-antigravity-runtime', 'Gemini (via Antigravity IDE)',
 '["coding","reasoning","browser-automation","large-context"]', NULL, 1, 1, 1,
 'medium', 'mid', NULL, 'unavailable',
 'automated browser QA/Playwright work (already proven - see Antigravity''s production smoke-test findings), large-context reading, a genuine second opinion independent of Claude',
 'anything time-sensitive while the weekly quota is exhausted',
 'availability=unavailable until Winston''s weekly quota resets (he said tomorrow, 2026-09-10). Update to available manually once confirmed - no automated quota check exists. Executed by spawning an Antigravity session, not an in-process API call.');
