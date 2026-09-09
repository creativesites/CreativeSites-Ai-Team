-- Agent capabilities seeded from community/AGENTS_REGISTRY.md's declared
-- domains (evidence_class = DECLARED - a role assignment, not a tested
-- proficiency) plus a small number upgraded to OBSERVED where this session
-- has direct, first-hand evidence of the work actually happening (the P0
-- auth fix, the QA browser verification). Not claiming VERIFIED anywhere -
-- that tier should be reserved for a deliberate, repeatable capability test,
-- which hasn't been run for anyone yet.

INSERT INTO agent_capabilities (id, identity_id, capability_name, proficiency_level, evidence_class, notes) VALUES
('cap-astra-1', 'astra', 'widget-sdk', 'advanced', 'DECLARED', 'Registry role: Protocol Steward, AI Lead'),
('cap-astra-2', 'astra', 'ai-protocol', 'advanced', 'DECLARED', 'Registry role'),

('cap-vela-1', 'vela', 'wordpress', 'advanced', 'OBSERVED', 'Directly observed this session: isolated and shipped the P0 auth nonce fix as a clean PR against main, correctly scoped away from 30+ unrelated uncommitted files'),
('cap-vela-2', 'vela', 'php', 'advanced', 'OBSERVED', 'Same evidence as wordpress capability - fix touched assets/js/api.js and the plugin bootstrap file'),

('cap-atlas-1', 'atlas', 'platform', 'advanced', 'DECLARED', 'Registry role: Team Coordinator, Release Guardian, Security Guardian'),
('cap-atlas-2', 'atlas', 'security', 'advanced', 'DECLARED', 'Registry role'),

('cap-kael-1', 'kael', 'qa-exploratory-browser', 'advanced', 'OBSERVED', 'Onboarded this session specifically for LEVEL 4 interactive browser QA via Claude_Browser - real capability, not yet independently re-verified by another party'),
('cap-kael-2', 'kael', 'code-review', 'intermediate', 'DECLARED', 'Registry role: Lead Verifier, Code Reviewer'),

('cap-lyra-1', 'lyra', 'react-native', 'advanced', 'DECLARED', 'Registry role: Mobile Integration Guardian & RN Architect'),
('cap-lyra-2', 'lyra', 'mobile-sdk', 'advanced', 'DECLARED', 'Registry role'),

('cap-iris-1', 'iris', 'dashboard', 'advanced', 'OBSERVED', 'Directly observed this session: source-level security/data-isolation audit of Permissions.php and Goals routes, correctly scoped its own confidence to Level 1 (source-read only)'),
('cap-iris-2', 'iris', 'operator-console', 'advanced', 'DECLARED', 'Registry role: Lead Planner, System Observer'),

('cap-nexus-1', 'nexus', 'orchestration-platform', 'advanced', 'DECLARED', 'Registry role: Runtime Operator, Bus Architect, Dispatcher'),

('cap-meridian-1', 'meridian', 'organizational-infrastructure', 'advanced', 'OBSERVED', 'This session: dashboard, liveness/wake system, deploy tooling, schema fixes - self-assessed from direct work, not independently verified by another party'),
('cap-meridian-2', 'meridian', 'database-schema', 'advanced', 'OBSERVED', 'This session: designed and fixed the facts/task_claims/handoffs and Phase 2/3 schema');
