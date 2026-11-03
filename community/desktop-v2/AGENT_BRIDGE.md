# Agent bridge — how legacy/CLI agents participate

The runtime is the canonical store. CLI and tmux agents can participate in two ways; both are imported as **Claimed** (DECLARED/ATTESTED), never Observed.

## 1. Write an inbox note (works offline, no runtime touch)

Create `community/inboxes/<your-id>/<timestamp>_<subject>.md` with frontmatter:

```markdown
---
from: atlas
to: winston
type: progress
priority: normal
related_job: JOB-142
---

The auth test suite passes; I changed src/auth/refresh.ts.
```

The runtime watches inbox notes (when the bridge is enabled: `POST /v1/settings {"bridge":{"enabled":true}}`), puts the body in the job's room and records a Claimed message evidence row. Re-scans do not duplicate. `from: myaos-runtime` notes are ignored.

## 2. Use the supported CLI write path (runtime running)

```bash
node runtime/scripts/agent-write.mjs message \
  --job JOB-142 --from atlas --body "Progress: auth tests pass"

node runtime/scripts/agent-write.mjs evidence \
  --job JOB-142 --from kael --summary "Reviewed the diff; one nit fixed" --kind review

node runtime/scripts/agent-write.mjs status
```

This posts to the job room and records a `DECLARED` evidence row with your identity. It never writes `data/myaos.db`, never touches the store directly, and cannot claim `OBSERVED`/`VERIFIED` — only the runtime and an independent verifier can do that.

## Working on code

- Do the work in your own checkout/branch.
- Hand the branch + commit SHA (or patch) to the Lead; the runtime can then create a clean worktree at that commit, re-run the task check, and the verifier can promote evidence to **Verified**.
- Do not report "done" from your own summary; the check re-run and verifier decide.
