-- Model Registry: Claude + Gemini models available
-- Populated 2026-09-09

INSERT INTO model_registry (id, provider, model_id, display_name, capabilities, context_tokens, tool_support, computer_use, vision, speed_tier, capability_tier, estimated_cost_per_mtok, latency_p50_ms, latency_p95_ms, best_for, avoid_for, notes) VALUES

-- CLAUDE MODELS
('model-claude-haiku-45',
 'Claude',
 'claude-haiku-4-5-20251001',
 'Claude Haiku 4.5',
 '["coding","reasoning","basic-architecture"]',
 200000,
 1,
 0,
 0,
 'fastest',
 'cheap',
 0.00008,
 150,
 400,
 'simple-classification,variable-rename,log-analysis,basic-edits,typo-fixes',
 'complex-architecture,security-policy,multi-file-refactor',
 'Fastest Claude model; excellent for simple, bounded tasks'
),

('model-claude-sonnet-5',
 'Claude',
 'claude-sonnet-5',
 'Claude Sonnet 5',
 '["coding","reasoning","architecture","security","design"]',
 200000,
 1,
 1,
 1,
 'medium',
 'mid',
 0.00003,
 400,
 800,
 'code-generation,architecture,debugging,design-review,feature-implementation',
 'simple-tasks',
 'Balanced capability/speed/cost; default for most work'
),

('model-claude-opus-5',
 'Claude',
 'claude-opus-5',
 'Claude Opus 5',
 '["coding","reasoning","architecture","security","design","complex-analysis"]',
 200000,
 1,
 1,
 1,
 'slow',
 'top',
 0.00015,
 800,
 1500,
 'complex-architecture,security-design,protocol-design,multi-repo-refactor,escalation',
 'simple-tasks,routine-fixes',
 'Most capable Claude model; use for high-stakes decisions or complex reasoning'
),

-- GEMINI MODELS
('model-gemini-flash-38',
 'Gemini',
 'gemini-3.8-flash',
 'Gemini 3.8 Flash',
 '["coding","reasoning","architecture"]',
 1000000,
 1,
 0,
 1,
 'fast',
 'mid',
 0.0000375,
 200,
 500,
 'code-analysis,large-context-scan,quick-summary,multi-file-review',
 'security-policy,complex-architecture',
 'Newest Gemini Flash; excellent for large-context work'
),

('model-gemini-flash-37',
 'Gemini',
 'gemini-3.7-flash',
 'Gemini 3.7 Flash',
 '["coding","reasoning"]',
 1000000,
 1,
 0,
 1,
 'fast',
 'mid',
 0.0000375,
 220,
 550,
 'code-review,large-context-tasks',
 'architecture,security-design',
 'Previous version of Gemini Flash; still capable, use if 3.8 unavailable'
),

('model-gemini-flash-36',
 'Gemini',
 'gemini-3.6-flash',
 'Gemini 3.6 Flash',
 '["coding","basic-reasoning"]',
 1000000,
 1,
 0,
 1,
 'fastest',
 'cheap',
 0.000075,
 150,
 350,
 'simple-code-tasks,fast-feedback,routine-checks',
 'complex-reasoning,architecture,security',
 'Fastest Gemini model; use for quick, low-stakes work only'
);

-- ESCALATION CHAINS: Define progressive escalation strategies

-- Code generation escalation
INSERT INTO escalation_chains (id, task_type, step, model_id, max_attempts, reason) VALUES
('esc-code-gen-1', 'code_generation', 1, 'model-claude-haiku-45', 1, 'Try fastest first for simple changes'),
('esc-code-gen-2', 'code_generation', 2, 'model-gemini-flash-38', 1, 'Try mid-tier Gemini if Haiku fails'),
('esc-code-gen-3', 'code_generation', 3, 'model-claude-sonnet-5', 2, 'Sonnet for complex code work'),
('esc-code-gen-4', 'code_generation', 4, 'model-claude-opus-5', 1, 'Opus for last resort on difficult code');

-- Architecture/design escalation
INSERT INTO escalation_chains (id, task_type, step, model_id, max_attempts, reason) VALUES
('esc-arch-1', 'architecture', 1, 'model-claude-sonnet-5', 1, 'Sonnet default for architecture'),
('esc-arch-2', 'architecture', 2, 'model-gemini-flash-38', 1, 'Large context analysis option'),
('esc-arch-3', 'architecture', 3, 'model-claude-opus-5', 2, 'Opus for novel/complex problems');

