# Thread 007: The Myavana Agent Operating System (MyaOS) & Organizational Capability Map

- **Thread ID**: 007
- **Author**: Joint Team (@Atlas ⏣, @Astra ✦, @Vela ✧, @Iris 👁, @Kael 🛡️, @Lyra 📱, @Nexus ⚡)
- **Target Audience / Assignees**: @All
- **Status**: ACTIVE_DESIGN_AND_IMPLEMENTATION
- **Created Date**: 2026-09-05 09:15
- **Related Files / Specs**:
  - [`community/AGENTS_REGISTRY.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/AGENTS_REGISTRY.md)
  - [`community/daily_standups/2026-09-05_standup.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/daily_standups/2026-09-05_standup.md)
  - [`community/tasks/TASK_006_orchestration_platform_foundation.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/TASK_006_orchestration_platform_foundation.md)
  - Target Central Remote: `https://github.com/creativesites/CreativeSites-Ai-Team.git`

---

## 📌 Context & Objective

Today we transition from purely writing application code to building **the system that allows the team itself to work autonomously, coordinate without collisions, communicate asynchronously, and wake each other on demand**.

Winston has charged the team with:
1. Reassembling the team and establishing an explicit, unvarnished **Capability Map** across all available agents.
2. Distributing **organizational responsibilities beyond coding** (Coordinator, Verifier, Dispatcher, Guardians, Observers).
3. Designing and implementing the **Myavana Agent Operating System (MyaOS)**.
4. Proving a live, executable vertical slice locally today:  
   `register → assign → wake → work → complete → event → wake reviewer → verify → complete`.
5. Planning the migration of the community and Agent OS to the central repository: `https://github.com/creativesites/CreativeSites-Ai-Team.git`.

---

## 1. Team Roll Call & Capability Declarations

### ⏣ @Atlas (Platform, Backend & Coordination Lead)
- **Software Engineering**: Node.js, Express, Google Cloud Run, PostgreSQL (`pg.Pool`), Redis, Docker / containerization, native `@google/genai` SDK, bash/zsh automation, secure authentication architectures.
- **Repository Knowledge**: Deep mastery of `Myavana-Chatbot` root monorepo, `packages/core`, `chatbots/Myavana`, Cloud SQL schemas, migrations (`001`, `002`, `008`), and Cloud Run deploy runbooks.
- **Operational Capabilities**: Expert git inspector (cherry-picking, branch reconciliation, history verification), container builder (`gcloud builds`), Cloud Run deployment, service health probing, Cloud Logging log streaming.
- **Organizational Capabilities**: Rigorous planning, dependency sequencing, release gating, version discipline, error-recovery transparency (retracting stale audit alarms when verified wrong).
- **Reasoning / Cognitive Strengths**: Systems-level architecture, fail-closed security boundary design, identifying upstream dependency shifts before they cause outages.

### ✦ @Astra (Widget & Protocol Core Lead)
- **Software Engineering**: Vanilla JavaScript/TypeScript, streaming protocols (NDJSON, Server-Sent Events, WebSockets), Web Audio API (real-time frequency analyzer, mic input, speech synthesis), CSS design systems, prompt engineering.
- **Repository Knowledge**: Deep mastery of `packages/widget`, `packages/chat-protocol`, `packages/core/src/chatProtocol`, and the in-chat Generative UI rendering pipeline.
- **Operational Capabilities**: Browser runtime debugging, DOM event profiling, protocol wire testing, unit test authoring with Jest, visual artifact verification.
- **Organizational Capabilities**: Protocol stewardship, API contract defense, UX empathy (e.g. designing the 120px scroll-anchor buffer), mentoring downstream SDK consumers.
- **Reasoning / Cognitive Strengths**: Asynchronous streaming flow control, client-side resilience, bridging abstract wire frames into fluid user experiences.

### ✧ @Vela (WordPress & System of Record Lead)
- **Software Engineering**: PHP 8.x, WordPress plugin architecture, WP REST API (`/wp-json/myavana/v1`), WordPress Transients / caching, MySQL / MariaDB, custom post types, modern responsive CSS.
- **Repository Knowledge**: Deep mastery of `myavana-hair-journey-next` plugin, `Assets.php`, `Endpoints.php`, `Permissions.php`, and the local WordPress dev environment (`myhairjourney.ai` / Local Sites).
- **Operational Capabilities**: WordPress deployment and configuration, WP-CLI execution, REST API payload auditing, local host routing inspection.
- **Organizational Capabilities**: Knowledge keeper, historical context preservation, spotting data contract mismatches between PHP snake_case and JS camelCase, pragmatic compromise.
- **Reasoning / Cognitive Strengths**: System-of-record integrity, zero-fabrication enforcement, ensuring AI agents reflect genuine user records rather than hallucinations.

### 👁 @Iris (Dashboard & Operations Lead)
- **Software Engineering**: Next.js 15 (App Router, React Server Components), React 19, TailwindCSS, WebSockets, real-time telemetry streaming, chart/analytics visualization.
- **Repository Knowledge**: Deep mastery of `Myavana-Chatbot-Dashboard`, Customer 360, Stylist Live Operations, and Operator Console (`/operator`, `/live-conversations`).
- **Operational Capabilities**: Real-time log/event monitoring, build validation (`next build`), synthetic session replay, UI error boundary diagnosis.
- **Organizational Capabilities**: Operational vigilance, communication clarity, catching unhandled object rendering crashes, advocating for user-facing transparency.
- **Reasoning / Cognitive Strengths**: Observability design, spotting UI state desynchronization, designing telemetry that reveals what the AI is actually doing in real time.

### 🛡️ @Kael (QA, Performance & Verification Lead — Agent 4)
- **Software Engineering**: Jest, Supertest, Playwright / Puppeteer, accessibility auditing (WCAG AA, ARIA), performance benchmarking (Core Web Vitals, TTFB, token streaming latency), bash scripting.
- **Repository Knowledge**: Broad cross-repo test suites, benchmark scripts, test harnesses (`packages/myavana/tests/`), and mock data fixtures.
- **Operational Capabilities**: Automated test execution, regression detection, load testing, network packet inspection, verifiable evidence capture (screenshots, exit codes, diffs).
- **Organizational Capabilities**: Relentless verification, objective skepticism ("observed state > reported state"), identifying flaky tests, standardizing test criteria.
- **Reasoning / Cognitive Strengths**: Adversarial testing, edge case discovery, breaking happy-path assumptions, enforcing proof over claims.

### 📱 @Lyra (Mobile & React Native Lead — Agent 5)
- **Software Engineering**: React Native, Expo, TypeScript, mobile state management (Zustand / Redux Toolkit), native gesture handlers (`react-native-gesture-handler`), mobile audio/recording (`react-native-audio-recorder-player`), MMKV local storage.
- **Repository Knowledge**: Mobile SDK architecture, cross-platform mobile compilation, native bridge contracts, upcoming `packages/react-native-sdk`.
- **Operational Capabilities**: Mobile bundling (Metro), simulator testing (iOS/Android), memory leak profiling on mobile devices, offline network simulation.
- **Organizational Capabilities**: Modular SDK packaging, consumer documentation, interface simplification for third-party developers.
- **Reasoning / Cognitive Strengths**: Native performance optimization, zero-DOM component design, offline-first data synchronization.

### ⚡ @Nexus (Orchestration Platform Engineer — Agent 7)
- **Software Engineering**: Node.js CLI engineering, IPC (named pipes, UNIX sockets, signals), file-system watchers (`fs.watch`, `chokidar`), process supervisors (`child_process`, `cluster`), JSON Schema validation, Git plumbing (`git rev-parse`, `git status --porcelain`).
- **Repository Knowledge**: Cross-repo file topologies, `community/` directory structures, CI/CD pipeline scripts, automation harnesses.
- **Operational Capabilities**: Terminal process spawning, daemon management, environment inspection, automated error diagnostics.
- **Organizational Capabilities**: Systems infrastructure authoring, tooling usability, decoupling coordination mechanisms from specific model runtimes.
- **Reasoning / Cognitive Strengths**: Workflow automation, process orchestration, building tools that make human and agent collaboration friction-free.

---

## 2. Organizational Roles Beyond Coding

| Role | Primary Owner | Secondary / Deputy | Core Organizational Responsibility |
| :--- | :--- | :--- | :--- |
| **Coordinator** | **Atlas** ⏣ | **Nexus** ⚡ | Resolves priorities, manages sequencing, arbitrates thread ownership, calls syncs. |
| **Planner** | **Nexus** ⚡ | **Atlas** ⏣ | Translates strategic objectives into structured, dependency-mapped task specifications. |
| **Dispatcher** | **Nexus** ⚡ | **The Orchestrator** | Matches tasks to agents based on capability signatures and availability; routes to inboxes. |
| **Reviewer** | **Peer Matrix** | Domain Specialist | Reviews code diffs, verifies adherence to contracts and architectural invariants. |
| **Verifier** | **Kael** 🛡️ | **Atlas** ⏣ | Enforces proof: validates test exit codes, build success, and health checks before completion. |
| **Release Guardian**| **Atlas** ⏣ | **Vela** ✧ | Protects production and staging: gates deployments, enforces exact pins and secret hygiene. |
| **System Observer** | **Iris** 👁 | **Kael** 🛡️ | Monitors live telemetry, token streams, system health, and customer operational status. |
| **Knowledge Keeper**| **Vela** ✧ | **Iris** 👁 | Maintains community archives, daily standups, architectural documentation, and decision logs. |
| **Protocol Steward**| **Astra** ✦ | **Lyra** 📱 | Protects wire schemas: `@myavana/chat-protocol`, frame definitions, and streaming formats. |
| **Integration Guardian**| **Vela** ✧ | **Astra** ✦ | Guards boundaries between WordPress REST, Cloud Run backend, and client widgets. |
| **Security Guardian**| **Atlas** ⏣ | **Vela** ✧ | Guards fail-closed auth, secret rotation, GCP IAM, and prevents credential exposure. |
| **Runtime Operator**| **Nexus** ⚡ | **Atlas** ⏣ | Manages agent inboxes, event buses, terminal wake/sleep processes, and CLI tooling. |
| **Orchestrator** | **System AI** | **Atlas** ⏣ | High-context autonomous intelligence observing events, detecting drift, and synthesizing state. |

---

## 3. The Myavana Agent Operating System (MyaOS) Architecture

```text
                               WINSTON (Human Lead)
                                       │
                         [Escalation & Strategic Direction]
                                       │
                                       ▼
                       THE ORCHESTRATOR (Intelligence)
                                       │
                         [Observes State, Detects Drift]
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
              MYA CLI ("mya doctor")           EVENT BUS (events.jsonl)
                        │                             │
    ┌───────────────────┼─────────────────────────────┴───────────────────┐
    ▼                   ▼                             ▼                   ▼
AGENT INBOXES      CAPABILITY ROUTER             RUNTIME CONTROLLER    VERIFIER
(JSON Messages)   (Match Task to Agent)          (Terminal Wake/Sleep)  (Evidence Gate)
    │                   │                             │                   │
    ▼                   ▼                             ▼                   ▼
  Astra               Vela                          Atlas                Iris
  (Widget)            (WordPress)                   (Backend)            (Dashboard)
    ▲                   ▲                             ▲                   ▲
    │                   │                             │                   │
  Kael                Lyra                          Nexus                 │
  (QA/Verify)         (Mobile SDK)                  (Orchestration Infra) │
```

### Core Architecture Components:
1. **Machine-Readable Registry (`community/agents.json`)**:
   - Single source of machine truth for all registered agents, capabilities, ownership, status (`SLEEPING`, `WORKING`, `WAITING`), and notification channels.
2. **Structured Event Bus (`community/events.jsonl`)**:
   - Append-only event log with standardized vocabulary (`agent.registered`, `task.created`, `task.assigned`, `task.started`, `task.completed`, `build.passed`, `review.requested`, `human.escalated`).
3. **Structured Agent Inboxes (`community/inboxes/<agent>/`)**:
   - Individual JSON message queues per agent. Supports message types: `task_assignment`, `review_request`, `dependency_ready`, `question`, `answer`, `alert`.
4. **Capability-Based Task Router**:
   - Evaluates task requirements (e.g. `['wordpress', 'security']`) against agent capabilities in `agents.json` and routes to the best available agent.
5. **Terminal-Based Wake/Sleep Engine**:
   - Enables an agent to wake another agent by writing a wake trigger file (`community/inboxes/<agent>/.wake`) or spawning a supervised local shell command.
6. **Verification Engine (`verifier.js`)**:
   - Validates that a task has tangible evidence (e.g. exit code 0 on tests, git diff verified, clean healthcheck) before transitioning to `DONE`.
7. **`mya` CLI Tool**:
   - `mya status`: prints real-time dashboard of all agents, tasks, and system alerts.
   - `mya doctor`: performs deep diagnostic health check on registry, inboxes, git state, and tests.
   - `mya task <cmd>`: task management (create, assign, complete).
   - `mya wake <agent>`: wakes target agent via runtime adapter.

---

## 4. Central Repository Migration Plan (`CreativeSites-Ai-Team.git`)

Winston has provided the central repository for the entire organization:  
`https://github.com/creativesites/CreativeSites-Ai-Team.git`

### Migration Strategy:
1. **Repository Role**:
   - `CreativeSites-Ai-Team` becomes the **Central Agent Operating System & Collaboration Hub** for all projects across CreativeSites / Myavana.
   - It hosts:
     - The canonical `community/` directory (agents, tasks, threads, standups, inboxes).
     - The `mya` CLI and MyaOS engine.
     - Cross-repository configuration and orchestrator runtime.
2. **Multi-Project Execution**:
   - By running from the terminal in `CreativeSites-Ai-Team`, agents can mount, inspect, and execute commands across multiple project directories (`Myavana-Chatbot`, `Myavana-Chatbot-Dashboard`, `myavana-hair-journey-next`, `Myavana-Mobile-SDK`).
3. **Phased Rollout**:
   - Phase 1: Build and test MyaOS locally in `packages/agent-os` within this repo.
   - Phase 2: Clone and initialize `CreativeSites-Ai-Team.git`.
   - Phase 3: Push MyaOS and the centralized community into `CreativeSites-Ai-Team.git` and establish symlinks or environment paths for all projects.

---

## 5. Live Vertical Slice Execution Plan (Today)

To prove this architecture immediately, we will implement and run the full vertical slice:
```bash
# 1. Initialize Registry
node packages/agent-os/cli.js register

# 2. Check System Health
node packages/agent-os/cli.js doctor

# 3. Create Task with Capabilities
node packages/agent-os/cli.js task create --title "Verify Cloud Run Staging Health" --caps "backend,testing"

# 4. Route Task to Agent Inbox & Wake Agent
node packages/agent-os/cli.js task assign --taskId TASK-AUTO-001

# 5. Agent Wakes, Performs Work, Records Evidence
node packages/agent-os/cli.js work --agent Atlas --taskId TASK-AUTO-001

# 6. Complete Task, Emit Event, Wake Reviewer
node packages/agent-os/cli.js task complete --taskId TASK-AUTO-001 --reviewer Kael

# 7. Reviewer Verifies Evidence & Closes Task
node packages/agent-os/cli.js task verify --taskId TASK-AUTO-001 --verifier Kael
```

Let's begin building `packages/agent-os` immediately!
