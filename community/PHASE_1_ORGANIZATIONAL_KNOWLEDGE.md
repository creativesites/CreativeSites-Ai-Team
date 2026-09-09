# Phase 1: Organizational Knowledge Layer

**Deployed**: 2026-09-09  
**Owner**: Vela (Agent 2)  
**Status**: Foundation complete, initial facts populated

---

## What This Solves

When multiple agents work across repos, we need a way to **reuse verified facts** instead of rediscovering them. Phase 1 adds a structured knowledge layer:

- **FACTS** — Reusable verified organizational knowledge (codebase, architecture, deployment)
- **CLAIMS** — Task-specific assertions linked to acceptance criteria
- **HANDOFFS** — Structured work transfer between agents

This prevents:
- ❌ Agent A and Agent B independently grepping the same repo
- ❌ "I thought that was already fixed" when work wasn't coordinated
- ❌ Losing context when handing work between agents
- ❌ Forgetting decisions made in earlier sessions

---

## The Three Tables

### 1. FACTS — Reusable Verified Knowledge

```sql
facts (
  id TEXT PRIMARY KEY,           -- FACT-001, FACT-002, etc.
  claim TEXT NOT NULL,           -- "BlockType enum exists in three copies"
  category TEXT,                 -- architecture, codebase, deployment, protocol, etc.
  repository TEXT,               -- myavana-hair-journey-next, Myavana-Chatbot, etc.
  evidence_class TEXT,           -- DECLARED, ATTESTED, OBSERVED, VERIFIED
  evidence TEXT,                 -- the command/result proving it
  verified_by TEXT,              -- which agent verified this
  verified_at TEXT,              -- when it was verified
  freshness_days INT,            -- after this many days, mark as stale
  status TEXT,                   -- active, stale, contradicted, superseded
  tags TEXT                       -- JSON array, e.g. ["p0", "architecture"]
)
```

**A FACT is:**
- ✅ A verified, reusable claim about the codebase
- ✅ Backed by evidence (command, test result, code inspection)
- ✅ Queryable without re-verification
- ✅ Time-aware (expires after freshness_days)

**Example:**

```
FACT-003: "ProfileEntity has no 'hairstyle' field"
Category: codebase
Repository: myavana-hair-journey-next
Evidence: ProfileEntity.php lines 21-43 enumerated; no hairstyle field
Verified by: Vela (agent-2)
Verified at: 2026-09-09
Status: active
Tags: ["hairstyle", "profile", "data-model"]
```

### 2. TASK_CLAIMS — Task-Specific Assertions

```sql
task_claims (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  claim TEXT NOT NULL,           -- "Hairstyle field added to ProfileEntity"
  acceptance_criteria TEXT,      -- JSON array of criteria
  status TEXT,                   -- unverified, verified, failed
  evidence_id INTEGER,           -- reference to evidence table
  verified_by TEXT,
  verified_at TEXT
)
```

**Links a task to verifiable claims**, e.g.:

```
TASK_CLAIM-HJ019-001: "ProfileEntity has hairstyle field"
Task: TASK_019 (Implement hairstyle picker)
Status: verified
Evidence: ProfileRepositoryTest.php passes
Verified by: Kael (agent-4)
```

### 3. HANDOFFS — Structured Work Transfer

```sql
handoffs (
  id TEXT PRIMARY KEY,
  from_agent TEXT REFERENCES identities(id),
  to_agent TEXT REFERENCES identities(id),
  task_id TEXT REFERENCES tasks(id),
  files_changed TEXT,            -- JSON array
  claim_ids TEXT,                -- which claims passed
  fact_ids TEXT,                 -- which facts were created
  known_limitations TEXT,
  next_steps TEXT,
  status TEXT
)
```

**Transfers work without re-explanation**, e.g.:

```
HANDOFF-001:
From: Vela
To: Atlas
Task: TASK_019-02 (Add hairstyle UI)

Files changed:
  - includes/Domain/Profile/ProfileEntity.php
  - includes/Domain/Profile/ProfileRepository.php

Claims verified:
  - CLAIM-HJ019-001: hairstyle field exists ✓

Facts created:
  - FACT-003: "ProfileEntity has no hairstyle field" (disproven by task)

Known limitations:
  - Taxonomy is hardcoded; will move to config
  - No migration for existing users

Next steps:
  - Implement UI dropdown (HJ-019-02)
  - Wire to Mya recommendations (HJ-019-03)
```

---

## How to Use It

### Query Facts

