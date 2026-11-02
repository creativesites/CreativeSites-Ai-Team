import type { Evidence, Identity, JobDetail, JobSummary, Message, Room, Session } from '@runtime/types';

// SAMPLE DATA FOR THE DEV PREVIEW ONLY (#/preview/<screen>). It mirrors the
// approved design so screens can be compared with it. It is never shown in
// the live app, and production builds do not include it.

const t = (hhmm: string) => `2026-10-24T${hhmm}:00.000Z`;

const id = (i: Partial<Identity> & Pick<Identity, 'id' | 'name'>): Identity => ({
  role: null,
  runtime: null,
  avatarMark: null,
  avatarColor: null,
  seats: [],
  createdAt: t('08:00'),
  ...i,
});

export const people = {
  atlas: id({ id: 'atlas', name: 'Atlas', role: 'Platform and backend', runtime: 'Claude Code', avatarMark: 'hex', avatarColor: 'blue', seats: ['Architect'] }),
  kael: id({ id: 'kael', name: 'Kael', role: 'QA and verification', runtime: 'Codex', avatarMark: 'shield', avatarColor: 'green', seats: ['Verifier'] }),
  sage: id({ id: 'sage', name: 'Sage', role: 'Planner and council chair', runtime: 'Claude Code', avatarMark: 'diamond', avatarColor: 'amber', seats: ['Chair'] }),
  vela: id({ id: 'vela', name: 'Vela', role: 'WordPress and data contracts', runtime: 'Claude Code', avatarMark: 'wave', avatarColor: 'violet', seats: ['WordPress specialist'] }),
  lyra: id({ id: 'lyra', name: 'Lyra', role: 'Mobile and React Native', runtime: 'Gemini CLI', avatarMark: 'arcs', avatarColor: 'rose', seats: ['Product'] }),
  iris: id({ id: 'iris', name: 'Iris', role: 'Operator console', runtime: 'Claude Code', avatarMark: 'ring', avatarColor: 'indigo', seats: ['Skeptic'] }),
  nexus: id({ id: 'nexus', name: 'Nexus', role: 'Runtime operations (unconfirmed)', runtime: null, avatarMark: 'bars', avatarColor: 'graphite', seats: ['Risk and cost'] }),
};
export const identities: Identity[] = Object.values(people);

export const rooms: Room[] = [
  { id: 'room_chat', name: 'myavana-chatbot', repoPath: '~/WebstormProjects/Myavana-Chatbot', createdAt: t('08:00'), memberCount: 5, openJobCount: 1 },
  { id: 'room_hj', name: 'hair-journey-web', repoPath: null, createdAt: t('08:00'), memberCount: 3, openJobCount: 1 },
  { id: 'room_mobile', name: 'mobile-sdk', repoPath: null, createdAt: t('08:00'), memberCount: 3, openJobCount: 2 },
];

export const sessions: Session[] = [
  { id: 's1', agentId: 'kael', taskId: 'T3', runtimeCommand: 'codex-acp', pid: 48213, worktree: '.myaos/worktrees/job-142-verify', state: 'running', lastSeenAt: t('09:52'), startedAt: t('09:40'), endedAt: null },
  { id: 's2', agentId: 'atlas', taskId: 'T2', runtimeCommand: 'claude-agent-acp', pid: 47110, worktree: '.myaos/worktrees/job-142-build', state: 'idle', lastSeenAt: t('09:44'), startedAt: t('09:15'), endedAt: null },
  { id: 's3', agentId: 'lyra', taskId: null, runtimeCommand: 'gemini --experimental-acp', pid: 46022, worktree: null, state: 'running', lastSeenAt: t('09:51'), startedAt: t('09:00'), endedAt: null },
];

const job = (j: Partial<JobSummary> & Pick<JobSummary, 'id' | 'number' | 'roomId' | 'title' | 'stage'>): JobSummary => ({
  createdBy: 'owner',
  createdAt: t('09:02'),
  updatedAt: t('09:52'),
  pendingApprovals: 0,
  ...j,
});

export const jobs: JobSummary[] = [
  job({ id: 'job_142', number: 142, roomId: 'room_chat', title: 'Fix early logout on the chatbot widget', stage: 'build' }),
  job({ id: 'job_139', number: 139, roomId: 'room_hj', title: 'Merge the profile stories contract fix', stage: 'approve', pendingApprovals: 1 }),
  job({ id: 'job_144', number: 144, roomId: 'room_mobile', title: 'Voice reconnect on dropped mobile audio', stage: 'build' }),
  job({ id: 'job_145', number: 145, roomId: 'room_mobile', title: 'Mobile SDK release plan', stage: 'brief' }),
  job({ id: 'job_131', number: 131, roomId: 'room_chat', title: 'Customer 360 sync timeout', stage: 'done' }),
];

