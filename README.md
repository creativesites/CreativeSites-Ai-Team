# CreativeSites AI Team & MyaOS

Welcome to the centralized autonomous agent collaboration hub and operating system for **CreativeSites** projects, including:
- **Myavana AI Chatbot & Backend Core** (`Myavana-Chatbot`)
- **Myavana Operator Console & Dashboard** (`Myavana-Chatbot-Dashboard`)
- **Myavana Hair Journey WordPress Platform** (`myavana-hair-journey-next`)
- **Myavana React Native Mobile SDK** (`packages/react-native-sdk`)

---

## 👥 The Active Agent Team

| Agent | Symbol | Primary Domain | Organizational Role |
|:---|:---:|:---|:---|
| **Atlas** | ⏣ | Platform, Cloud Run, Backend & Security | **Team Coordinator & Release Guardian** |
| **Astra** | ✦ | Widget SDK, AI Streaming, Gemini Live Voice | **Protocol Steward & AI Lead** |
| **Vela** | ✧ | WordPress, REST API, SPA Shell, System of Record | **Knowledge Keeper & Site Integration Guardian** |
| **Iris** | 👁 | Operator Console, Next.js 15, Customer 360, Telemetry | **System Observer & Lead Planner** |
| **Kael** | 🛡️ | QA, Testing Automation, Performance & Latency | **Lead Verifier & Code Reviewer** |
| **Lyra** | 📱 | Cross-Platform Mobile SDK, React Native, Native Voice | **Mobile Integration Guardian** |
| **Nexus** | ⚡ | Orchestration Platform Engineering, Runtime, Daemons | **Runtime Operator & Bus Architect** |
| **The Orchestrator** | 🧠 | Autonomous Coordination & Cross-Repo Synthesis | **Autonomous Dispatcher & State Synthesizer** |

---

## ⚡ MyaOS (Myavana Agent Operating System)

MyaOS is a local, lightweight multi-agent runtime and coordination substrate built directly into this repository.

### Architecture Overview

```text
                     WINSTON (Human Authority)
                                │
                    [Escalation & Policy Gates]
                                │
                        THE ORCHESTRATOR
                (Synthesizer & Global Reasoner)
                                │
                  ┌─────────────┴─────────────┐
                  │    MYAOS EVENT BUS        │
                  │  (community/events.ndjson)│
                  └─────────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
    [Agent Inbox]         [Task Queue]         [Agent Registry]
(inboxes/<agent>/)     (community/tasks/)    (community/agents.json)
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                   [Terminal Wake Controller]
              (FIFO / Subprocess / Shell Adapter)
                                │
      ┌───────────┬───────────┬─┴─────────┬───────────┐
      ▼           ▼           ▼           ▼           ▼
    Atlas       Astra       Vela        Iris        Kael / Lyra / Nexus
```

### Core Primitives
1. **Machine-Readable Registry (`community/agents.json`)**:
   Tracks agents, status (`AVAILABLE`, `WORKING`, `SLEEPING`, `REVIEWING`), capabilities tags, and accessible repositories.
2. **Capability-Based Task Router**:
   Tasks define required capabilities (e.g. `['react-native', 'mobile-audio']`). The router dynamically scores and matches the best candidate agent without hardcoded manual dispatch.
3. **Structured Event Bus (`community/events.ndjson`)**:
   Append-only event log capturing lifecycle milestones (`agent.registered`, `task.assigned`, `task.completed`, `review.requested`, `verification.passed`).
4. **Agent Inboxes (`community/inboxes/<agent>/`)**:
   Asynchronous messaging directory with typed YAML/JSON metadata headers (`from`, `to`, `priority`, `type`, `related_task`).
5. **Evidence-Based Verification Engine (`src/verifier.js`)**:
   Enforces "observed state > reported state". Tasks cannot transition to `DONE` without verified execution evidence (linter exit code 0, unit test pass count, git diff check).
6. **System Diagnostic Tool (`myaos doctor`)**:
   Self-healing diagnostic CLI validating registry integrity, unread critical alerts, orphan tasks, and uncommitted git churn.

---

## 🛠️ CLI Quickstart

```bash
# View team status, task queue, and live events
./bin/myaos.js status

# Run system health diagnostics
./bin/myaos.js doctor

# Wake an agent into WORKING state
./bin/myaos.js wake Lyra

# Put an agent to sleep when idle
./bin/myaos.js sleep Lyra

# Run an autonomous orchestration cycle
./bin/myaos.js orchestrator

# Run end-to-end vertical slice test suite
npm test
```

---

## 🔒 Security & Human Escalation Policy
The AI team operates autonomously within defined technical boundaries. The following actions strictly require **Winston's explicit approval**:
1. Production deployments to live customer environments.
2. Generating, rotating, or revoking production secrets or API keys.
3. Destructive database migrations or schema drops.
4. Any financial, billing, or external legal commitment.
