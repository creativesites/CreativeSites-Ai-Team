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

## 🖥️ MyaOS Desktop Control Plane (`desktop/`)

The repository includes the native macOS desktop application (`desktop/`) built with **Tauri v2**, **React 19**, **Tailwind CSS v3**, **xterm.js**, and direct native SQLite substrate integration (`data/myaos.db`).

### Features:
- **CleanMyMac-Inspired Cockpit**: Frosted liquid-glass interface with real-time mission pipelines, live token metrics, and autonomous handoff status.
- **Autonomous Agent Handoff**: Auto-Pilot routing where Gemini 3.8 Flash assesses changes and dispatches Lead Verifier Kael [KL] for independent verification.
- **In-Chat Interactive Artifacts**: Live diff inspector (`git add .` staging), feature blueprints, bug repro harnesses, and executive sign-off cards.
- **Designer Workspace**: Always-available AI HTML UI generator with live iframe canvas, 1-click starter blueprints, and prompt refinement.
- **Project Matrix & Workspaces**: Direct project creation, git clone, local folder attachment, and interactive terminal sessions.

### Quickstart:

```bash
# Run desktop in dev mode
npm run desktop:dev

# Compile production frontend & Rust binary
npm run desktop:build

# Package macOS DMG installer
npm run desktop:dmg
```

### Desktop v2 and the runtime (in progress)

> Current workstream: read `community/proposals/DESKTOP_V2_HANDOFF.md` (API map + UI tasks), `DESKTOP_V2_DECISIONS.md` (accepted product decisions) and `ACP_SPIKE_FINDINGS.md` (adapter reality). The runtime foundation, ACP session manager, council engine and team bridge are implemented on `claude/desktop-app-ai-teams-2fa62f`; the app screens still need wiring.

The new app (`apps/desktop/`) and its engine (`runtime/`) are being built per `community/proposals/DESKTOP_V2_BUILD_PLAN.md`. The desktop shows the runtime's records and makes no AI calls of its own.

```bash
npm run desktop2:dev   # the app; it starts the runtime itself if none is running
npm run runtime        # the runtime alone (Node 24+, no other dependencies)
npm run runtime:test
```

- The runtime keeps its own store at `~/.myaos/runtime.db` (or `$MYAOS_RUNTIME_DB`) and publishes its address and token in `~/.myaos/runtime.json`, readable only by you. `data/myaos.db` keeps serving the current app and the team.
- `node bin/myaos.js status` reports the runtime as well.
- During development, `#/preview/<screen>` shows each screen with the design's sample data. The live app never shows sample data.
- The Design Studio has two entry points: "Design something new" (a feature, page or app, in 1 to 4 directions) and "Bring in existing UI" (an agent recreates the project's current screens so they can be iterated on).
- Both run as a real agent session. Agent-built designs are written as HTML files to `~/.myaos/designs/<board>/` (under `$MYAOS_HOME` when set), and appear on the canvas as the agent writes them.
- Approving a design frame records Observed evidence for that exact version.

### Machine config and the database:

- Paths that differ per machine (team repo, project repos per agent, workspace list) live in `~/.myaos/config.json`, or the file named by `$MYAOS_CONFIG`. Copy `myaos.config.example.json` to start. Nothing in the code hard-codes a home directory.
- The SQLite store `data/myaos.db` is **not in git**: it changes on every run. A fresh clone gets an empty store built from `data/myaos.schema.sql`. Point everything at another file with `$MYAOS_DB_PATH`.
- Order of precedence everywhere (CLI, desktop, dashboard): environment variable, then config file, then this repository.

---

## 🔒 Security & Human Escalation Policy
The AI team operates autonomously within defined technical boundaries. The following actions strictly require **Winston's explicit approval**:
1. Production deployments to live customer environments.
2. Generating, rotating, or revoking production secrets or API keys.
3. Destructive database migrations or schema drops.
4. Any financial, billing, or external legal commitment.
