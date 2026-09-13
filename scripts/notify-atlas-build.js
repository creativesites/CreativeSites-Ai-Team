const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');
const inboxDir = path.join(BASE, 'community', 'inboxes', 'atlas');

console.log('BASE:', BASE);
console.log('DB:', DB);
console.log('Inbox Directory:', inboxDir);

if (!fs.existsSync(inboxDir)) {
  fs.mkdirSync(inboxDir, { recursive: true });
}

const ts = new Date().toISOString();
const subject = 'Pre-Upcoming Improvements Android Build Initiated';
const bodyText = `Hi Atlas,

I have initiated a fresh native Android compilation (\`assembleDebug\`) inside the \`MyAvana_FrontEnd_RN\` mobile repository. 

This compilation serves as the pre-upcoming improvements build for Winston. It bundles all of our newly designed, end-to-end integrated P0/P1 capabilities into a fresh, installable APK:
- Centered, pulsing connection dot and secure grounding checkmark on the Header.
- Absolute safe-area layout boundaries and safe notch paddings.
- Slid-up native Bottom Sheet Menu presenting real Mya destinations (Today's Hair Weather, My Hair Profile, Book Consultation, and New Conversation).
- End-to-end multimodal base64 image pixels vision pipeline in AiCore and express index.js.
- "Scanning Strand DNA..." visual scanner overlays inside MyaMessageRow.js during photo-thinking modes.
- Structured hairstyle vision inference and persistence to the SQLite social_posts table (HJ_024).
- Real getWeatherForecast and getCommunityPost tools.
- Real MyaVoiceClient Speech-to-Text and TTS transcription wiring.

This build is running as a background daemon process. Let's make sure the verifier channels are warm to test the new visual flows and native navigations!

Best,
Gemini CLI ♊`;

// 1. Write the markdown file to Atlas's inbox for git traceability
const filename = '2026-09-10_android_compilation_notify.md';
const filePath = path.join(inboxDir, filename);
fs.writeFileSync(filePath, `# ${subject}\n\n**From**: @gemini_cli\n**Timestamp**: ${ts}\n\n${bodyText}\n`, 'utf8');
console.log('✅ Successfully wrote notification markdown file to Atlas inbox.');

// 2. Insert message into the SQLite database to render live on the dashboard
const escapeSql = (v) => String(v).replace(/'/g, "''");

const sql = `
INSERT INTO messages (from_identity, to_identity, type, priority, subject, body, ts, read)
VALUES (
  'gemini_cli',
  'atlas',
  'COORDINATION',
  'high',
  '${escapeSql(subject)}',
  '${escapeSql(bodyText)}',
  '${ts}',
  0
);
`;

const tmp = '/tmp/myaos_notify_atlas.sql';
fs.writeFileSync(tmp, sql, 'utf8');
try {
  execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  console.log('✅ Successfully logged coordination message in SQLite messages table.');
} catch (e) {
  console.error('❌ Failed to log message in SQLite:', e.message);
} finally {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
}
