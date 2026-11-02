import * as React from 'react';
import type { AdapterInfo, Identity, JobSummary, Project, Room, Session } from '@runtime/types';
import { RuntimeBanner, Sidebar, useMode } from '@/components/app/shell';
import { EmptyState } from '@/components/app/status';
import { href, useRoute, type Route } from '@/lib/route';
import { RuntimeProvider, useRuntime, useRuntimeData, type Loadable } from '@/lib/runtime-context';
import { ApprovalsScreen } from '@/screens/approvals';
import { CoworkersScreen } from '@/screens/coworkers';
import { JobsScreen } from '@/screens/jobs';
import { SettingsScreen } from '@/screens/settings';
import { WorkspacesScreen } from '@/screens/workspaces';
import { DevScreen } from '@/screens/dev';
import { HomeScreen, type StartJobRequest } from '@/screens/home';
import { JobScreen } from '@/screens/job';
import { CouncilRoomScreen } from '@/screens/council-room';
import { RoomScreen } from '@/screens/room';

const DEFAULT_OWNER_ID = 'winston';
const DEFAULT_OWNER_NAME = 'Winston';

// Sample data lives only in the dev build, behind #/preview/<screen>.
const Preview = import.meta.env.DEV ? React.lazy(() => import('@/preview/preview')) : null;

const list = <T,>(l: Loadable<T[]>): T[] => (l.status === 'ready' ? l.data : []);

export default function App() {
  const route = useRoute();
  if (route.name === 'preview') {
    return Preview ? (
      <React.Suspense fallback={null}>
        <Preview screen={route.screen} />
      </React.Suspense>
    ) : (
      <p className="p-6 text-sm text-muted-foreground">Previews exist only in development builds.</p>
    );
  }
  return (
    <RuntimeProvider>
      <Workspace route={route} />
    </RuntimeProvider>
  );
}

function Workspace({ route }: { route: Route }) {
  const [mode, setMode] = useMode();
  const rooms = useRuntimeData((c) => c.rooms());
  const jobs = useRuntimeData((c) => c.jobs());
  const identities = useRuntimeData((c) => c.identities());
  const sessions = useRuntimeData((c) => c.sessions());
  const adapters = useRuntimeData((c) => c.adapters());
  const projects = useRuntimeData((c) => c.projects());
  const settings = useRuntimeData((c) => c.settings());

  const idList = list(identities);
  const ownerIdentity = idList.find((i) => i.isOwner);
  const ownerId =
    (settings.status === 'ready' && typeof settings.data.ownerId === 'string' && settings.data.ownerId) ||
    ownerIdentity?.id ||
    DEFAULT_OWNER_ID;
  const ownerName = ownerIdentity?.name || DEFAULT_OWNER_NAME;

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 md:flex-row">
      <Sidebar
        route={route}
        mode={mode}
        onModeChange={setMode}
        ownerName={ownerName}
        rooms={list(rooms)}
        jobs={list(jobs)}
        identities={idList}
        sessions={list(sessions)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <RuntimeBanner />
        <Screen
          route={route}
          rooms={list(rooms)}
          jobs={list(jobs)}
          identities={idList}
          sessions={list(sessions)}
          adapters={list(adapters)}
          projects={list(projects)}
          ownerId={ownerId}
          ownerName={ownerName}
        />
      </div>
    </div>
  );
}

