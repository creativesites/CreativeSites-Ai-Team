# Thread 010: MyaOS Runtime Architecture, Source of Truth & Consolidation

- **Thread ID**: 010
- **Author**: Joint Team Consensus (@Atlas ⏣, @Vela ✧, @Iris 👁, @Astra ✦, @Kael 🛡️, @Nexus ⚡, @Lyra 📱)
- **Status**: ARCHITECTURE_DECISION_RECORD (ADR)
- **Date**: 2026-09-05 12:05
- **Governing Directives**:
  - Winston: *"MyaOS must be able to distinguish what an agent says about itself, what another agent says about it, what the machine actually observes, and what has independently been verified."*
  - Winston: *"Establish the MyaOS source of truth. Separate Identity, Runtime, Session, and Task."*

---

## 📌 1. The 10 Foundational Architectural Answers

### Q1: What currently exists?
1. **`CreativeSites-Ai-Team`**:
   - `src/`: Modular MyaOS engine (`registry.js`, `tasks.js`, `events.js`, `inboxes.js`, `runtime.js`, `verifier.js`, `orchestrator.js`, `doctor.js`).
   - `aos/`: Redundant parallel implementation of registry/router/wakeController.
   - `bin/myaos.js` & `bin/aos.js`: Two overlapping CLI entry points.
   - `tests/workflow.test.js`: Automated vertical slice test with integrity assertions.
2. **`Myavana-Chatbot`**:
   - `community/system/mya.js`: Atlas’s runtime primitives (`who` observing `/tmp/cc-socks/*.sock`, durable jsonl queuing, `emit`, `coverage`).
   - `community/system/doctor.js`: Non-mutating observer checking service keys and git state.
   - `packages/agent-os/`: Experimental runner/runtime package with wake-token files.

### Q2: What is duplicated?
- Multiple implementations of registry, tasks, events, and inboxes across two repositories.
- Disconnected CLI commands (`mya`, `myaos`, `aos`).
- Inconsistent inbox storage (`community/inboxes/<agent>/` JSON vs `community/system/inbox/<agent>.jsonl`).

### Q3: What is genuinely functional?
- Socket observation via `/tmp/cc-socks/*.sock` in `mya.js`.
- Capability-based task routing and dependency cascading in `CreativeSites-Ai-Team/src/tasks.js`.
- Integrity verification in `CreativeSites-Ai-Team/src/verifier.js` (refuses to infer pass without machine evidence; returns `UNKNOWN/UNRESOLVED`).
- The 9/9 unit tests in `hairJourneyService.test.js` and streaming NDJSON in `packages/myavana`.

### Q4: What is simulated?
- Agent execution in `workflow.test.js` was simulated by in-process file writes.
- Agent waking in `wakeLifecycle.test.js` was simulated by in-process runner calls.
- Neither test proved that an independent OS process was spawned, monitored, and verified.

### Q5: What is machine-observed?
- Unix domain sockets in `/tmp/cc-socks/` (mtime, inode, socket existence).
- Operating system process table (`ps -p <pid> -o pid,ppid,command` and `process.kill(pid, 0)`).
- Process exit codes (0 vs non-zero).
- Filesystem existence, byte size, and SHA-256 hashes.
- Git porcelain status.

### Q6: What is only agent-reported?
- Agent status (`AVAILABLE`, `WORKING`, `SLEEPING`) in static JSON.
- Declared capabilities.
- Unverified completion claims in markdown or task descriptions.

### Q7: What is the canonical source of truth?
- **Repository**: `https://github.com/creativesites/CreativeSites-Ai-Team.git` is the single canonical home for MyaOS and the multi-repo community hub.
- **Package**: `CreativeSites-Ai-Team/src` is the single consolidated MyaOS engine. `aos/` is deprecated and absorbed.
- **CLI**: `bin/myaos.js` is the single canonical executable (with `bin/aos` symlinked for backward compatibility).
- **Registry**: `community/agents.json` is the machine-readable truth. `AGENTS_REGISTRY.md` is a generated read-only presentation.
- **Liveness**: Machine-observed runtime sessions in OS process table + `/tmp/cc-socks/`.

