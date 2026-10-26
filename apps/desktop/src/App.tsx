import * as React from 'react';
import type { AdapterInfo, Identity, JobSummary, Room, Session } from '@runtime/types';
import { RuntimeBanner, Sidebar, useMode } from '@/components/app/shell';
import { EmptyState } from '@/components/app/status';
import { href, useRoute, type Route } from '@/lib/route';
import { RuntimeProvider, useRuntime, useRuntimeData, type Loadable } from '@/lib/runtime-context';
import { CoworkersScreen } from '@/screens/coworkers';
import { DevScreen } from '@/screens/dev';
import { HomeScreen, type StartJobRequest } from '@/screens/home';
import { JobScreen } from '@/screens/job';
import { PlanningNotYet } from '@/screens/planning';
import { RoomScreen } from '@/screens/room';

// The owner's display name. The runtime has no owner record yet (Phase 2),
// so the app says "You" rather than guess a name.
const OWNER_ID = 'owner';
const OWNER_NAME = 'You';

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

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 md:flex-row">
      <Sidebar
        route={route}
        mode={mode}
        onModeChange={setMode}
        ownerName={OWNER_NAME}
        rooms={list(rooms)}
        jobs={list(jobs)}
        identities={list(identities)}
        sessions={list(sessions)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <RuntimeBanner />
        <Screen route={route} rooms={list(rooms)} jobs={list(jobs)} identities={list(identities)} sessions={list(sessions)} adapters={list(adapters)} />
      </div>
    </div>
  );
}

function Screen({ route, rooms, jobs, identities, sessions, adapters }: { route: Route; rooms: Room[]; jobs: JobSummary[]; identities: Identity[]; sessions: Session[]; adapters: AdapterInfo[] }) {
  const { client } = useRuntime();

  const startJob = async (req: StartJobRequest) => {
    if (!client) throw new Error('The runtime is not reachable.');
    const roomId = req.roomId ?? (await client.createRoom({ name: req.newRoomName! })).id;
    // The title is the brief's first sentence; the whole text stays as the brief.
    const first = req.text.split('\n')[0].split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');
    const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
    const job = await client.createJob({ roomId, title, brief: req.text, createdBy: OWNER_ID });
    await client.postMessage(roomId, { authorId: OWNER_ID, authorKind: 'human', body: req.text, jobId: job.id });
    window.location.hash = href({ name: 'room', roomId });
  };

  switch (route.name) {
    case 'home':
      return <HomeScreen rooms={rooms} jobs={jobs} identities={identities} sessions={sessions} onStartJob={client ? startJob : undefined} />;
    case 'room':
      return <RoomContainer roomId={route.roomId} rooms={rooms} jobs={jobs} identities={identities} />;
    case 'job':
      return <JobContainer jobId={route.jobId} rooms={rooms} identities={identities} />;
    case 'council':
    case 'verdict':
      return <PlanningNotYet jobId={route.jobId} />;
    case 'dev':
      return <DevContainer jobId={route.jobId ?? jobs[0]?.id} jobs={jobs} identities={identities} sessions={sessions} />;
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

function RoomContainer({ roomId, rooms, jobs, identities }: { roomId: string; rooms: Room[]; jobs: JobSummary[]; identities: Identity[] }) {
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
      ownerName={OWNER_NAME}
      onSend={client ? async (body) => void (await client.postMessage(roomId, { authorId: OWNER_ID, authorKind: 'human', body })) : undefined}
    />
  );
}

function JobContainer({ jobId, rooms, identities }: { jobId: string; rooms: Room[]; identities: Identity[] }) {
  const job = useRuntimeData((c) => c.job(jobId), [jobId]);
  if (job.status !== 'ready') return <Loading what={job} />;
  return <JobScreen job={job.data} room={rooms.find((r) => r.id === job.data.roomId)} identities={identities} ownerName={OWNER_NAME} />;
}

function DevContainer({ jobId, jobs, identities, sessions }: { jobId?: string; jobs: JobSummary[]; identities: Identity[]; sessions: Session[] }) {
  const job = useRuntimeData((c) => (jobId ? c.job(jobId) : Promise.resolve(null)), [jobId]);
  return <DevScreen sessions={sessions} identities={identities} jobs={jobs} job={job.status === 'ready' ? job.data : null} />;
}
