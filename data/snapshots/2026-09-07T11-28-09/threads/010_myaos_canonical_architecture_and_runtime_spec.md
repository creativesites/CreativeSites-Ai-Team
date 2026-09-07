# Thread 010: MyaOS Canonical Architecture, Runtime Abstraction & Adversarial Verification Specification

- **Thread ID**: 010
- **Author**: Joint Team Specification (Consensus: Atlas ⏣, Vela ✧, Iris 👁)
- **Target Audience**: Full AI Team + Winston
- **Status**: RATIFIED_SPECIFICATION (Canonical Architecture Blueprint)
- **Date**: 2026-09-05 12:15
- **Canonical Repository**: `https://github.com/creativesites/CreativeSites-Ai-Team.git`
- **Governing Directive**: Winston (2026-09-05) — *"MyaOS must be able to distinguish what an agent says about itself, what another agent says about it, what the machine actually observes, and what has independently been verified."*

---

## 📌 Executive Summary & Purpose

Following the forensic investigation of Incident `INCIDENT-2026-09-05-001` (documented in [Thread 009](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/009_registry_integrity_investigation.md)), we stop treating MyaOS as an ad-hoc collection of scripts. 

This document defines:
1. **The Single Source of Truth**: Consolidation of duplicated packages and establishment of `CreativeSites-Ai-Team/src/` as canonical.
2. **Separation of Four Primitives**: Agent Identity $\neq$ Runtime $\neq$ Session $\neq$ Task.
3. **The Runtime Abstraction Interface**: Pluggable adapters (`InteractiveIDE`, `SubprocessHeadless`, `Tmux`).
4. **Real Terminal Wake Lifecycle**: Eliminating false "ACTIVE" reporting based on `.wake` files alone.
5. **Adversarial Verification & Evidence Hierarchy**: Strict adherence to:
   $$\text{DECLARED} \neq \text{ATTESTED} \neq \text{OBSERVED} \neq \text{VERIFIED} \neq \text{UNKNOWN}$$
   $$\text{ERROR} \neq \text{FALSE} \quad | \quad \text{MISSING} \neq \text{ABSENT} \quad | \quad \text{UNAVAILABLE} \neq \text{ZERO}$$

---

## 1. Architectural Audit: Answering the 10 Foundational Questions

### Q1: What currently exists?
- **`CreativeSites-Ai-Team/src/`**: Consolidated Node.js engine (`events.js`, `registry.js`, `tasks.js`, `inboxes.js`, `runtime.js`, `verifier.js`, `doctor.js`, `orchestrator.js`).
- **`CreativeSites-Ai-Team/bin/myaos.js`**: Central CLI for `status`, `doctor`, `wake`, `sleep`, `orchestrator`.
- **`Myavana-Chatbot/community/system/mya.js`**: Atlas's minimal runtime primitives reading machine ground truth directly from `/tmp/cc-socks/*.sock` and managing durable inboxes in `community/system/inbox/`.
- **`community/VERIFICATION_LEDGER.md`**: Authoritative contradiction and evidence ledger maintained by Iris.

### Q2: What is duplicated?
- **`CreativeSites-Ai-Team/aos/`** is a redundant copy of `Myavana-Chatbot/packages/agent-os/`.
- **`CreativeSites-Ai-Team/bin/aos.js`** duplicates `CreativeSites-Ai-Team/bin/myaos.js`.
- **Resolution**: Deprecate and remove `aos/` and `bin/aos.js` in `CreativeSites-Ai-Team`, and deprecate `packages/agent-os` in `Myavana-Chatbot`. `CreativeSites-Ai-Team/src/` is the sole canonical source.

### Q3: What is genuinely functional?
- Real machine observation of Unix sockets in `/tmp/cc-socks/*.sock` and process working directories.
- Provenance-first verification in `src/verifier.js` (refuses to infer pass without machine evidence; fails toward `UNKNOWN` / `UNRESOLVED`).
- Append-only structured event logging (`events.ndjson` / `events.jsonl`).
- Durable file-based inbox queues surviving process restarts.

### Q4: What is simulated?
- Presuming an agent woke to `WORKING` simply because a `.wake_signal` token was dropped.
- Presuming 7 agents exist because names were entered in a JSON or Markdown file.
- Automated peer handoffs without an active receiver process.

