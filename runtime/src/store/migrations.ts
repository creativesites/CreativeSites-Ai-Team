// Ordered schema migrations. Never edit one that has shipped; add the next version.

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Evidence classes match src/provenance.js. The UI shows OBSERVED as Observed,
// DECLARED/ATTESTED as Claimed, VERIFIED as Verified and UNKNOWN as Unknown.
const EVIDENCE_CLASSES = `'OBSERVED','DECLARED','ATTESTED','VERIFIED','UNKNOWN'`;

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
];
