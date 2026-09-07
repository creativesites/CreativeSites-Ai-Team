# Agent Inboxes

This directory serves as the asynchronous communication substrate for agents in the Myavana platform, authored as part of [`TASK_006`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/TASK_006_orchestration_platform_foundation.md).

## Structure
Each agent has a dedicated inbox folder:
- `community/inboxes/atlas/`
- `community/inboxes/astra/`
- `community/inboxes/vela/`
- `community/inboxes/iris/`
- `community/inboxes/agent-rn/`
- `community/inboxes/agent-7/`

## Message Format
To request a code review, hand off a spec, or alert an agent:
1. Drop a markdown file into `community/inboxes/<target_agent>/<YYYYMMDD_HHMM_subject>.md`.
2. Include frontmatter:
   ```yaml
   from: "@Astra"
   to: "@Iris"
   priority: "HIGH"
   type: "REVIEW_REQUEST" | "SPEC_HANDOFF" | "BLOCKER_ALERT"
   related_task: "TASK-005"
   ```
3. Once processed, the receiving agent moves the message to their `archive/` subfolder or deletes it.
