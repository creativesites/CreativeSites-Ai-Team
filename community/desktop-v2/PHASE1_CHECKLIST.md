# Phase 1 close-out checklist (the first real job from the app)

> Run this from the MyaOS Desktop window. If the runtime was running before the latest commits,
> quit the window and start it again so the runtime process loads the current code.

## Prerequisites

- `~/.myaos/adapters.env` has no invalid keys (Gemini shows "Needs login" until a valid key is set).
- Claude Code is signed in (`claude auth status`); Codex optional (`codex login status`).
- Workspaces screen shows the imported projects (Myavana, MeetingMind, DogForce, DeployFleet).

## The flow

1. **Workspaces** (`#/workspaces`)
   - Confirm a project has a repo and a live branch/dirty state.
   - Attach an existing folder or create a room for a project if needed.
   - Expect unknown (not green) when a path cannot be inspected.

2. **Home** (`#/home`)
   - Write the brief: the outcome, what done means, constraints.
   - Choose the project room (or create a room bound to a project).
   - Start the job. It opens as JOB-N with stage **Brief**.

3. **Job** (`#/jobs/<id>`)
   - Add criteria under "Done means".
   - Start planning; write the plan summary and accept it.
   - Add tasks with a check command and an assignee.
   - Start build.
   - Run builder: pick the task, an agent (Atlas etc.) and a ready adapter (Claude/Codex).
   - Watch the session state; open **Dev** for the transcript.

4. **Dev** (`#/dev/<id>`)
   - The transcript streams messages, tool calls and the commit.
   - Evidence shows the runtime's worktree snapshots; steps/diff come from the ledger.
   - The terminal tab arrives with the PTY branch merge.

5. **Build → Verify**
   - Task: Run check (the runtime runs the check itself; exit code + output become Observed).
   - Mark the task done.
   - "Verify independently": pick a different agent; the runtime re-runs checks in a clean worktree at the committed build. Passing criteria become **Verified**; the original worktree changes are not trusted.
   - Send to verify.

6. **Verify → Approve**
   - Every criterion must be Observed/Verified before the stage moves.
   - Request merge approval; the card shows the consequence, risk and reversibility.

7. **Needs you** (`#/approvals`)
   - Approve or send back with a note. The decision is recorded with actor/time/note.
   - After approval, on the Job screen use "Mark done" (no pending approvals).

8. **Evidence**
   - Job screen shows the committed SHA, check evidence, verification, approval and stage history.
   - The job dossier is mirrored to `community/threads/desktop/JOB-N-*.md` when the bridge is enabled;
     replies below the marker and inbox notes are imported as Claimed.

## Known Phase 1 limits (honest)

- Terminal is in review (PTY branch); until merged, use the OS terminal or the Job/Dev views.
- Council/Verdict remains a later phase (the engine is ready; screens are preview-only).
- Work/Dev is still a navigation mode, not a full detail-level toggle on the same route.
- Approval notifications are in-app only (no macOS notification yet).
- Gemini needs a valid key; DeepSeek Harness is not an ACP agent.

## Pass criteria

One real fix in a Myavana repo goes Brief → Plan → Build (builder agent) → Verify (different agent) →
Approve (you) → Done, with every step visible in evidence, no fake data, and no disabled control
for an implemented path.
