# CreativeSites AI Team & MyaOS

> **Workflow status (2026-11-03):** The MyaOS v2 Operating Model has been unified under **Single Writer Authority** (`~/.myaos/runtime.db`). See [`AGENTS.md`](AGENTS.md), [`041_myaos_workflow_from_scratch.md`](community/threads/041_myaos_workflow_from_scratch.md), and [`MYAOS_V2_WORKFLOW_ENGINE_SPEC.md`](community/proposals/MYAOS_V2_WORKFLOW_ENGINE_SPEC.md).

---

## 🧭 The 1-Page Agent Field Manual (Mandatory for All Agents)

Every agent session (Claude Code, Antigravity, or terminal) must execute this protocol from minute 1:

1. **Step 1 — Identity & Registration**: Confirm your registered ID in [`community/agents.json`](community/agents.json). If unlisted, register before modifying code.
2. **Step 2 — Substrate-First Context**: Query verified facts before researching from scratch: `node bin/myaos.js status` or `./bin/query-facts.sh "<topic>"`.
3. **Step 3 — 3-Tier Intake Gate**: Before writing code, classify your assignment using [`community/skills/intake-triage`](community/skills/intake-triage/SKILL.md):
   - **Tier 1 (Direct)**: < 1h bug fix/tweak ──> write code + un-mocked test ──> hand off to Kael.
   - **Tier 2 (Modular Task)**: Multi-agent feature ──> create thread in `community/threads/` + decompose into SQLite `tasks`.
   - **Tier 3 (Council of Planners)**: Strategic bet / new client engagement / high ruin risk ──> convene Council via [`community/skills/planner-brief`](community/skills/planner-brief/SKILL.md). Never implement alone.
4. **Step 4 — Communication & Stand-ups**: Record non-trivial epics in `community/threads/`. Ensure daily stand-ups are compiled via `node scripts/generate_daily_standup.mjs` (08:00 CAT daemon).
5. **Step 5 — The Independent Verifier Gate**: **You are strictly forbidden from self-verifying your own work.** Transition completed tasks to `in_review` and request independent review from `@Kael` or `@Antigravity` via [`community/skills/independent-verification`](community/skills/independent-verification/SKILL.md).
6. **Step 6 — Git & Workspace Hygiene**: Atomic conventional commits (`feat(scope): ...`, `fix(scope): ...`). Zero uncommitted drift, zero secrets, zero mock falsification.

---

Welcome to the centralized autonomous agent collaboration hub and operating system for **CreativeSites** projects, including:
- **Myavana AI Chatbot & Backend Core** (`Myavana-Chatbot`)
- **Myavana Operator Console & Dashboard** (`Myavana-Chatbot-Dashboard`)
- **Myavana Hair Journey WordPress Platform** (`myavana-hair-journey-next`)
- **Myavana React Native Mobile SDK** (`packages/react-native-sdk`)
- **DogForce / DeployGuard Security Suite** (`DogFrce Security Services Custom Odoo Modules`)
- **The Legacy Line AI Social Automation** (New Client Project)
- **SOFFUN Live Streaming Platform** (New Client Project)

---

## 👥 Agent identities

The machine-readable declarations are in [`community/agents.json`](community/agents.json); role evidence and caveats are in [`community/AGENTS_REGISTRY.md`](community/AGENTS_REGISTRY.md). These are not a live presence feed: a declared role does not prove that an agent is currently available or that a runtime can dispatch to it.

---

## ⚡ MyaOS (Myavana Agent Operating System)

This repository has a Node-based MyaOS runtime and a Tauri desktop control plane. They currently use separate paths and state surfaces; capabilities documented for one should not be assumed to be wired into the other. The workflow review and target design are linked in the status note above.

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

### Current runtime boundaries

The Node runtime has task, event, inbox, and verification components. Some are exercised through CLI flows; the current repository audit found no unified capability router and no shared lifecycle with the desktop. Read [`community/INTELLIGENCE_LAYER_STATUS.md`](community/INTELLIGENCE_LAYER_STATUS.md) for the detailed runtime status and limitations. Desktop task paths are separate and are summarized in the [workflow review](community/threads/041_myaos_workflow_from_scratch.md).

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

### Workflow status

The desktop has project, chat, design, and task views, but their task creation and dispatch paths are not yet unified. Some status shown in views is local/presentation state. Planner routing, agent communication, and verification are not consistently connected end to end. See the [workflow audit](community/threads/041_myaos_workflow_from_scratch.md) before relying on a specific flow; the operating model describes the target.

### Quickstart:

```bash
# Run desktop in dev mode
npm run desktop:dev

# Compile production frontend & Rust binary
npm run desktop:build

# Package macOS DMG installer
npm run desktop:dmg
```

---

## 🔒 Security & Human Escalation Policy
The AI team operates autonomously within defined technical boundaries. The following actions strictly require **Winston's explicit approval**:
1. Production deployments to live customer environments.
2. Generating, rotating, or revoking production secrets or API keys.
3. Destructive database migrations or schema drops.
4. Any financial, billing, or external legal commitment.