const PATCH = `--- a/src/auth/refresh.ts
+++ b/src/auth/refresh.ts
@@ -18,7 +18,11 @@ export function scheduleRefresh(session: Session) {
-  const expiresAt = initialLogin.expiresAt;
+  const expiresAt = session.accessToken.expiresAt;
   const delay = expiresAt - Date.now() - REFRESH_MARGIN_MS;
-  timer = setTimeout(refresh, delay);
+  clearTimeout(timer);
+  timer = setTimeout(async () => {
+    const next = await refresh(session);
+    scheduleRefresh(next);
+  }, Math.max(delay, 0));
 }`;

const ev = (e: Partial<Evidence> & Pick<Evidence, 'id' | 'kind' | 'class' | 'summary' | 'recordedBy' | 'createdAt'>): Evidence => ({
  jobId: 'job_142',
  taskId: null,
  sessionId: null,
  criterionId: null,
  payload: {},
  hash: null,
  ...e,
});

export const job142: JobDetail = {
  ...jobs[0],
  brief: 'Chatbot widget logs people out after about 10 minutes. Find the root cause, fix it, test it, have someone else check it, and show me the proof before anything ships.',
  criteria: [
    { id: 'c1', text: 'A user stays signed in through 60 minutes of activity', position: 0, evidenceClass: 'DECLARED' },
    { id: 'c2', text: 'Existing auth tests pass', position: 1, evidenceClass: 'OBSERVED' },
    { id: 'c3', text: 'A regression test covers the second refresh', position: 2, evidenceClass: 'VERIFIED' },
    { id: 'c4', text: 'A second agent reviews the diff', position: 3, evidenceClass: 'UNKNOWN' },
  ],
  tasks: [],
  approvals: [],
  evidence: [
    ev({ id: 'e6', kind: 'test', class: 'VERIFIED', summary: 'npm test -- auth/refresh passes with the fix', recordedBy: 'kael', createdAt: t('09:52'), payload: { command: 'npm test -- auth/refresh', exitCode: 0 } }),
    ev({ id: 'e5', kind: 'test', class: 'VERIFIED', summary: 'npm test -- auth/refresh fails without the fix (expected)', recordedBy: 'kael', createdAt: t('09:51'), payload: { command: 'git checkout main -- src/auth/refresh.ts && npm test -- auth/refresh', exitCode: 0, output: '1 failing: refresh re-arms after the first refresh' } }),
    ev({ id: 'e4', kind: 'message', class: 'DECLARED', summary: '“Users now stay signed in”', recordedBy: 'atlas', createdAt: t('09:38') }),
    ev({ id: 'e3', kind: 'command', class: 'OBSERVED', summary: 'npm test -- auth', recordedBy: 'atlas', createdAt: t('09:36'), payload: { command: 'npm test -- auth', exitCode: 0 } }),
    ev({ id: 'e2', kind: 'diff', class: 'OBSERVED', summary: 'Edited src/auth/refresh.ts', recordedBy: 'atlas', createdAt: t('09:31'), payload: { patch: PATCH } }),
    ev({ id: 'e1', kind: 'command', class: 'OBSERVED', summary: 'npm test -- auth (2 failing)', recordedBy: 'atlas', createdAt: t('09:24'), payload: { command: 'npm test -- auth', exitCode: 1, output: '2 failing' } }),
  ],
};

export const job139: JobDetail = {
  ...jobs[1],
  brief: 'Profile stories break when the contract field is missing. Fix the contract and merge once verified.',
  criteria: [
    { id: 'd1', text: 'Stories render with and without the field', position: 0, evidenceClass: 'VERIFIED' },
    { id: 'd2', text: 'Existing tests pass', position: 1, evidenceClass: 'VERIFIED' },
  ],
  tasks: [],
  evidence: [ev({ id: 'f1', jobId: 'job_139', kind: 'review', class: 'VERIFIED', summary: 'Kael re-ran every check on a clean copy. All passed.', recordedBy: 'kael', createdAt: t('09:58') })],
  approvals: [
    { id: 'a1', jobId: 'job_139', title: 'Merge the fix into main', consequence: 'Atlas merges branch job/139-stories into main. Two files change. Nothing is deployed; deploying is its own approval. It can be undone with one revert.', status: 'pending', requestedBy: 'atlas', decidedBy: null, decidedAt: null, createdAt: t('09:59') },
  ],
};

export const messages: Message[] = [
  { id: 'm1', roomId: 'room_chat', authorId: 'owner', authorKind: 'human', body: job142.brief, jobId: 'job_142', createdAt: t('09:02') },
  { id: 'm2', roomId: 'room_chat', authorId: 'sage', authorKind: 'agent', body: 'The council met. Verdict: Go with conditions. The plan has 4 tasks. Atlas builds, Kael verifies, nothing ships without your approval.', jobId: null, createdAt: t('09:09') },
  { id: 'm3', roomId: 'room_chat', authorId: 'atlas', authorKind: 'agent', body: 'Root cause: the refresh timer is armed from the first login’s expiry. After the first refresh it never re-arms. Fixed in src/auth/refresh.ts with a regression test.\n\n@Kael over to you to verify independently.', jobId: null, createdAt: t('09:31') },
];
