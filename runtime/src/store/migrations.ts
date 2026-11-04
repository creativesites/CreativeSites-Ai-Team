// Ordered schema migrations. Never edit one that has shipped; add the next version.

import { AGENT_TOOLS_SQL } from '../agent-tools/schema.ts';
import { LEDGER_SQL, TIMESHEETS_SQL } from '../ledger/schema.ts';
import { SCHEDULER_SQL } from '../scheduler/schema.ts';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /**
   * Run with foreign-key enforcement off (SQLite's documented table-rebuild procedure).
   * Needed when a table that other tables reference must be rebuilt: dropping it with
   * enforcement on would cascade-delete the children. `migrate` checks that the
   * rebuild introduced no new foreign-key violations.
   */
  foreignKeysOff?: boolean;
}

// Evidence classes match src/provenance.js. The UI shows OBSERVED as Observed,
// DECLARED/ATTESTED as Claimed, VERIFIED as Verified and UNKNOWN as Unknown.
const EVIDENCE_CLASSES = `'OBSERVED','DECLARED','ATTESTED','VERIFIED','UNKNOWN'`;

const EVIDENCE_KINDS = `'command','diff','file','test','message','review','browser','deploy','db_read','db_write','api','approval','artifact'`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'core records',
    sql: `
      CREATE TABLE identities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        runtime TEXT,
        avatar_mark TEXT,
        avatar_color TEXT,
        seats TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        repo_path TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE members (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('human','agent')),
        PRIMARY KEY (room_id, member_id)
      );

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        title TEXT NOT NULL,
        brief TEXT NOT NULL DEFAULT '',
        stage TEXT NOT NULL DEFAULT 'brief'
          CHECK (stage IN ('brief','plan','build','verify','approve','done','cancelled')),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL,
        author_kind TEXT NOT NULL CHECK (author_kind IN ('human','agent','system')),
        body TEXT NOT NULL,
        job_id TEXT REFERENCES jobs(id),
        created_at TEXT NOT NULL
      );
      CREATE INDEX messages_room ON messages(room_id, created_at);

      CREATE TABLE criteria (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        assignee_id TEXT,
        check_command TEXT,
        gate TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','running','done','failed','blocked')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT REFERENCES tasks(id),
        runtime_command TEXT NOT NULL,
        pid INTEGER,
        worktree TEXT,
        state TEXT NOT NULL CHECK (state IN ('starting','running','idle','stopped','failed')),
        last_seen_at TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT
      );

      CREATE TABLE transcript_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE evidence (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES jobs(id),
        task_id TEXT REFERENCES tasks(id),
        session_id TEXT REFERENCES sessions(id),
        criterion_id TEXT REFERENCES criteria(id),
        kind TEXT NOT NULL CHECK (kind IN ('command','diff','file','test','message','review')),
        class TEXT NOT NULL CHECK (class IN (${EVIDENCE_CLASSES})),
        summary TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        hash TEXT,
        recorded_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX evidence_job ON evidence(job_id, created_at);

      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        consequence TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
        requested_by TEXT NOT NULL,
        decided_by TEXT,
        decided_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE councils (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('quick','full')),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE council_cards (
        id TEXT PRIMARY KEY,
        council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
        round INTEGER NOT NULL,
        seat TEXT NOT NULL,
        identity_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE verdicts (
        id TEXT PRIMARY KEY,
        council_id TEXT NOT NULL UNIQUE REFERENCES councils(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        score REAL,
        spread REAL,
        confidence REAL,
        support REAL,
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        subject_id TEXT,
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'phase 1 foundation: projects, teams, lifecycle, approvals, evidence ledger, sessions',
    // Additive where possible. Two tables are rebuilt because SQLite cannot widen
    // an existing CHECK constraint (approvals.status, evidence.kind); no FKs point
    // at them, so the rename/copy/drop is safe and preserves rows.
    sql: `
      -- identities: team/lane/provenance/rights, carried over from the v1 registry
      ALTER TABLE identities ADD COLUMN team_id TEXT;
      ALTER TABLE identities ADD COLUMN lane TEXT;
      ALTER TABLE identities ADD COLUMN symbol TEXT;
      ALTER TABLE identities ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE identities ADD COLUMN provenance TEXT NOT NULL DEFAULT 'DECLARED';
      ALTER TABLE identities ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE identities ADD COLUMN approval_level TEXT NOT NULL DEFAULT 'member';
      ALTER TABLE identities ADD COLUMN adapter_id TEXT;
      ALTER TABLE identities ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE team_members (
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TEXT NOT NULL,
        PRIMARY KEY (team_id, identity_id)
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        slug TEXT,
        description TEXT,
        root_path TEXT,
        default_branch TEXT,
        team_id TEXT REFERENCES teams(id),
        settings TEXT NOT NULL DEFAULT '{}',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE repos (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        path TEXT,
        remote_url TEXT,
        default_branch TEXT,
        vcs TEXT NOT NULL DEFAULT 'git',
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX repos_project_path ON repos(project_id, path);

      ALTER TABLE rooms ADD COLUMN project_id TEXT REFERENCES projects(id);
      ALTER TABLE rooms ADD COLUMN team_id TEXT REFERENCES teams(id);
      ALTER TABLE rooms ADD COLUMN kind TEXT NOT NULL DEFAULT 'project';
      ALTER TABLE rooms ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
      ALTER TABLE members ADD COLUMN joined_at TEXT;

      -- jobs: plan, risk, budgets, timing, the board columns the UI needs
      ALTER TABLE jobs ADD COLUMN project_id TEXT REFERENCES projects(id);
      ALTER TABLE jobs ADD COLUMN plan TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE jobs ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
      ALTER TABLE jobs ADD COLUMN risk TEXT NOT NULL DEFAULT 'low';
      ALTER TABLE jobs ADD COLUMN budget_cents INTEGER;
      ALTER TABLE jobs ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE jobs ADD COLUMN started_at TEXT;
      ALTER TABLE jobs ADD COLUMN ended_at TEXT;
      ALTER TABLE jobs ADD COLUMN blocked_reason TEXT;
      ALTER TABLE jobs ADD COLUMN stage_note TEXT;
      ALTER TABLE jobs ADD COLUMN base_sha TEXT;
      ALTER TABLE jobs ADD COLUMN ship_sha TEXT;
      ALTER TABLE jobs ADD COLUMN owner_id TEXT;

      CREATE TABLE job_stage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        from_stage TEXT,
        to_stage TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_kind TEXT NOT NULL DEFAULT 'human',
        note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX job_stage_history_job ON job_stage_history(job_id, id);

      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN plan_task_id TEXT;
      ALTER TABLE tasks ADD COLUMN mode TEXT NOT NULL DEFAULT 'build';
      ALTER TABLE tasks ADD COLUMN started_at TEXT;
      ALTER TABLE tasks ADD COLUMN ended_at TEXT;
      ALTER TABLE tasks ADD COLUMN updated_at TEXT;
      ALTER TABLE tasks ADD COLUMN evidence_required INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE task_criteria (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        criterion_id TEXT NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, criterion_id)
      );

      -- sessions: ACP identity, worktree/base, cancellation, liveness
      ALTER TABLE sessions ADD COLUMN acp_session_id TEXT;
      ALTER TABLE sessions ADD COLUMN adapter_id TEXT;
      ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'build';
      ALTER TABLE sessions ADD COLUMN base_sha TEXT;
      ALTER TABLE sessions ADD COLUMN base_branch TEXT;
      ALTER TABLE sessions ADD COLUMN exit_code INTEGER;
      ALTER TABLE sessions ADD COLUMN error TEXT;
      ALTER TABLE sessions ADD COLUMN cancel_requested_at TEXT;
      ALTER TABLE sessions ADD COLUMN last_event_at TEXT;
      ALTER TABLE sessions ADD COLUMN model TEXT;
      ALTER TABLE sessions ADD COLUMN turn_count INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE transcript_entries ADD COLUMN seq INTEGER;
      ALTER TABLE transcript_entries ADD COLUMN turn_id TEXT;
      ALTER TABLE transcript_entries ADD COLUMN item_id TEXT;
      ALTER TABLE transcript_entries ADD COLUMN role TEXT;
      ALTER TABLE transcript_entries ADD COLUMN title TEXT;
      CREATE INDEX transcript_session ON transcript_entries(session_id, seq);

      CREATE TABLE worktrees (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id),
        session_id TEXT,
        path TEXT NOT NULL,
        branch TEXT,
        base_sha TEXT,
        state TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        cleaned_at TEXT
      );

      -- evidence: wider kinds + chain + provenance fields. Rebuilt for the CHECK.
      ALTER TABLE evidence RENAME TO evidence_v1;
      DROP INDEX IF EXISTS evidence_job;
      CREATE TABLE evidence (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES jobs(id),
        task_id TEXT REFERENCES tasks(id),
        session_id TEXT REFERENCES sessions(id),
        criterion_id TEXT REFERENCES criteria(id),
        kind TEXT NOT NULL CHECK (kind IN (${EVIDENCE_KINDS})),
        class TEXT NOT NULL CHECK (class IN (${EVIDENCE_CLASSES})),
        summary TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        hash TEXT,
        prev_hash TEXT,
        content_hash TEXT,
        artifact_refs TEXT NOT NULL DEFAULT '[]',
        command TEXT,
        exit_code INTEGER,
        commit_sha TEXT,
        worktree TEXT,
        verified_by TEXT,
        verified_at TEXT,
        supersedes TEXT,
        recorded_by TEXT NOT NULL,
        recorded_by_kind TEXT NOT NULL DEFAULT 'system',
        created_at TEXT NOT NULL
      );
      INSERT INTO evidence (
        id, job_id, task_id, session_id, criterion_id, kind, class, summary, payload, hash,
        content_hash, recorded_by, created_at
      )
        SELECT id, job_id, task_id, session_id, criterion_id, kind, class, summary, payload, hash,
          hash, recorded_by, created_at
        FROM evidence_v1;
      DROP TABLE evidence_v1;
      CREATE INDEX evidence_job ON evidence(job_id, created_at);
      CREATE INDEX evidence_task ON evidence(task_id, created_at);
      CREATE INDEX evidence_criterion ON evidence(criterion_id, created_at);

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        mime TEXT,
        bytes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      -- approvals: policy assignment, escalation, expiry, execution and audit
      ALTER TABLE approvals RENAME TO approvals_v1;
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        consequence TEXT NOT NULL,
        action_type TEXT NOT NULL DEFAULT 'action',
        action TEXT NOT NULL DEFAULT '{}',
        risk TEXT NOT NULL DEFAULT 'low',
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','declined','expired','escalated')),
        requested_by TEXT NOT NULL,
        requested_kind TEXT NOT NULL DEFAULT 'agent',
        assigned_to TEXT,
        assigned_kind TEXT,
        escalate_to TEXT,
        escalated_at TEXT,
        expires_at TEXT,
        policy_id TEXT,
        decided_by TEXT,
        decided_by_kind TEXT,
        decided_at TEXT,
        note TEXT,
        executed_at TEXT,
        execution TEXT,
        session_id TEXT,
        task_id TEXT,
        request_id TEXT,
        reversible INTEGER,
        created_at TEXT NOT NULL
      );
      INSERT INTO approvals (
        id, job_id, title, consequence, status, requested_by, decided_by, decided_at, created_at
      )
        SELECT id, job_id, title, consequence, status, requested_by, decided_by, decided_at, created_at
        FROM approvals_v1;
      DROP TABLE approvals_v1;
      CREATE INDEX approvals_status ON approvals(status, created_at);
      CREATE INDEX approvals_job ON approvals(job_id, created_at);
      CREATE UNIQUE INDEX approvals_request ON approvals(request_id) WHERE request_id IS NOT NULL;

      CREATE TABLE approval_policies (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('global','project','room')),
        project_id TEXT,
        room_id TEXT,
        action_type TEXT NOT NULL,
        max_risk_for_lead TEXT NOT NULL DEFAULT 'medium',
        lead_id TEXT,
        escalate_to TEXT,
        timeout_minutes INTEGER NOT NULL DEFAULT 120,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('global','project')),
        project_id TEXT,
        period TEXT NOT NULL CHECK (period IN ('job','day','month')),
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX budgets_unique ON budgets(scope, COALESCE(project_id, ''), period);

      CREATE TABLE usage (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        session_id TEXT,
        model TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_cents INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX usage_job ON usage(job_id, created_at);

      CREATE TABLE adapters (
        id TEXT PRIMARY KEY,
        command TEXT,
        args TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        abilities TEXT NOT NULL DEFAULT '{}',
        last_probe_at TEXT,
        last_probe_ok INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE idempotency_keys (
        key TEXT PRIMARY KEY,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- councils/verdicts: seats and the plan the verdict produces
      ALTER TABLE councils ADD COLUMN seat_config TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE councils ADD COLUMN started_at TEXT;
      ALTER TABLE councils ADD COLUMN ended_at TEXT;
      ALTER TABLE councils ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE verdicts ADD COLUMN plan TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE verdicts ADD COLUMN artifact_id TEXT;

      -- events: actor + hash chain. Append-only is enforced by triggers below.
      ALTER TABLE events ADD COLUMN actor_id TEXT;
      ALTER TABLE events ADD COLUMN actor_kind TEXT;
      ALTER TABLE events ADD COLUMN subject_type TEXT;
      ALTER TABLE events ADD COLUMN hash TEXT;
      ALTER TABLE events ADD COLUMN prev_hash TEXT;
      CREATE INDEX events_subject ON events(subject_id, seq);
      CREATE INDEX events_type ON events(type, seq);

      CREATE TRIGGER events_append_only_update BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
      CREATE TRIGGER events_append_only_delete BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
      CREATE TRIGGER evidence_append_only_update BEFORE UPDATE ON evidence
        BEGIN SELECT RAISE(ABORT, 'evidence is append-only'); END;
      CREATE TRIGGER evidence_append_only_delete BEFORE DELETE ON evidence
        BEGIN SELECT RAISE(ABORT, 'evidence is append-only'); END;
    `,
  },
  {
    version: 3,
    name: 'bridge ingest ledger',
    sql: `
      CREATE TABLE bridge_ingest (
        source_path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        job_id TEXT,
        message_id TEXT,
        evidence_id TEXT,
        imported_at TEXT NOT NULL
      );
      CREATE INDEX bridge_ingest_job ON bridge_ingest(job_id, imported_at);
    `,
  },
  {
    version: 4,
    name: 'roast room council multi-round state',
    sql: `
      ALTER TABLE councils ADD COLUMN title TEXT;
      ALTER TABLE councils ADD COLUMN decision TEXT;
      ALTER TABLE councils ADD COLUMN brief TEXT;
      ALTER TABLE councils ADD COLUMN assumptions TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE councils ADD COLUMN cruxes TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE councils ADD COLUMN draft TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE councils ADD COLUMN events TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE councils ADD COLUMN session_dir TEXT;
    `,
  },
  {
    version: 5,
    name: 'autonomous wake, schedules, rate limits, and phase 2 ship actions',
    sql: `
      -- identities: active session tracking and rate-limit / session-limit awareness
      ALTER TABLE identities ADD COLUMN active_session_id TEXT;
      ALTER TABLE identities ADD COLUMN acp_session_id TEXT;
      ALTER TABLE identities ADD COLUMN status_state TEXT NOT NULL DEFAULT 'idle';
      ALTER TABLE identities ADD COLUMN rate_limit_reset_at TEXT;
      ALTER TABLE identities ADD COLUMN rate_limit_reason TEXT;
      ALTER TABLE identities ADD COLUMN last_woken_at TEXT;

      -- adapters: cross-agent rate-limit / session-limit awareness
      ALTER TABLE adapters ADD COLUMN rate_limit_reset_at TEXT;
      ALTER TABLE adapters ADD COLUMN rate_limit_reason TEXT;

      -- jobs: Phase 2 non-code job kinds and ship action state
      ALTER TABLE jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'code';
      ALTER TABLE jobs ADD COLUMN ship_status TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE jobs ADD COLUMN ship_payload TEXT NOT NULL DEFAULT '{}';

      -- sessions: bind directly to job_id and room_id as well as task_id so room/team-leader wakes work without requiring a task
      ALTER TABLE sessions ADD COLUMN job_id TEXT;
      ALTER TABLE sessions ADD COLUMN room_id TEXT;

      -- agent_wakes: audit & queue for agent-to-agent and human-to-agent wakeups
      CREATE TABLE agent_wakes (
        id TEXT PRIMARY KEY,
        target_agent_id TEXT NOT NULL,
        from_actor_id TEXT NOT NULL,
        from_actor_kind TEXT NOT NULL DEFAULT 'agent',
        job_id TEXT,
        room_id TEXT,
        task_id TEXT,
        session_id TEXT,
        adapter_id TEXT,
        reason TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','dispatched','deferred_rate_limit','completed','failed')),
        scheduled_for TEXT,
        created_at TEXT NOT NULL,
        dispatched_at TEXT,
        completed_at TEXT,
        error TEXT
      );
      CREATE INDEX agent_wakes_target ON agent_wakes(target_agent_id, created_at DESC);
      CREATE INDEX agent_wakes_status ON agent_wakes(status, scheduled_for);

      -- agent_schedules: cron & one-shot self-wake and cross-agent timers
      CREATE TABLE agent_schedules (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_by_kind TEXT NOT NULL DEFAULT 'agent',
        job_id TEXT,
        room_id TEXT,
        task_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('timer','cron','interval')),
        cron_expr TEXT,
        interval_seconds INTEGER,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        prompt TEXT NOT NULL,
        reason TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        max_runs INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX agent_schedules_due ON agent_schedules(enabled, next_run_at);
    `,
  },
  {
    version: 6,
    name: 'session baton relay and design studio canvas',
    sql: `
      -- sessions: role session baton relay (generation, lineage, context token tracking, and baton capsule)
      ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
      ALTER TABLE sessions ADD COLUMN superseded_by_session_id TEXT;
      ALTER TABLE sessions ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE sessions ADD COLUMN context_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN baton_capsule TEXT;

      -- design_boards: infinite canvas boards for greenfield features or codebase UI extraction
      CREATE TABLE design_boards (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        job_id TEXT,
        room_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        mode TEXT NOT NULL DEFAULT 'greenfield' CHECK (mode IN ('greenfield','extracted','hybrid')),
        viewport_x REAL NOT NULL DEFAULT 0,
        viewport_y REAL NOT NULL DEFAULT 0,
        viewport_zoom REAL NOT NULL DEFAULT 0.85,
        design_tokens_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL DEFAULT 'winston',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX design_boards_project ON design_boards(project_id, updated_at DESC);
      CREATE INDEX design_boards_job ON design_boards(job_id, updated_at DESC);

      -- design_frames: individual phone/tablet/desktop UI frames positioned on a 2D board
      CREATE TABLE design_frames (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES design_boards(id) ON DELETE CASCADE,
        parent_frame_id TEXT,
        title TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        device TEXT NOT NULL DEFAULT 'phone' CHECK (device IN ('phone','tablet','desktop','custom')),
        width INTEGER NOT NULL DEFAULT 393,
        height INTEGER NOT NULL DEFAULT 852,
        x REAL NOT NULL DEFAULT 80,
        y REAL NOT NULL DEFAULT 80,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','iterating','approved','archived')),
        source_files_json TEXT NOT NULL DEFAULT '[]',
        html_path TEXT,
        html_content TEXT NOT NULL DEFAULT '',
        notes TEXT,
        author_id TEXT NOT NULL DEFAULT 'atlas',
        approved_by TEXT,
        approved_at TEXT,
        evidence_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX design_frames_board ON design_frames(board_id, created_at ASC);

      -- design_frame_versions: in-place version history (v1 -> v2 -> v3) per frame
      CREATE TABLE design_frame_versions (
        id TEXT PRIMARY KEY,
        frame_id TEXT NOT NULL REFERENCES design_frames(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        html_content TEXT NOT NULL,
        notes TEXT,
        author_id TEXT NOT NULL DEFAULT 'atlas',
        created_at TEXT NOT NULL
      );
      CREATE INDEX design_frame_versions_frame ON design_frame_versions(frame_id, version DESC);
    `,
  },
  {
    version: 7,
    name: '007_communication_hub',
    sql: `
      -- threads: collaborative multi-agent discussion topics
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author_identities TEXT DEFAULT '[]',
        target_identities TEXT DEFAULT '[]',
        status TEXT DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
        related_task_id TEXT,
        related_project_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        original_file_path TEXT
      );

      -- thread_messages: message history within a discussion thread
      CREATE TABLE IF NOT EXISTS thread_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        from_identity TEXT,
        to_identity TEXT,
        msg_type TEXT NOT NULL DEFAULT 'COORDINATION',
        priority TEXT DEFAULT 'normal',
        subject TEXT,
        body TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id, ts ASC);

      -- inbox_messages: direct communication messages addressed to an agent
      CREATE TABLE IF NOT EXISTS inbox_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT,
        from_identity TEXT,
        to_identity TEXT NOT NULL,
        msg_type TEXT NOT NULL DEFAULT 'COORDINATION',
        priority TEXT DEFAULT 'normal',
        subject TEXT,
        body TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_messages_to ON inbox_messages(to_identity, ts DESC);

      -- announcements: broadcast directives and mandates
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author_identity TEXT,
        content TEXT NOT NULL,
        audience TEXT DEFAULT 'all',
        ts TEXT NOT NULL,
        original_file_path TEXT
      );

      -- social_posts: team channels microblog/watercooler
      CREATE TABLE IF NOT EXISTS social_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        author_identity TEXT,
        content TEXT NOT NULL,
        ts TEXT NOT NULL,
        original_file_path TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_social_posts_channel ON social_posts(channel, ts DESC);

      -- standups: daily roll-call and task commitments
      CREATE TABLE IF NOT EXISTS standups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        standup_date TEXT NOT NULL,
        facilitator TEXT,
        present_identities TEXT DEFAULT '[]',
        absent_identities TEXT DEFAULT '[]',
        content TEXT,
        parsed_updates TEXT DEFAULT '{}',
        ts TEXT NOT NULL,
        original_file_path TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_standups_date ON standups(standup_date DESC);
    `,
  },
  {
    version: 8,
    name: '008_strategic_okrs',
    sql: `
      -- okr_objectives: high-level quarterly strategic objectives
      CREATE TABLE IF NOT EXISTS okr_objectives (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        owner_id TEXT,
        quarter TEXT NOT NULL DEFAULT 'Q4-2026',
        progress_percent INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'behind', 'completed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_okr_obj_quarter ON okr_objectives(quarter);

      -- okr_key_results: quantified telemetry-linked measurable results
      CREATE TABLE IF NOT EXISTS okr_key_results (
        id TEXT PRIMARY KEY,
        objective_id TEXT NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        metric_type TEXT NOT NULL DEFAULT 'percentage' CHECK (metric_type IN ('percentage', 'numeric', 'boolean', 'binary')),
        current_value REAL NOT NULL DEFAULT 0.0,
        target_value REAL NOT NULL DEFAULT 100.0,
        unit TEXT DEFAULT '%',
        progress_percent INTEGER NOT NULL DEFAULT 0,
        telemetry_query TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_okr_kr_obj ON okr_key_results(objective_id);
    `,
  },
  {
    version: 9,
    name: '009_project_management_board',
    sql: `
      -- project_tasks: enterprise sprint engineering tasks with git/repo linking and priority
      CREATE TABLE IF NOT EXISTS project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        milestone_id TEXT,
        okr_kr_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        creator TEXT,
        assignee_id TEXT,
        required_capabilities TEXT NOT NULL DEFAULT '[]',
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        status TEXT DEFAULT 'open' CHECK (status IN ('open','claimed','in_progress','blocked','in_review','done','failed','unresolved')),
        dependencies TEXT DEFAULT '[]',
        acceptance_criteria TEXT DEFAULT '[]',
        repo TEXT,
        branch TEXT,
        artifacts TEXT DEFAULT '[]',
        original_source TEXT,
        original_file_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);

      -- milestones: project delivery milestones
      CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
        due_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL
      );

      -- project metadata extensions
      ALTER TABLE projects ADD COLUMN target_date TEXT;
      ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active';
      ALTER TABLE projects ADD COLUMN repo TEXT;
      ALTER TABLE projects ADD COLUMN updated_at TEXT;
    `,
  },
  {
    version: 10,
    name: '010_task_lifecycle_and_event_envelope',
    // WP1 (K2, K3). tasks.status carries a CHECK that SQLite cannot widen, and sessions,
    // evidence, worktrees and task_criteria reference tasks(id), so the table is rebuilt
    // with foreign keys off, preserving every row and column. Events gain the K2 envelope
    // columns plus a partial unique index on idempotency_key. Nothing is dropped except
    // the old tasks table after its rows are copied.
    foreignKeysOff: true,
    sql: `
      CREATE TABLE tasks_v10 (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        assignee_id TEXT,
        check_command TEXT,
        gate TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','assigned','acknowledged','running','needs_review','verified','done','blocked','failed','retrying','reassignment_required','needs_human')),
        created_at TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        plan_task_id TEXT,
        mode TEXT NOT NULL DEFAULT 'build',
        started_at TEXT,
        ended_at TEXT,
        updated_at TEXT,
        evidence_required INTEGER NOT NULL DEFAULT 1,
        depends_on TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        acknowledged_at TEXT,
        ack_deadline_at TEXT,
        next_retry_at TEXT,
        parent_task_id TEXT,
        required_skills TEXT NOT NULL DEFAULT '[]',
        budget_tokens INTEGER,
        verification_required INTEGER NOT NULL DEFAULT 0,
        legacy_project_task_id TEXT,
        last_event_at TEXT
      );
      INSERT INTO tasks_v10 (id, job_id, title, assignee_id, check_command, gate, status, created_at, position,
        plan_task_id, mode, started_at, ended_at, updated_at, evidence_required, last_event_at)
      SELECT id, job_id, title, assignee_id, check_command, gate, status, created_at, position,
        plan_task_id, mode, started_at, ended_at, updated_at, evidence_required,
        COALESCE(updated_at, started_at, created_at)
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_v10 RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks(job_id, position);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);

      ALTER TABLE events ADD COLUMN idempotency_key TEXT;
      ALTER TABLE events ADD COLUMN job_id TEXT;
      ALTER TABLE events ADD COLUMN task_id TEXT;
      ALTER TABLE events ADD COLUMN session_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS events_idempotency ON events(idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS events_task ON events(task_id, seq) WHERE task_id IS NOT NULL;
    `,
  },
  {
    version: 11,
    name: '011_intake_triage_departments',
    // WP2 part 1 (K5, task 2.1/2.2/2.3/2.7). Additive only; independent of v10 columns.
    sql: `
      ALTER TABLE jobs ADD COLUMN workflow TEXT CHECK (workflow IS NULL OR workflow IN ('quick','feature','strategic','incident'));
      ALTER TABLE jobs ADD COLUMN triage_reason TEXT;
      ALTER TABLE jobs ADD COLUMN urgency TEXT;
      ALTER TABLE jobs ADD COLUMN impact TEXT;
      ALTER TABLE jobs ADD COLUMN intake_id TEXT;
      ALTER TABLE jobs ADD COLUMN okr_kr_id TEXT;
      ALTER TABLE jobs ADD COLUMN milestone_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_jobs_intake ON jobs(intake_id);

      ALTER TABLE rooms ADD COLUMN intake_enabled INTEGER;

      CREATE TABLE IF NOT EXISTS intake_requests (
        id TEXT PRIMARY KEY,
        raw_text TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('home','room','design','sessions','api','agent','schedule')),
        source_ref TEXT,
        project_id TEXT,
        requested_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        job_id TEXT,
        duplicate_of_job_id TEXT,
        dedupe_reason TEXT,
        classification TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_intake_job ON intake_requests(job_id);
      CREATE INDEX IF NOT EXISTS idx_intake_project ON intake_requests(project_id);

      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        lead_identity_id TEXT,
        created_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO departments (id, name, lead_identity_id, created_at) VALUES
        ('engineering', 'Engineering', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ('platform-runtime', 'Platform & Runtime', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ('quality-verification', 'Quality & Verification', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ('design', 'Design', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ('planning-strategy', 'Planning & Strategy', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ('operations', 'Operations', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

      ALTER TABLE identities ADD COLUMN department_id TEXT;
      ALTER TABLE identities ADD COLUMN seniority TEXT NOT NULL DEFAULT 'member' CHECK (seniority IN ('exec','lead','senior','member'));
      ALTER TABLE identities ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE identities ADD COLUMN providers TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE identities ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 12,
    name: 'agent action interface: session tokens, tool-call audit, blockers (K4)',
    sql: AGENT_TOOLS_SQL,
  },
  {
    version: 13,
    name: 'subscription AI usage tracking: ai_accounts, limit snapshots, task_usage, usage_alerts (K6/K9)',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('anthropic','google')),
        plan TEXT NOT NULL,
        label TEXT NOT NULL,
        owner_scope TEXT NOT NULL DEFAULT 'personal'
          CHECK (owner_scope = 'personal' OR owner_scope LIKE 'client:%'),
        limit_model TEXT NOT NULL
          CHECK (limit_model IN ('claude_5h_weekly_pct','gemini_app_5h_weekly_pct','gemini_cli_requests_per_day')),
        daily_request_quota INTEGER,
        adapter_account_id TEXT,
        created_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS account_limit_snapshots (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL,
        session_pct REAL CHECK (session_pct IS NULL OR (session_pct >= 0 AND session_pct <= 100)),
        session_resets_at TEXT,
        weekly_pct REAL CHECK (weekly_pct IS NULL OR (weekly_pct >= 0 AND weekly_pct <= 100)),
        weekly_resets_at TEXT,
        requests_today INTEGER CHECK (requests_today IS NULL OR requests_today >= 0),
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','cli_capture','runtime_count')),
        measurement TEXT NOT NULL DEFAULT 'actual' CHECK (measurement IN ('actual','estimated')),
        note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_limit_snapshots_account ON account_limit_snapshots(account_id, captured_at);

      CREATE TABLE IF NOT EXISTS task_usage (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        job_id TEXT,
        session_id TEXT,
        account_id TEXT NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
        agent_id TEXT,
        model_id TEXT,
        task_type TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        session_pct_before REAL,
        session_pct_after REAL,
        weekly_pct_before REAL,
        weekly_pct_after REAL,
        requests INTEGER,
        concurrent_tasks_on_account INTEGER NOT NULL DEFAULT 1,
        attributed_weekly_pct REAL,
        measurement TEXT NOT NULL DEFAULT 'estimated' CHECK (measurement = 'estimated')
      );
      CREATE INDEX IF NOT EXISTS idx_task_usage_account ON task_usage(account_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_task_usage_task ON task_usage(task_id);

      CREATE TABLE IF NOT EXISTS usage_alerts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
        window_resets_at TEXT NOT NULL,
        weekly_pct REAL NOT NULL,
        elapsed_fraction REAL NOT NULL,
        created_at TEXT NOT NULL,
        acknowledged_at TEXT,
        UNIQUE (account_id, window_resets_at)
      );

      ALTER TABLE projects ADD COLUMN ai_account_id TEXT;
      ALTER TABLE projects ADD COLUMN confidential INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 16,
    name: 'workforce time ledger: activity intervals and engagements (K6, WP9)',
    sql: LEDGER_SQL,
  },
  {
    version: 17,
    name: 'recurring operations: named timezone schedules, schedule_runs, stand-up pipeline (WP6)',
    sql: SCHEDULER_SQL,
  },
  {
    version: 18,
    name: 'runtime-loaded versioned skills and per-task pinned selection (WP8)',
    sql: `
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        triggers TEXT NOT NULL DEFAULT '[]',
        workflows TEXT NOT NULL DEFAULT '[]',
        roles TEXT NOT NULL DEFAULT '[]',
        body TEXT NOT NULL DEFAULT '',
        loaded_at TEXT NOT NULL,
        PRIMARY KEY (id, content_hash)
      );

      CREATE TABLE IF NOT EXISTS task_skills (
        task_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        selected_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        PRIMARY KEY (task_id, skill_id)
      );
      CREATE INDEX IF NOT EXISTS idx_task_skills_task ON task_skills(task_id);
    `,
  },
  {
    version: 19,
    name: 'strategy linkage: KR kinds, append-only progress history, archive columns (WP7)',
    // Additive only. okr_progress_entries is append-only (triggers) and carries no foreign keys so a
    // KR, job or evidence row can be deleted without rewriting history. Legacy project_tasks is untouched.
    sql: `
      ALTER TABLE okr_key_results ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','evidence','computed'));
      ALTER TABLE okr_key_results ADD COLUMN source TEXT;
      ALTER TABLE okr_key_results ADD COLUMN weight REAL NOT NULL DEFAULT 1;
      ALTER TABLE jobs ADD COLUMN kr_weight REAL NOT NULL DEFAULT 1;
      ALTER TABLE jobs ADD COLUMN archived_at TEXT;
      ALTER TABLE tasks ADD COLUMN archived_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_jobs_kr ON jobs(okr_kr_id);

      CREATE TABLE IF NOT EXISTS okr_progress_entries (
        id TEXT PRIMARY KEY,
        key_result_id TEXT NOT NULL,
        value REAL,
        progress_percent REAL,
        provenance TEXT NOT NULL CHECK (provenance IN ('manual','agent_reported','runtime_observed','verified')),
        job_id TEXT,
        evidence_id TEXT,
        recorded_by TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_okr_entries_kr ON okr_progress_entries(key_result_id, recorded_at);
      CREATE TRIGGER okr_progress_entries_no_update BEFORE UPDATE ON okr_progress_entries
      BEGIN SELECT RAISE(ABORT, 'okr_progress_entries is append-only'); END;
      CREATE TRIGGER okr_progress_entries_no_delete BEFORE DELETE ON okr_progress_entries
      BEGIN SELECT RAISE(ABORT, 'okr_progress_entries is append-only'); END;
    `,
  },
  {
    version: 21,
    name: 'usage v2: token breakdown + measurement, model registry, budgets as limit shares, renewal policy (K6/K7, WP10)',
    sql: `
      -- 10.1 usage rows carry attribution, a token breakdown and how well each number is known.
      ALTER TABLE usage ADD COLUMN agent_id TEXT;
      ALTER TABLE usage ADD COLUMN task_id TEXT;
      ALTER TABLE usage ADD COLUMN provider TEXT;
      ALTER TABLE usage ADD COLUMN model_id TEXT;
      ALTER TABLE usage ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage ADD COLUMN measurement TEXT NOT NULL DEFAULT 'actual'
        CHECK (measurement IN ('actual','estimated','unavailable'));
      ALTER TABLE usage ADD COLUMN context_used INTEGER;
      ALTER TABLE usage ADD COLUMN context_size INTEGER;
      CREATE INDEX IF NOT EXISTS usage_agent ON usage(agent_id);
      CREATE INDEX IF NOT EXISTS usage_task ON usage(task_id);
      CREATE INDEX IF NOT EXISTS usage_session ON usage(session_id);

      -- sessions: the real model id, the context window (null = unknown), and K7 renewal state.
      ALTER TABLE sessions ADD COLUMN context_window INTEGER;
      ALTER TABLE sessions ADD COLUMN model_id TEXT;
      ALTER TABLE sessions ADD COLUMN context_band TEXT;
      ALTER TABLE sessions ADD COLUMN continuation_package TEXT;

      -- K7: per-identity override of the renewal thresholds (JSON, e.g. {"renew":80}).
      ALTER TABLE identities ADD COLUMN renewal_policy TEXT;

      -- Model registry. No prices: the team is on subscription plans. context_window is null when unknown.
      CREATE TABLE IF NOT EXISTS model_registry (
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        context_window INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider, model_id)
      );
      INSERT OR IGNORE INTO model_registry (provider, model_id, context_window, notes, updated_at) VALUES
        ('anthropic', 'claude-sonnet-4-5', 200000, 'published context window; edit if your plan differs', '2026-11-03T00:00:00.000Z'),
        ('anthropic', 'claude-opus-4-1', 200000, 'published context window; edit if your plan differs', '2026-11-03T00:00:00.000Z'),
        ('google', 'gemini-2.5-pro', 1048576, 'published context window; edit if your plan differs', '2026-11-03T00:00:00.000Z'),
        ('google', 'gemini-2.5-flash', 1048576, 'published context window; edit if your plan differs', '2026-11-03T00:00:00.000Z');

      -- 10.4 budgets: a share of an account's limit (or a token count), not money. Rebuilt because
      -- SQLite cannot widen a CHECK; existing money budgets are copied unchanged (kind 'money').
      CREATE TABLE budgets_v21 (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('global','project','agent','task','department','session')),
        project_id TEXT,
        scope_id TEXT,
        period TEXT NOT NULL CHECK (period IN ('job','day','week','month','session')),
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        kind TEXT NOT NULL DEFAULT 'money' CHECK (kind IN ('money','tokens','weekly_pct','session_pct','requests_per_day')),
        amount REAL,
        account_id TEXT,
        warn_pct REAL NOT NULL DEFAULT 80,
        hard_pct REAL NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO budgets_v21 (id, scope, project_id, period, amount_cents, currency, created_at, updated_at)
        SELECT id, scope, project_id, period, amount_cents, currency, created_at, updated_at FROM budgets;
      DROP TABLE budgets;
      ALTER TABLE budgets_v21 RENAME TO budgets;
      CREATE UNIQUE INDEX budgets_unique ON budgets(
        scope, COALESCE(project_id, ''), COALESCE(scope_id, ''), kind, COALESCE(account_id, ''), period);

      -- Warnings fire once per budget per period; overrides are one-time grants from an approval.
      CREATE TABLE IF NOT EXISTS budget_alerts (
        budget_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('warn','hard')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (budget_id, period_key, level)
      );
      CREATE TABLE IF NOT EXISTS budget_overrides (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        approval_id TEXT,
        granted_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_budget_overrides_budget ON budget_overrides(budget_id, period_key, scope_key);
    `,
  },
  {
    version: 22,
    name: 'timesheets with reconciliation hash (WP9 9.6)',
    sql: TIMESHEETS_SQL,
  },
];