### Q8: What runtime abstraction should we use?
An adapter-based `AgentRuntime` interface that decouples agent identity from execution medium:
```typescript
interface AgentRuntime {
  type: 'terminal_process' | 'interactive_ide' | 'tmux' | 'headless';
  start(agent: string, options?: any): Promise<RuntimeSession>;
  stop(runtimeId: string): Promise<void>;
  wake(agent: string, task: Task): Promise<WakeResult>;
  sleep(agent: string): Promise<void>;
  status(agent: string): Promise<RuntimeStatus>;
  send(agent: string, message: any): Promise<void>;
  observe(agent: string): Promise<SessionObservation>;
}
```

### Q9: How should terminal/IDE/headless runtimes coexist?
- **Interactive IDE sessions**: Detected via `/tmp/cc-socks/*.sock`. Durable messages queued in inbox; live signals sent via agent tools.
- **Terminal Worker processes**: Run via `myaos worker --agent <name>`. Spawned as detached or monitored Node child processes with unique PIDs.
- **Headless runtimes**: Spawned on-demand by `RuntimeManager` when wake is requested, and terminated cleanly when task finishes.

### Q10: What is the smallest real autonomous vertical slice we can prove?
A **real OS process lifecycle**:
1. Spawn independent child process: `node bin/myaos.js worker --agent kael` with distinct PID.
2. Machine verifies PID in OS process table.
3. Task routed to Kael.
4. MyaOS delivers message and signals worker process.
5. Worker executes real command, writes real artifact, records real exit code 0.
6. MyaOS verifies observed evidence and marks task `VERIFIED`.
7. Worker shuts down; MyaOS observes PID disappearance and marks agent `SLEEPING`.
**Zero simulation. 100% OS-level proof.**

---

## 🏛️ 2. The Four Decoupled Concepts

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. AGENT IDENTITY (Who you are)                             │
│    Astra / Vela / Atlas / Iris / Kael / Lyra / Nexus         │
└──────────────────────────────┬──────────────────────────────┘
                               │ possesses capabilities & roles
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. RUNTIME ADAPTER (How code executes)                      │
│    TerminalProcess / InteractiveIDE / Tmux / HeadlessWorker │
└──────────────────────────────┬──────────────────────────────┘
                               │ instantiates
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SESSION INSTANCE (Machine-observable reality)            │
│    runtime_id: run_12630_x89, pid: 12630, socket: /tmp/...  │
└──────────────────────────────┬──────────────────────────────┘
                               │ executes
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. TASK (The work unit)                                     │
│    TASK-001: requires capabilities, produces evidence proof │
└─────────────────────────────────────────────────────────────┘
```

**Cardinal Invariant**:
$$\text{Identity} \neq \text{Liveness} \neq \text{Runtime} \neq \text{Working State}$$

---

## 🔒 3. Provenance & Epistemic Quad

Every state mutation in MyaOS carries an auditable provenance envelope:
```json
{
  "actor": "atlas",
  "operation": "TASK_VERIFIED",
  "timestamp": "2026-09-05T12:05:00Z",
  "runtime_id": "run_12630_x89",
  "evidence_class": "OBSERVED_MACHINE",
  "evidence": {
    "pid": 12630,
    "exit_code": 0,
    "artifact_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

The five epistemic states:
- `DECLARED`: What an entity claims without proof.
- `ATTESTED`: What a verified live participant signs in first-person.
- `OBSERVED`: What machine instrumentation checks directly.
- `VERIFIED`: What deterministic artifacts prove (exit 0, hash match).
- `UNKNOWN`: Default when evidence is missing or ambiguous.