-- Security review escalation
INSERT INTO escalation_chains (id, task_type, step, model_id, max_attempts, reason) VALUES
('esc-sec-1', 'security_review', 1, 'model-claude-sonnet-5', 2, 'Sonnet for initial security review'),
('esc-sec-2', 'security_review', 2, 'model-claude-opus-5', 1, 'Opus for sensitive/high-stakes reviews');

-- Simple task escalation
INSERT INTO escalation_chains (id, task_type, step, model_id, max_attempts, reason) VALUES
('esc-simple-1', 'simple_task', 1, 'model-gemini-flash-36', 1, 'Fastest for easy work'),
('esc-simple-2', 'simple_task', 2, 'model-claude-haiku-45', 1, 'Haiku if Gemini fails'),
('esc-simple-3', 'simple_task', 3, 'model-claude-sonnet-5', 1, 'Sonnet if both fail');

-- TASK ROUTING RULES: How to route different task types

INSERT INTO task_routing_rules (id, task_type, required_capabilities, effort_level, preferred_model_tier, prefer red_agents, allow_escalation, max_retries, timeout_seconds, notes) VALUES

('route-simple-edit', 'simple_edit', '["coding"]', 'LOW', 'cheap', '["agent-2","agent-8"]', 1, 2, 60, 'Variable rename, typo fix, simple change'),

('route-code-gen', 'code_generation', '["coding"]', 'MEDIUM', 'mid', '["agent-1","agent-2"]', 1, 3, 120, 'New feature or function implementation'),

('route-refactor', 'refactor', '["coding"]', 'HIGH', 'mid', '["agent-1","agent-2"]', 1, 2, 180, 'Large-scale code reorganization'),

('route-debug', 'debugging', '["coding","reasoning"]', 'HIGH', 'mid', '["agent-2","agent-3"]', 1, 3, 120, 'Bug investigation and fix'),

('route-arch', 'architecture', '["architecture","reasoning"]', 'HIGH', 'high', '["agent-3","agent-5"]', 1, 1, 300, 'Design decisions, system architecture'),

('route-security', 'security_review', '["security","reasoning"]', 'HIGH', 'high', '["agent-3"]', 1, 1, 300, 'Security audit, vulnerability review'),

('route-test', 'testing', '["coding"]', 'MEDIUM', 'cheap', '["agent-4","agent-8"]', 1, 2, 120, 'Write or review tests'),

('route-doc', 'documentation', '["coding"]', 'LOW', 'cheap', '["agent-2"]', 1, 1, 60, 'Documentation, comments, README');

-- AGENT CAPABILITIES: Register what agents can do
-- These would normally come from AGENTS_REGISTRY.md but we'll map the known agents

INSERT INTO agent_capabilities (id, identity_id, capability_name, proficiency_level, evidence_class, verified_by, verified_at) VALUES

-- Vela (agent-2): WordPress System of Record
('cap-vela-1', 'agent-2', 'coding', 'expert', 'OBSERVED', 'agent-2', '2026-09-09'),
('cap-vela-2', 'agent-2', 'php', 'expert', 'OBSERVED', 'agent-2', '2026-09-09'),
('cap-vela-3', 'agent-2', 'wordpress', 'expert', 'OBSERVED', 'agent-2', '2026-09-09'),
('cap-vela-4', 'agent-2', 'debugging', 'advanced', 'OBSERVED', 'agent-2', '2026-09-09'),
('cap-vela-5', 'agent-2', 'verification', 'advanced', 'OBSERVED', 'agent-2', '2026-09-09'),

-- Atlas (agent-3): Platform, Cloud Run & Security
('cap-atlas-1', 'agent-3', 'architecture', 'expert', 'OBSERVED', 'agent-3', '2026-09-09'),
('cap-atlas-2', 'agent-3', 'security', 'expert', 'OBSERVED', 'agent-3', '2026-09-09'),
('cap-atlas-3', 'agent-3', 'cloud-infrastructure', 'advanced', 'OBSERVED', 'agent-3', '2026-09-09'),
('cap-atlas-4', 'agent-3', 'coding', 'advanced', 'OBSERVED', 'agent-3', '2026-09-09'),

-- Kael (agent-4): QA, Testing & Verification
('cap-kael-1', 'agent-4', 'testing', 'expert', 'OBSERVED', 'agent-4', '2026-09-09'),
('cap-kael-2', 'agent-4', 'verification', 'expert', 'OBSERVED', 'agent-4', '2026-09-09'),
('cap-kael-3', 'agent-4', 'quality-assurance', 'expert', 'OBSERVED', 'agent-4', '2026-09-09'),
('cap-kael-4', 'agent-4', 'browser-testing', 'advanced', 'OBSERVED', 'agent-4', '2026-09-09');