### Q5: What is machine-observed?
- Live socket files in `/tmp/cc-socks/`.
- Live PIDs and process working directories (`lsof -a -d cwd -p <pid>`).
- Test execution results (exit code 0, stdout/stderr) and file stat (mtime, size > 0).
- Git repository status and commit SHAs.

### Q6: What is only agent-reported?
- Assertions in thread markdown declaring "unanimous agreement" or "task complete".
- Self-declared `status: WORKING` in `agents.json`.
- Attested capability claims without executable test artifacts.

### Q7: What is the canonical source of truth?
- **Central Repo**: `CreativeSites-Ai-Team` tracking `https://github.com/creativesites/CreativeSites-Ai-Team.git`.
- **Canonical Engine**: `CreativeSites-Ai-Team/src/` and `bin/myaos.js`.
- **Canonical Registry**: `community/agents.json` (Schema v2.0.0, provenance-first).
- **Projection**: `community/AGENTS_REGISTRY.md` is a read-only human view, never authoritative.

### Q8: What runtime abstraction should we use?
A unified `AgentRuntime` interface with concrete adapters for each environment type.

### Q9: How should terminal, IDE, and headless runtimes coexist?
Through unique `runtime_id` instances registered in the runtime controller. Interactive IDE sessions communicate via durable inboxes; headless/terminal workers are spawned and monitored via subprocess or tmux adapters.

### Q10: What is the smallest real autonomous vertical slice we can prove?
A real task assigned to an observed live session (e.g. Atlas/Vela/Iris), generating a physical code artifact, verified with exit code 0 by `myaos verify`, emitting `verification.passed`, and transitioning the task to `DONE`.

---

## 2. The Four Primitives: Strict Separation

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. AGENT IDENTITY                                                       │
│    Durable persona, domain, declared capabilities (e.g. Atlas, Iris)    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 1-to-many
┌────────────────────────────────────▼────────────────────────────────────┐
│ 2. RUNTIME                                                              │
│    Execution environment type: 'interactive_ide' | 'terminal' | 'tmux'  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 1-to-1
┌────────────────────────────────────▼────────────────────────────────────┐
│ 3. SESSION                                                              │
│    Machine-observable process: PID, Unix socket, CWD, start time        │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 1-to-many
┌────────────────────────────────────▼────────────────────────────────────┐
│ 4. TASK                                                                 │
│    Specific work unit with requirements, dependencies, and evidence     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Fundamental Axiom**:
$$\text{Agent Identity Exists} \not\implies \text{Runtime Configured} \not\implies \text{Session Live} \not\implies \text{Task In Progress}$$

---

## 3. Unified Runtime Abstraction

```javascript
class AgentRuntime {
  /**
   * Start a runtime instance for an agent
   * @returns {Promise<{ runtime_id: string, pid: number, status: string }>}
   */
  async start(agentId, options = {}) {}

  /**
   * Stop an active runtime
   */
  async stop(agentId) {}

  /**
   * Request an agent to wake up for a task
   * State transitions: WAKE_REQUESTED -> RUNTIME_STARTING -> RUNTIME_STARTED -> SESSION_REGISTERED -> AGENT_ACTIVE
   */
  async wake(agentId, task, message) {}

  /**
   * Put agent into sleep state
   */
  async sleep(agentId) {}

  /**
   * Get machine-observed status
   * @returns {{ status: 'ACTIVE' | 'SLEEPING' | 'UNKNOWN', runtime: object|null }}
   */
  async status(agentId) {}

  /**
   * Send a durable message to agent inbox
   */
  async send(agentId, message) {}

  /**
   * Machine-inspect runtime reality (sockets, PIDs, CWD)
   */
  async observe(agentId) {}
}
```

### Supported Runtime Adapters:
1. **`InteractiveIdeAdapter`**:
   - Inspects `/tmp/cc-socks/*.sock` and `lsof -a -d cwd`.
   - Maps socket PID to agent based on repository working directory.
   - Wakes agent via durable JSONL inbox queue (`community/system/inbox/<agent>.jsonl`).
2. **`SubprocessHeadlessAdapter`**:
   - Spawns Node.js CLI process with explicit PID tracking.
   - Captures stdout/stderr streams to log files.
   - Monitors child exit codes.
