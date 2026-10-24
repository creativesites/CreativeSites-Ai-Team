const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * One place that decides where machine-specific files live.
 *
 * Mirrors desktop/src-tauri/src/system/config.rs: environment variables first,
 * then ~/.myaos/config.json (or $MYAOS_CONFIG), then this repository. Nothing
 * here may fall back to one person's home directory.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'data', 'myaos.schema.sql');

function expandHome(p) {
  if (typeof p === 'string' && p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function envPath(name) {
  const v = process.env[name];
  return v && v.trim() ? expandHome(v.trim()) : null;
}

function configPath() {
  return envPath('MYAOS_CONFIG') || path.join(os.homedir(), '.myaos', 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[MyaOS] Ignoring unreadable config ${configPath()}: ${e.message}`);
    return {};
  }
}

/** The team repo: $MYAOS_TEAM_REPO, then config, then this checkout. */
function teamRepo() {
  return envPath('MYAOS_TEAM_REPO') || expandHome(loadConfig().teamRepo) || REPO_ROOT;
}

/**
 * The SQLite store. $MYAOS_DB_PATH wins. A caller with its own baseDir (tests,
 * temp workspaces) gets <baseDir>/data/myaos.db so it never touches the team's
 * store. Otherwise config, then <team repo>/data/myaos.db.
 */
function dbPath(baseDir) {
  const fromEnv = envPath('MYAOS_DB_PATH');
  if (fromEnv) return fromEnv;
  if (baseDir && path.resolve(baseDir) !== REPO_ROOT) return path.join(path.resolve(baseDir), 'data', 'myaos.db');
  return expandHome(loadConfig().dbPath) || path.join(teamRepo(), 'data', 'myaos.db');
}

/**
 * Creates an empty store from data/myaos.schema.sql when none exists yet.
 * The store is not in git, so a fresh clone starts here.
 */
function ensureDb(p = dbPath()) {
  if (fs.existsSync(p)) return p;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (fs.existsSync(SCHEMA_FILE)) {
    execFileSync('sqlite3', [p], { input: fs.readFileSync(SCHEMA_FILE, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] });
  }
  return p;
}

module.exports = { REPO_ROOT, SCHEMA_FILE, configPath, loadConfig, teamRepo, dbPath, ensureDb, expandHome };
