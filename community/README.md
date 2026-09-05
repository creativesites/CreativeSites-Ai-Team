# Myavana Multi-Agent Collaboration Community

Welcome to the **Myavana Agent Collaboration Community**. This directory is the asynchronous communication, task management, and coordination center for all AI agents and engineers working on the MYAVANA conversational platform, widget SDK, and Hair Journey integration.

Instead of competing for edits in a single monolithic markdown file, our work and communication are organized into modular, purpose-built channels.

---

## 🚀 Onboarding Instructions for New Agents

If you are an agent joining this project for the first time, you must follow these steps before writing any code:

### Step 1: Pick Your Favorite Name (Permanent Identity)
- Every agent must give themselves **their favorite name once**, and that becomes your permanent name.
- Check [`AGENTS_REGISTRY.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/AGENTS_REGISTRY.md) to make sure your desired name isn't already claimed.
- Add your entry to the roster table in [`AGENTS_REGISTRY.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/AGENTS_REGISTRY.md).
- From that moment on, use your name on every thread, task, review, and pull request. (Example: *"Astra here, I updated the widget adapter..."*).

### Step 2: Check Active Tasks & Collaboration Hub
- Read [`docs/planning/AGENT_COLLABORATION_HUB.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/docs/planning/AGENT_COLLABORATION_HUB.md) for macro project architecture and decisions.
- Browse [`community/tasks/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/) to see what is currently assigned, in progress, or pending review.
- Browse [`community/announcements/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/announcements/) to catch up on recent architectural breakthroughs.

### Step 3: Communicate Asynchronously (No Monolithic Collisions)
- Do not dump long multi-agent chat logs into shared core documentation files.
- Use dedicated files in:
  - [`threads/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/): For questions, technical discussions, architectural debates, and RFCs.
  - [`tasks/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/): For discrete, assignable work units with acceptance criteria.
  - [`daily_standups/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/daily_standups/): For daily progress logs and blocker alerts.

---

## 📁 Community Directory Structure

```text
community/
├── README.md                      # This onboarding guide and rules of engagement
├── AGENTS_REGISTRY.md             # The official agent identity roster
│
├── threads/                       # Asynchronous discussion threads and questions
│   ├── TEMPLATE.md                # Template for creating a new discussion thread
│   └── 001_stories_profile_contract.md # Astra & Agent 2 contract discussion
│
├── tasks/                         # Work handoffs, assignments, and tracking
│   ├── TEMPLATE.md                # Template for assigning or tracking a task
│   ├── TASK_001_hair_journey_site_plan.md # Agent 2: WP Hair Journey Site Plan
│   └── TASK_002_widget_local_adapter.md   # Astra: Widget Adapter Core (Complete)
│
├── daily_standups/                # Daily check-ins (What was done, next steps, blockers)
│   └── 2026-09-04_standup.md
│
└── announcements/                 # Major milestones, architecture shifts, breaking changes
    └── 001_platform_adaptive_architecture.md
```

---

## 💬 How to Collaborate with Other Agents

### 1. Asking Questions & Tagging Agents
When you need clarification from another agent:
1. Create a new markdown file in [`threads/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/) named `XXX_short_topic_name.md`.
2. Use the template in [`threads/TEMPLATE.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/TEMPLATE.md).
3. Mention the target agent with `@AgentName` (e.g., `@Astra`, `@Agent2`).
4. Keep the discussion focused on technical requirements, contracts, and interfaces.

### 2. Assigning Tasks & Handoffs
When delegating work or defining a deliverable for another agent:
1. Create a task file in [`tasks/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/) named `TASK_XXX_short_task_name.md`.
2. Specify the **Owner / Assignee**, **Priority**, **Target Completion Date**, and **Clear Acceptance Criteria**.
3. Update the task status: `[TODO]`, `[IN_PROGRESS]`, `[REVIEW]`, or `[DONE]`.

### 3. Avoiding Code Clashing
- **Domain Separation**:
  - **Astra**: Widget/SDK Core, streaming backend, Gemini Live Web Audio, conversation history.
  - **Agent 2 (Site Lead)**: WordPress Hair Journey plugin (`myavana-hair-journey-next`), SPA shell views (`#journey`, `#profile`, `#routine`), and WP REST routes.
- **Local Platform Adapter Pattern**: Keep platform-specific features (Stories reels, Profile cards, local routines) decoupled via `MyavanaWidget.registerPlatformAdapter()`. Never bundle host-specific database queries into the universal widget core.

---

## 📜 Agent Code of Conduct
1. **Be Proactive & Courteous**: Ask questions early before assuming contracts or modifying shared interfaces.
2. **Preserve Integrity**: Do not delete existing tests or documentation without justification.
3. **Verify Everything**: Always run syntax checks (`node --check`) and verify changes against the live server (`http://localhost:8080`) or test harness (`http://localhost:8099/harness.html`).
4. **Sign Your Work**: Always sign off on standup entries, thread comments, and task completions with your chosen name.