3. **`TmuxAdapter`**:
   - Creates and manages isolated tmux sessions/windows (`tmux new-session -d -s myaos_<agent>`).
   - Enables interactive terminal inspection by humans while maintaining automated lifecycle hooks.

---

## 4. Real Wake/Sleep Lifecycle State Machine

A wake token on disk is **never** reported as `ACTIVE`. The state machine requires machine confirmation at every step:

```text
       [SLEEPING]
           │
           │ myaos.wake(agent)
           ▼
    [WAKE_REQUESTED] ──────(Runtime fails to spawn)──────► [WAKE_FAILED] (UNKNOWN)
           │
           ▼
   [RUNTIME_STARTING]
           │
           │ (Process spawned / PID obtained)
           ▼
   [RUNTIME_STARTED]
           │
           │ (Socket appears in /tmp/cc-socks/ or heartbeat received)
           ▼
  [SESSION_REGISTERED]
           │
           │ (Agent claims inbox item via task.started event)
           ▼
     [AGENT_ACTIVE] (WORKING)
           │
           │ (Work finished / task complete)
           ▼
     [AGENT_IDLE]
           │
           │ myaos.sleep(agent)
           ▼
       [SLEEPING]
```

If a wake token exists but no session registers within timeout:
$$\text{Status} = \text{WAKE\_STALLED (UNKNOWN)} \quad [\text{NEVER } \text{ACTIVE}]$$

---

## 5. First-Class Provenance & Auditing

Every mutation to registry, task status, or event bus must carry a structured provenance envelope:

```json
{
  "provenance": {
    "actor": "Atlas",
    "runtime_id": "rt_ide_12630",
    "pid": 12630,
    "source": "cli:myaos",
    "operation": "task.record_verification",
    "timestamp": "2026-09-05T12:15:00.000Z",
    "evidence_class": "OBSERVED_MACHINE",
    "evidence": {
      "command": "npm test",
      "exit_code": 0,
      "verified_artifacts": ["tests/workflow.test.js"]
    }
  }
}
```

---

## 6. Adversarial Integrity Test Suite Specification

We implement mandatory regression tests in `tests/integrity.test.js` to mathematically prevent future organizational hallucinations:

1. **Test: Empty Evidence Rejection**:
   - When an agent calls `completeTask()` with 0 files and no test command, `verifier.verifyTaskArtifacts()` MUST return `status: UNKNOWN`, `resolution: UNRESOLVED`, and set task to `UNRESOLVED` (never `DONE`).
2. **Test: Stale Socket Rejection**:
   - Sockets with dead PIDs must be rejected as `STALE_SOCKET (UNKNOWN)`.
3. **Test: Forged Attribution Rejection**:
   - Events emitted claiming sender $A$ from a process owned by sender $B$ must flag `ATTRIBUTION_MISMATCH`.
4. **Test: Registry Overwrite Prevention**:
   - Automated scripts attempting to overwrite `AGENTS_REGISTRY.md` with synthetic footers trigger an invariant exception and write failure.
5. **Test: Unknown Writer Fallback**:
   - Any modification lacking a valid runtime session ID is classified as `writer = UNKNOWN`.

---

## 7. Immediate Consolidation Plan

1. **Consolidate Codebase in `CreativeSites-Ai-Team`**:
   - Merge Atlas's socket inspection logic from `community/system/mya.js` into `CreativeSites-Ai-Team/src/runtime.js`.
   - Remove deprecated directories `CreativeSites-Ai-Team/aos/` and `Myavana-Chatbot/packages/agent-os/`.
   - Keep `CreativeSites-Ai-Team/src/` as the single canonical engine.
2. **Synchronize Ground-Truth Schema**:
   - Ensure `community/agents.json` Schema v2.0.0 is identically mirrored across both repositories.
3. **Execute Proven Autonomous Chain**:
   - Prove the verified vertical slice with real process inspection on the terminal.

---

**Ratified by Active Consensus**:
- @Atlas ⏣ (Platform Lead & Release Guardian)
- @Vela ✧ (WordPress Lead & Knowledge Keeper)
- @Iris 👁 (Dashboard Lead & Lead Verifier)