function Screen({
  route,
  rooms,
  jobs,
  identities,
  sessions,
  adapters,
  projects,
  ownerId,
  ownerName,
}: {
  route: Route;
  rooms: Room[];
  jobs: JobSummary[];
  identities: Identity[];
  sessions: Session[];
  adapters: AdapterInfo[];
  projects: Project[];
  ownerId: string;
  ownerName: string;
}) {
  const { client } = useRuntime();

  const startJob = async (req: StartJobRequest) => {
    if (!client) throw new Error('The runtime is not reachable.');
    const roomId = req.roomId ?? (await client.createRoom({ name: req.newRoomName!, projectId: req.projectId ?? undefined })).id;
    // The title is the brief's first sentence; the whole text stays as the brief.
    const first = req.text.split('\n')[0].split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');
    const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
    const job = await client.createJob({ roomId, title, brief: req.text, createdBy: ownerId });
    await client.postMessage(roomId, { authorId: ownerId, authorKind: 'human', body: req.text, jobId: job.id });
    window.location.hash = href({ name: 'room', roomId });
  };

  switch (route.name) {
    case 'home':
      return <HomeScreen rooms={rooms} jobs={jobs} identities={identities} sessions={sessions} projects={projects} onStartJob={client ? startJob : undefined} />;
    case 'approvals':
      return <ApprovalsScreen />;
    case 'jobs':
      return <JobsScreen />;
    case 'room':
      return <RoomContainer roomId={route.roomId} rooms={rooms} jobs={jobs} identities={identities} ownerId={ownerId} ownerName={ownerName} />;
    case 'job':
      return <JobContainer jobId={route.jobId} rooms={rooms} identities={identities} ownerName={ownerName} />;
    case 'council':
      return <CouncilRoomScreen jobId={route.jobId} identities={identities} ownerId={ownerId} />;
    case 'verdict':
      return <CouncilRoomScreen jobId={route.jobId} initialOpenVerdict identities={identities} ownerId={ownerId} />;
    case 'dev':
      return <DevContainer jobId={route.jobId ?? jobs[0]?.id} jobs={jobs} identities={identities} sessions={sessions} />;
    case 'workspaces':
      return <WorkspacesScreen projects={projects} rooms={rooms} identities={identities} />;
    case 'settings':
      return <SettingsScreen identities={identities} adapters={adapters} projects={projects} />;
    case 'coworkers':
      return (
        <CoworkersScreen
          identities={identities}
          sessions={sessions}
          adapters={adapters}
          onCreate={client ? async (i) => void (await client.createIdentity(i)) : undefined}
          onUpdate={client ? async (id, i) => void (await client.updateIdentity(id, i)) : undefined}
        />
      );
    default:
      return null;
  }
}

function Loading({ what }: { what: Loadable<unknown> }) {
  if (what.status === 'error') return <EmptyState title="Could not load this">{what.message}</EmptyState>;
  if (what.status === 'offline') return <EmptyState title="Waiting for the runtime" />;
  return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
}

function RoomContainer({ roomId, rooms, jobs, identities, ownerId, ownerName }: { roomId: string; rooms: Room[]; jobs: JobSummary[]; identities: Identity[]; ownerId: string; ownerName: string }) {
  const { client } = useRuntime();
  const messages = useRuntimeData((c) => c.messages(roomId), [roomId]);
  const roomJobs = jobs.filter((j) => j.roomId === roomId);
  const focusId = roomJobs.find((j) => !['done', 'cancelled'].includes(j.stage))?.id;
  const focus = useRuntimeData((c) => (focusId ? c.job(focusId) : Promise.resolve(null)), [focusId]);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return rooms.length ? <EmptyState title="This room does not exist" /> : <Loading what={messages} />;
  if (messages.status !== 'ready') return <Loading what={messages} />;
  return (
    <RoomScreen
      room={room}
      messages={messages.data}
      jobs={roomJobs}
      identities={identities}
      focusJob={focus.status === 'ready' ? focus.data : null}
      ownerName={ownerName}
      onSend={client ? async (body) => void (await client.postMessage(roomId, { authorId: ownerId, authorKind: 'human', body })) : undefined}
      onStartJob={
        client
          ? async (text) => {
              const first = text.split('\n')[0]!.split(/(?<=[.!?])\s/)[0]!.replace(/[.]$/, '');
              const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
              const job = await client.createJob({ roomId, title, brief: text, createdBy: ownerId });
              await client.postMessage(roomId, { authorId: ownerId, authorKind: 'human', body: text, jobId: job.id });
              window.location.hash = href({ name: 'job', jobId: job.id });
            }
          : undefined
      }
    />
  );
}

function JobContainer({ jobId, rooms, identities, ownerName }: { jobId: string; rooms: Room[]; identities: Identity[]; ownerName: string }) {
  const job = useRuntimeData((c) => c.job(jobId), [jobId]);
  if (job.status !== 'ready') return <Loading what={job} />;
  return <JobScreen job={job.data} room={rooms.find((r) => r.id === job.data.roomId)} identities={identities} ownerName={ownerName} />;
}

function DevContainer({ jobId, jobs, identities, sessions }: { jobId?: string; jobs: JobSummary[]; identities: Identity[]; sessions: Session[] }) {
  const job = useRuntimeData((c) => (jobId ? c.job(jobId) : Promise.resolve(null)), [jobId]);
  return <DevScreen sessions={sessions} identities={identities} jobs={jobs} job={job.status === 'ready' ? job.data : null} />;
}