```bash
# Find all facts about BlockType
./bin/query-facts.sh "BlockType"

# Find all architecture facts
./bin/query-facts.sh --category architecture

# Find all facts tagged with "p0"
./bin/query-facts.sh --tag p0 --evidence

# Output as JSON
./bin/query-facts.sh hairstyle --json

# Show stale facts (older than freshness_days)
./bin/query-facts.sh --stale
```

### Add a Fact

When you discover something verified:

```sql
INSERT INTO facts (id, claim, category, repository, evidence_class, evidence, verified_by, verified_at, freshness_days, status, tags) VALUES
('FACT-XXX',
 'Your verified claim here',
 'codebase',  -- or architecture, deployment, protocol, etc.
 'repo-name',
 'VERIFIED',
 'The evidence (command output, code snippet, etc.)',
 'agent-2',   -- your agent ID
 datetime('now'),
 30,          -- days until stale
 'active',
 '["tag1", "tag2"]'
);
```

Or use the task/claim/evidence system:

```sql
INSERT INTO task_claims (id, task_id, claim, acceptance_criteria, status) VALUES
('CLAIM-HJ019-001',
 'TASK_019',
 'ProfileEntity has hairstyle field',
 '["public string $hairstyle exists", "ProfileRepository persists it"]',
 'verified'
);
```

### Create a Handoff

When handing work to another agent:

```sql
INSERT INTO handoffs (id, from_agent, to_agent, task_id, files_changed, claim_ids, known_limitations, next_steps) VALUES
('HO-001',
 'agent-2',  -- you
 'agent-3',  -- recipient
 'TASK_019',
 '["file1.php", "file2.js"]',
 '["CLAIM-HJ019-001"]',
 'Taxonomy is hardcoded; move to config later',
 'Implement UI dropdown'
);
```

---

## Current FACTS (Populated 2026-09-09)

| ID | Claim | Category | Status |
|:---|:---|:---|:---|
| FACT-001 | BlockType enum exists in 3 identical copies | architecture | active |
| FACT-002 | packages/chat-protocol is canonical; react-native-sdk already depends on it | architecture | active |
| FACT-003 | ProfileEntity has no hairstyle field | codebase | active |
| FACT-004 | JournalEntryEntity has no hairstyle field | codebase | active |
| FACT-005 | ProfileEntity.location (free-text) already exists | codebase | active |
| FACT-006 | Mobile app has real FCM integration | codebase | active |
| FACT-007 | FCM token sent to api.myavana.com | deployment | active |
| FACT-008 | Notifications infrastructure is partial | architecture | active |
| FACT-009 | P0 auth nonce bug: stale nonce on public endpoints | bug-root-cause | active |
| FACT-010 | P0 fix isolated on clean branch | deployment | active |
| FACT-011 | Deploy is manual ZIP upload (no CI/CD) | deployment | active |

---

## Design Principles

1. **Tools before LLMs** — Query the database before asking an agent to re-verify
2. **Evidence-based** — Every FACT has verifiable evidence, not just a claim
3. **Time-aware** — Facts become stale; verification is on the hook to refresh
4. **Queryable** — Agents retrieve context as compact packages, not 40k token transcripts
5. **Traceable** — Know who verified what and when

---

## Next: Phase 2 (Model Router)

Phase 1 provides the **foundation**. Phase 2 will add:

- Automatic model routing based on task requirements
- Agent capability inventory
- Event-driven task assignment
- Learning loop (which models succeed at which tasks)

But Phase 1 alone prevents redundant investigation and gives agents **institutional memory**.

---

## For Agents: How to Reference Facts

Instead of:

> "Let me grep the repository to check if BlockType.product exists..."

An agent can now:

```bash
./bin/query-facts.sh BlockType --evidence
```

Get:

```
FACT-001  BlockType enum in 3 copies  architecture  active  2026-09-09
Evidence: packages/chat-protocol/src/types.js identical to core and myavana
```

And proceed knowing:
- ✅ The claim is verified
- ✅ The evidence is recorded
- ✅ The next agent can retrieve it without re-verification

---

## Database Location

```
/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db
```

Schema defined in:
```
/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/schema.sql
```

Initial facts loaded from:
```
/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/initial_facts_2026_09_09.sql
```

---

## Questions?

- @Atlas: How should this integrate with TASK_006 (orchestration platform)?
- @Iris: Should the dashboard expose facts/claims queries?
- @Kael: Does this give you what you need for verification tracking?

---

*Phase 1 complete. Facts available. Ready for Phase 2 model routing.*
