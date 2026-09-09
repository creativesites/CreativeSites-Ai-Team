> **CORRECTION (2026-09-09, Meridian)**: this document's "Complete ✅" claim
> was not accurate as written — the schema/SQL/scripts described below were
> written to disk but never actually applied to the live database
> (`data/myaos.db`'s mtime predated every file here), and several had real
> bugs that would have failed on first run (duplicate PRIMARY KEY
> declarations, a broken SQL query builder, a Node module that couldn't even
> load). This has since been fixed for real — schema applied, bugs corrected,
> tested end-to-end, not just re-read. See `community/PLANNER_AGENT_PROMPT.md`
> and `community/VERIFIER_AGENT_PROMPT.md` for what's actually usable today.
> The design/architecture thinking below is still good; treat the specific
> "Complete" and "Delivered" claims as aspirational-at-time-of-writing, not
> verified.

---

# Phase 3: Event Bus & Autonomous Orchestration

**Deployed**: 2026-09-09  
**Owner**: Orchestrator team (Atlas, Nexus)  
**Status**: Schema & architecture defined; integration in progress

---

## What This Solves

Phases 1 & 2 built **knowledge** and **routing**. Phase 3 connects them into **autonomous operation**:

- ❌ Before: Each piece works separately (facts, routing, assignment)
- ✅ After: Tasks flow autonomously through the system

```
Task Created → Router assigns model → Agent wakes → Execute → Verify
     ↓              ↓                    ↓            ↓         ↓
Event bus records  Event: task_queued   Event: claim Event bus tracks learning loop
```

---

## Event Flow Architecture

### Complete Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      TASK LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────┘

1. TASK CREATED
   ├─ Event: task_created
   ├─ Payload: task_id, task_type, effort_level, required_capabilities
   └─ Triggers: Router

2. ROUTING → MODEL SELECTION
   ├─ Router.routeTask() runs
   ├─ Event: task_assigned
   ├─ Payload: selected_model, reason, estimated_success_rate
   └─ Triggers: Agent selection

3. AGENT SELECTION & ASSIGNMENT
   ├─ Find agent with matching capabilities
   ├─ Event: task_claimed
   ├─ Payload: assigned_agent, model, assignment_reason
   └─ Triggers: Dependency check

4. DEPENDENCY CHECK
   ├─ Check if blocking tasks are done
   ├─ If blocked:
   │  ├─ Event: task_blocked
   │  ├─ Payload: blocked_by_tasks
   │  └─ Wait for dependency unblock
   ├─ If clear:
   │  ├─ Event: task_queued
   │  ├─ Payload: ready_to_start
   │  └─ Triggers: Agent wake

5. AGENT WAKE & START
   ├─ Send signal to agent runtime
   ├─ Event: task_started
   ├─ Payload: agent_id, model_id
   └─ Agent begins execution

6. EXECUTION (in agent)
   ├─ Agent receives task contract
   ├─ Agent executes with selected model
   ├─ Event: attempt_started
   └─ Polling: attempt_completed

7. ATTEMPT COMPLETED (from agent)
   ├─ Model produced output (success or error)
   ├─ Event: attempt_completed
   ├─ Payload: success, tokens_used, output/error
   ├─ Decision point:
   │  ├─ If success → move to verification
   │  ├─ If failure + escalations left → escalate
   │  └─ If failure + no escalations → human escalation
   └─ Triggers: Verification or Escalation

8. VERIFICATION (if success)
   ├─ Deterministic checks run
   ├─ Event: verification_started
   ├─ Tests/static analysis run
   ├─ Event: verification_passed or verification_failed
   ├─ If failed + escalations left → escalate
   └─ If passed → complete

9. ESCALATION (if needed)
   ├─ Try next model in chain
   ├─ Event: model_escalated
   ├─ Payload: from_model, to_model, reason
   ├─ Record escalation (learning)
   └─ Back to step 5 (new attempt)

10. HUMAN ESCALATION (if all models fail)
    ├─ Event: human_escalation_needed
    ├─ Create human_escalations record
    ├─ Notify Winston
    ├─ Event: human_decision_requested
    ├─ Wait for decision
    ├─ Event: human_decision_made or task_failed
    └─ End task

11. TASK COMPLETED
    ├─ Event: task_completed
    ├─ Payload: outcome, final_model, total_tokens, total_cost
    ├─ Update model_performance (learning)
    ├─ Check if any tasks were blocked by this
    ├─ Event: dependency_cleared (for blocked tasks)
    └─ Wake blocked tasks

12. BLOCKED TASK UNBLOCKED
    ├─ Check all dependencies now clear
    ├─ Event: task_queued (re-enter step 4)
    └─ Task proceeds
```

---

## Database Tables (Phase 3)

### task_workflow
Tracks the current state of each task as it flows through the system:

```sql
SELECT * FROM task_workflow WHERE task_id = 'HJ-019';

-- Returns:
-- current_state: in_progress
-- assigned_agent_id: agent-2
-- assigned_model_id: model-claude-sonnet-5
-- attempt_count: 2 (escalated once)
-- escalation_chain_position: 1 (step 2 of 4)
```

### event_bus
Audit trail of everything that happened:

```sql
SELECT * FROM event_bus WHERE task_id = 'HJ-019' ORDER BY created_at;

-- Returns:
-- Event 1: task_created (2026-09-09 14:00:00)
-- Event 2: task_assigned (router selected Sonnet)
-- Event 3: task_claimed (Vela claimed it)
-- Event 4: task_queued (dependencies clear)
-- Event 5: task_started (Vela began work)
-- Event 6: attempt_completed (success! 24k tokens)
-- Event 7: verification_started
-- Event 8: verification_passed
-- Event 9: task_completed
```

### dependency_graph
Tracks which tasks depend on which:

```sql
INSERT INTO dependency_graph VALUES (
  'dep-1',
  'TASK_019-02', -- HJ-019-02 (UI dropdown)
  'TASK_019-01', -- depends on HJ-019-01 (ProfileEntity field)
  'must_complete',
  '2026-09-09'
);

-- Meaning: HJ-019-02 cannot start until HJ-019-01 completes
```

### escalation_decisions
Records why/when models were escalated:

```sql
SELECT * FROM escalation_decisions WHERE task_id = 'HJ-019';

-- Returns:
-- Escalation 1: Haiku → Sonnet
--   Reason: Initial model failed after 1 attempt
--   Failure: "Syntax error in generated code"
```

### human_escalations
Tracks tasks that need human decisions:

```sql
SELECT * FROM human_escalations WHERE decision_status = 'pending';

-- Returns:
-- Escalation 1: All models failed after 5 escalations
--   Reason: "Verification never passed, unclear why"
--   Type: model_exhausted
--   Assigned to: Winston
--   Deadline: 2026-09-09 16:00:00
```

### attempt_log
Detailed record of each model attempt:

```sql
SELECT * FROM attempt_log WHERE task_id = 'HJ-019';

-- Returns:
-- Attempt 1 (Haiku):  FAILED, 8.2k tokens, $0.00065
-- Attempt 2 (Sonnet): SUCCESS, 24k tokens, $0.00072
```

---

## Event Types (Complete List)

```
task_created           → Task entered system
task_queued            → Ready to assign agent
task_assigned          → Model + agent assigned
task_claimed           → Agent acknowledged task
task_started           → Execution beginning
task_in_progress       → Agent working
task_blocked           → Waiting for dependencies
task_unblocked         → Dependencies cleared

model_selected         → Router chose a model
model_escalated        → Upgrading to stronger model
attempt_started        → Agent starting attempt
attempt_completed      → Agent finished, reporting result

verification_started   → Deterministic checks running
verification_passed    → Passed checks
verification_failed    → Failed checks

human_escalation_needed → Needs human intervention
human_decision_made    → Human made a decision

task_completed         → Task done (success)
task_failed            → Task failed (all escalations exhausted)
task_retry             → Retrying after escalation
```

---

## Escalation Chain in Action

For `code_generation` task that fails:

```
Step 1: Claude Haiku 4.5
  ├─ Attempts: 1
  ├─ Result: Failure (syntax error)
  └─ Event: model_escalated

Step 2: Gemini 3.8 Flash
  ├─ Attempts: 1
  ├─ Result: Failure (logic error)
  └─ Event: model_escalated

Step 3: Claude Sonnet 5
  ├─ Attempts: 2 (retried once)
  ├─ Result: Success (passed verification)
  └─ Event: task_completed

COST: $0.00065 + $0.00088 + $0.00144 = $0.00297 total
TIME: 15 min (Haiku 2min + Gemini 5min + Sonnet 8min)
```

## Human Escalation Example

When all models fail:

```
Task: TASK_019-01
All escalation steps exhausted:
  ├─ Haiku: Failed
  ├─ Gemini Flash: Failed
  ├─ Sonnet: Failed (2 attempts)
  └─ Opus: Failed (1 attempt)

Event: human_escalation_needed
Reason: "No model could complete; last error was ambiguous"
Type: model_exhausted
Escalated to: Winston
Deadline: 2026-09-09 16:00:00

Winston decides:
  ├─ Option 1: Retry with better context (send back to Opus)
  ├─ Option 2: Manual intervention (do it himself)
  ├─ Option 3: Reject task (out of scope)
  └─ Option 4: Delegate to specialist

Decision: Retry with better context
Event: human_decision_made
Action: Re-queue task with additional context
```

---

## Learning Loop

As tasks complete, we learn:

```
Model Performance After Task Completion:

Claude Sonnet 5:
  Before: 88% success on code_generation
  After: 89% success (added 1 success)
  Tokens: avg 35k (adjusted from 33k)
  Cost: avg $0.00072/task (adjusted from $0.00069)

Escalation Strategy Updated:
  Haiku still starts first (cheap)
  But if Haiku fails on code_generation,
  we know Sonnet has 89% success (good),
  so escalate immediately rather than try Gemini Flash first

Next escalation chain for code_generation:
  Step 1: Haiku (cheap first attempt)
  Step 2: Sonnet (proven reliable)
  Step 3: Opus (only if Sonnet fails)
  [Gemini Flash demoted; didn't help]
```

---

## Integration Points

### Phase 1 (Facts) ←→ Phase 3 (Events)

When escalation happens, record it as a FACT:

```sql
-- Event: model_escalated
-- Record as FACT:
INSERT INTO facts (claim, category, evidence_class, evidence, verified_by, verified_at) VALUES
  ('Claude Haiku failed on code_generation: syntax error',
   'model_performance',
   'VERIFIED',
   'attempt_log entry: task_019-01, attempt_1, model_haiku, failed',
   'system',
   datetime('now'));
```

### Phase 2 (Routing) ←→ Phase 3 (Events)

When attempt completes, update model_performance:

```sql
-- Event: attempt_completed (success)
-- Update model_performance:
UPDATE model_performance SET
  attempts = attempts + 1,
  successes = successes + 1,
  avg_tokens_per_task = (avg_tokens_per_task * (attempts-1) + 24000) / attempts,
  avg_cost_per_task = (avg_cost_per_task * (attempts-1) + 0.00072) / attempts,
  last_used = datetime('now')
WHERE model_id = 'model-claude-sonnet-5' AND task_type = 'code_generation';
```

Next time we route a `code_generation` task:
- Query model_performance
- Sonnet now shows 89% success rate (instead of 88%)
- Router will prefer it even more

---

## Metrics Dashboard (Phase 3)

Key queries to monitor system health:

```sql
-- Which models are actually working?
SELECT model_id, task_type, (successes*100.0/attempts) AS success_rate
FROM model_performance
WHERE attempts > 5
ORDER BY success_rate DESC;

-- How often do we need human intervention?
SELECT COUNT(*) as human_escalations, 
       (COUNT(*)*100.0 / (SELECT COUNT(*) FROM tasks)) as pct
FROM human_escalations WHERE decision_status IN ('pending','approved');

-- What's the average escalation depth?
SELECT AVG(escalation_chain_position) as avg_position, 
       MAX(escalation_chain_position) as max_escalations
FROM task_workflow WHERE outcome = 'success';

-- Which tasks are currently blocked?
SELECT t.id, t.title, 
       (SELECT GROUP_CONCAT(blocking_task_id) FROM dependency_graph WHERE dependent_task_id = t.id) as blocked_by
FROM tasks t
JOIN task_workflow tw ON t.id = tw.task_id
WHERE tw.current_state = 'blocked';

-- Real-time event stream (last 10 minutes)
SELECT event_type, COUNT(*) as count
FROM event_bus
WHERE created_at > datetime('now', '-10 minutes')
GROUP BY event_type
ORDER BY count DESC;
```

---

## Orchestration Flow (Code Example)

```javascript
const orch = new Orchestrator(dbPath);

// 1. Task created event
await orch.emit('task_created', 'HJ-019-01', {
  task_type: 'code_generation',
  effort_level: 'MEDIUM',
  required_capabilities: ['php','wordpress']
});

// Orchestrator handles:
// 1. Routes to model (Sonnet)
// 2. Selects agent (Vela)
// 3. Checks dependencies (none)
// 4. Emits: task_queued, task_claimed, task_started
// 5. Agent receives: task contract, selected model, context package

// 2. When agent completes (receives from agent)
await orch.emit('attempt_completed', 'HJ-019-01', {
  success: true,
  tokens_input: 8420,
  tokens_output: 15580,
  output: '... generated code ...'
});

// Orchestrator handles:
// 1. Moves to verification
// 2. Runs deterministic checks
// 3. On pass: emit task_completed
// 4. Updates model_performance (learning)
// 5. Checks dependencies (unblock HJ-019-02)
// 6. Wakes blocked task (if any)
```

---

## Next Steps: Wiring It All Together

Phase 3 tables & events are defined. Next work:

1. **Connect Router to Event Bus**
   - When task_created → call router → emit task_assigned
   
2. **Connect Agent Wake System**
   - When task_queued → send signal to agent runtime
   - Agent receives task contract with selected model
   
3. **Connect Verification Layer**
   - When attempt_completed (success) → run deterministic checks
   - Emit verification_passed or verification_failed

4. **Connect Learning Loop**
   - When task_completed → update model_performance
   - Update escalation chains based on success rates

5. **Human Escalation UI**
   - Dashboard shows human_escalations table
   - Winston can approve/reject/delegate
   - Triggers new events when decided

---

*Phase 3 architecture defined. Event bus schema complete. Ready for full orchestration integration.*
