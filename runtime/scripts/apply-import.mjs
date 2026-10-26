#!/usr/bin/env node
// Applies the reviewed v1 export to the v2 store: owner, identities, teams,
// projects/repos, rooms, approval policy defaults and team leads.
//
// Idempotent: identities/teams upsert by id, projects/rooms/policies are skipped
// when a same-named record already exists. Refuses to run while a runtime is up;
// stop the app (or the runtime) first so there is one writer.
//
//   node runtime/scripts/apply-import.mjs
//   node runtime/scripts/apply-import.mjs --dry-run

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, runtimeDbPath, runtimeInfoPath } from '../src/config.ts';
import { openStore } from '../src/store/db.ts';
import { Repo } from '../src/store/repo.ts';

const root = path.resolve(import.meta.dirname, '../..');
const payloadPath = path.join(root, 'community/desktop-v2/import/import-payload.json');
const projectsPath = path.join(root, 'community/desktop-v2/import/export-2026-10-26/projects.json');
const dryRun = process.argv.includes('--dry-run');

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function healthy(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(payloadPath)) throw new Error(`Missing import payload: ${payloadPath}`);
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const projectsExport = fs.existsSync(projectsPath) ? JSON.parse(fs.readFileSync(projectsPath, 'utf8')) : null;

  try {
    const info = JSON.parse(fs.readFileSync(runtimeInfoPath(), 'utf8'));
    if (info?.pid && alive(info.pid) && (await healthy(info.url))) {
      throw new Error('A runtime is running. Quit the MyaOS app (or stop the runtime) before importing.');
    }
  } catch (e) {
    if (!(e instanceof SyntaxError) && !(e?.code === 'ENOENT')) throw e;
  }

  const mapped = {
    owner: {
      id: payload.owner.id,
      name: payload.owner.name,
      role: payload.owner.role ?? payload.owner.primaryDomain ?? 'Owner',
      avatarMark: payload.owner.avatarMark ?? null,
      avatarColor: payload.owner.avatarColor ?? null,
      symbol: payload.owner.symbol ?? null,
      lane: payload.owner.lane ?? null,
      seats: payload.owner.seats ?? [],
      capabilities: payload.owner.capabilities ?? [],
      provenance: payload.owner.provenance ?? 'DECLARED',
      isOwner: true,
      approvalLevel: 'owner',
      teamId: payload.owner.team ?? null,
      teams: payload.owner.teams ?? [],
    },
    teams: payload.teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.source ? `Imported from ${team.source}` : undefined,
      members: team.members ?? [],
      leadIdentityId: team.leadIdentityId ?? null,
    })),
    identities: payload.identities.map((identity) => ({
      id: identity.id,
      name: identity.name,
      role: identity.role ?? identity.primaryDomain ?? null,
      runtime: identity.adapter ?? null,
      avatarMark: identity.avatarMark ?? null,
      avatarColor: identity.avatarColor ?? null,
      symbol: identity.symbol ?? null,
      lane: identity.lane ?? null,
      seats: identity.seats ?? [],
      capabilities: identity.capabilities ?? [],
      provenance: identity.provenance ?? 'DECLARED',
      teamId: identity.team ?? null,
      teams: identity.team ? [identity.team] : [],
      adapterId: ['claude', 'codex', 'gemini', 'dsh'].includes(identity.adapter) ? identity.adapter : null,
      isOwner: false,
      approvalLevel: identity.approvalLevel ?? 'member',
    })),
  };

  // Project groups: one project per v1 project, with every observed checkout as a repo.
  const groups = new Map();
  for (const spec of projectsExport?.projects?.repositories ?? []) {
    const dbProject = spec.dbProject;
    const key = spec.dbProjectId ?? spec.key;
    if (!key || !spec.observedPath) continue;
    const group = groups.get(key) ?? {
      name: dbProject?.title ?? dbProject?.name ?? spec.label,
      teamId: key.includes('meetingmind') ? 'meetingmind' : key.includes('deployfleet') ? 'deployfleet' : 'creativesites',
      rootPath: spec.observedPath,
      defaultBranch: spec.candidates?.find((c) => c.observed)?.git?.branch ?? null,
      repos: [],
    };
    group.repos.push({
      name: spec.label,
      path: spec.observedPath,
      remoteUrl: spec.candidates?.find((c) => c.observed)?.git?.remote ?? null,
      defaultBranch: spec.candidates?.find((c) => c.observed)?.git?.branch ?? null,
    });
    groups.set(key, group);
  }

  if (dryRun) {
    console.log(JSON.stringify({ identities: mapped.identities.length, teams: mapped.teams.length, projects: [...groups.values()] }, null, 2));
    return;
  }

  const db = openStore(runtimeDbPath(loadConfig()));
  const repo = new Repo(db);
  try {
    const imported = repo.importIdentities(mapped);
    console.log(`Identities: ${imported.identities} (owner ${imported.ownerId}), teams: ${imported.teams}`);

    // Team leads: the two squads with a clear technical lead; the owner approves high risk.
    for (const [id, teamId] of [['atlas', 'creativesites'], ['vega', 'meetingmind'], ['sol', 'creativesites']]) {
      try {
        repo.updateIdentity(id, { approvalLevel: 'lead', teamId });
      } catch {
        console.log(`  (lead not set: ${id} missing)`);
      }
    }

    const existingProjects = new Set(repo.listProjects().map((p) => p.name));
    let projectCount = 0;
    for (const group of groups.values()) {
      if (existingProjects.has(group.name)) continue;
      const project = repo.createProject({
        name: group.name,
        rootPath: group.rootPath,
        defaultBranch: group.defaultBranch ?? undefined,
        teamId: group.teamId,
        repos: group.repos,
      });
      projectCount += 1;
      const roomName = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      if (!repo.listRooms().some((r) => r.name === roomName)) {
        const room = repo.createRoom({ name: roomName, projectId: project.id, teamId: group.teamId, kind: 'project' });
        repo.addRoomMember(room.id, { memberId: imported.ownerId, kind: 'human', role: 'owner' });
        for (const member of repo.listTeamMembers(group.teamId)) {
          repo.addRoomMember(room.id, { memberId: member.identityId, kind: 'agent', role: 'member' });
        }
      }
    }
    console.log(`Projects: ${projectCount} created (${groups.size} known), rooms created for new projects.`);

    if (!repo.listPolicies().length) {
      repo.createPolicy({ scope: 'global', actionType: '*', maxRiskForLead: 'medium', leadId: 'atlas', escalateTo: imported.ownerId, timeoutMinutes: 120 });
      repo.createPolicy({ scope: 'global', actionType: 'deploy', maxRiskForLead: 'low', leadId: 'atlas', escalateTo: imported.ownerId, timeoutMinutes: 60 });
      repo.createPolicy({ scope: 'global', actionType: 'production_data', maxRiskForLead: 'low', leadId: 'atlas', escalateTo: imported.ownerId, timeoutMinutes: 60 });
      console.log('Approval policies: 3 created (lead first, owner for medium+ / deploy / production data).');
    }

    console.log(`Store: ${runtimeDbPath(loadConfig())}`);
    console.log(`Owner: ${imported.ownerId}; identities: ${repo.listIdentities().length}; teams: ${repo.listTeams().length}; projects: ${repo.listProjects().length}; rooms: ${repo.listRooms().length}.`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(`Import failed: ${e.message}`);
  process.exit(1);
});
