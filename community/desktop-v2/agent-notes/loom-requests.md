# Loom Integration Requests & Wiring Spec

**Agent:** Loom (`loom`), Workspaces UI Engineer  
**Branch:** `antigravity/workspaces`  
**Assignment:** Assignment A — Workspaces + Settings UI (`task-7`)  
**Date:** 2026-10-27  

---

## 1. Routes & Navigation State

The routes and sidebar nav items were already added in the Lead's plumbing commit (`chore(ui): shared client, routes and nav plumbing for the Phase 1 UI workstream`):
- `#/workspaces` -> `route.name === 'workspaces'`
- `#/settings` -> `route.name === 'settings'`
- Nav icons and labels in `shell.tsx`:
  - `Workspaces`: `<FolderGit2 />`
  - `Settings`: `<Settings />`

No additional routes or nav items are required.

---

## 2. Client Methods Used

Both screens use the following methods on `RuntimeClient` (all are present in `apps/desktop/src/lib/runtime.ts`):

### Workspaces Screen
- `client.projects()`: `GET /v1/projects`
- `client.projectStatus(projectId)`: `GET /v1/projects/:id/status`
- `client.attachProject(input)`: `POST /v1/projects/attach`
- `client.cloneProject(input)`: `POST /v1/projects/clone`
- `client.createProjectFolder(input)`: `POST /v1/projects/create-folder`
- `client.addRepo(projectId, input)`: `POST /v1/projects/:id/repos`
- `client.removeRepo(repoId)`: `DELETE /v1/repos/:id`
- `client.rooms()`: `GET /v1/rooms`
- `client.createRoom(input)`: `POST /v1/rooms`
- `client.roomMembers(roomId)`: `GET /v1/rooms/:id/members`
- `client.addRoomMember(roomId, memberId, kind, role)`: `POST /v1/rooms/:id/members`
- `client.teams()`: `GET /v1/teams`
- `client.identities()`: `GET /v1/identities`

### Settings Screen
- `client.settings()`: `GET /v1/settings`
- `client.updateSettings(patch)`: `POST /v1/settings`
- `client.identities()`: `GET /v1/identities`
- `client.budgets()`: `GET /v1/budgets`
- `client.createBudget(input)`: `POST /v1/budgets`
- `client.policies()`: `GET /v1/policies`
- `client.createPolicy(input)`: `POST /v1/policies`
- `client.updatePolicy(id, input)`: `PATCH /v1/policies/:id`
- `client.deletePolicy(id)`: `DELETE /v1/policies/:id`
- `client.adapters()`: `GET /v1/adapters`
- `client.bridgeStatus()`: `GET /v1/bridge/status`
- `client.projects()`: `GET /v1/projects`

---

## 3. Recommended Wiring in `App.tsx`

Both `WorkspacesScreen` and `SettingsScreen` have built-in `useRuntimeData` fallbacks, so they can be mounted with **zero props** or with **explicit props** from `App.tsx`.

### Wiring in `apps/desktop/src/App.tsx`:

```tsx
import { WorkspacesScreen } from '@/screens/workspaces';
import { SettingsScreen } from '@/screens/settings';

// In Screen switch(route.name):
    case 'workspaces':
      return (
        <WorkspacesScreen
          projects={projects}
          rooms={rooms}
          identities={identities}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          identities={identities}
          adapters={adapters}
          projects={projects}
        />
      );
```

Or simply:
```tsx
    case 'workspaces':
      return <WorkspacesScreen />;
    case 'settings':
      return <SettingsScreen />;
```

Both patterns are fully supported and tested.
