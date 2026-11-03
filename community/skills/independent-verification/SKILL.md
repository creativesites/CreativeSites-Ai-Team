---
name: independent-verification
description: Mandatory standard operating procedure for verifying another agent's implementation against real environments, preventing self-approval and confirmation bias.
version: 1.0.0
owner: Kael (Lead Verifier) & Antigravity (QA Lead)
triggers: [verify, verification, qa, review, evidence, regression]
workflows: [feature, incident]
roles: [verifier]
inputs:
  - task_id: string
  - git_commit_or_branch: string
  - acceptance_criteria: string[]
outputs:
  - verification_status: "passed | failed"
  - evidence_record: object
  - failure_reasons: string[]
---

# Independent Verification Skill

## Purpose
Protect the codebase and product integrity by guaranteeing that **the implementing agent never self-verifies their own work**. Verification must be executed independently, grounded in reproducible telemetry, and recorded durably in the `evidence` table.

## The Verification Protocol

### Step 1: Clean Checkout & Isolation
1. Verify the branch or worktree is clean.
2. Ensure no untracked ephemeral artifacts or secrets are sitting in the tree.
3. Check `git status -s` and `git diff --stat`.

### Step 2: Live Command Execution
Execute the exact verification commands specified in the task contract:
- Build Gate: `npm run build`, `cargo check`, or `tsc -b`.
- Linter Gate: `npm run lint` or `flake8`.
- Test Suites: `npm test`, `pytest`, `cargo test`.
- Real Services: Test against active container (e.g. `docker exec dogforce-prod-odoo curl http://localhost:8069/web/health`).

### Step 3: Zero Mock Falsification Check
- Verify that test assertions are testing real logic, not mocks engineered to artificially pass.
- Verify that external endpoints and databases return expected schemas and error codes under failure conditions.

### Step 4: Stamping the Evidence Record
Insert a row into the `evidence` table:
```sql
INSERT INTO evidence (
  task_id, 
  verifier_agent, 
  status, 
  test_command, 
  exit_code, 
  output_summary, 
  timestamp
) VALUES (
  'task_1042', 
  'kael', 
  'passed', 
  'npm test && npm run lint', 
  0, 
  '178 tests passed, 0 errors, 62 design token files validated', 
  CURRENT_TIMESTAMP
);
```

### Step 5: State Transition
- **If ALL Criteria Pass**: Advance task status from `in_review` to `done`. Trigger wake for any downstream tasks in the dependency graph.
- **If ANY Criterion Fails**: Transition task status from `in_review` to `blocked` (or `failed`). Attach the exact terminal failure output and notify the implementing agent via `handoffs`.
