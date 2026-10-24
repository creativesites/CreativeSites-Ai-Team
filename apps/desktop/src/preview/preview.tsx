import * as React from 'react';
import { Sidebar, type Mode } from '@/components/app/shell';
import { href, type Route } from '@/lib/route';
import { CoworkersScreen } from '@/screens/coworkers';
import { DevScreen } from '@/screens/dev';
import { HomeScreen } from '@/screens/home';
import { JobScreen } from '@/screens/job';
import { CouncilScreen, VerdictScreen } from '@/screens/planning';
import { RoomScreen } from '@/screens/room';
import * as f from '@/preview/fixtures';

// Dev-only: each approved screen with the design's sample data, to compare
// against the design canvas. Reached at #/preview/<screen>.

const SCREENS: Record<string, { label: string; route: Route; mode: Mode; render: () => React.ReactNode }> = {
  home: { label: 'Home', route: { name: 'home' }, mode: 'work', render: () => <HomeScreen rooms={f.rooms} jobs={f.jobs} identities={f.identities} sessions={f.sessions} /> },
  room: {
    label: 'Room',
    route: { name: 'room', roomId: 'room_chat' },
    mode: 'work',
    render: () => <RoomScreen room={f.rooms[0]} messages={f.messages} jobs={f.jobs.filter((j) => j.roomId === 'room_chat')} identities={f.identities} focusJob={f.job142} ownerName="Winston" />,
  },
  job: { label: 'Job', route: { name: 'job', jobId: 'job_139' }, mode: 'work', render: () => <JobScreen job={f.job139} room={f.rooms[1]} identities={f.identities} ownerName="Winston" /> },
  council: { label: 'Council', route: { name: 'council', jobId: 'job_142' }, mode: 'work', render: () => <CouncilScreen council={f.council} /> },
  verdict: { label: 'Verdict', route: { name: 'verdict', jobId: 'job_142' }, mode: 'work', render: () => <VerdictScreen verdict={f.verdict} /> },
  dev: { label: 'Dev', route: { name: 'dev', jobId: 'job_142' }, mode: 'dev', render: () => <DevScreen sessions={f.sessions} identities={f.identities} jobs={f.jobs} job={f.job142} /> },
  coworkers: { label: 'Coworkers', route: { name: 'coworkers' }, mode: 'work', render: () => <CoworkersScreen identities={f.identities} sessions={f.sessions} /> },
};

export default function Preview({ screen }: { screen: string }) {
  const s = SCREENS[screen] ?? SCREENS.home;
  const [mode, setMode] = React.useState<Mode>(s.mode);
  React.useEffect(() => setMode(s.mode), [s]);
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-needs-you/30 bg-needs-you/10 px-4 py-1.5 text-xs text-needs-you">
        <strong>Preview with sample data</strong>
        <span>Not live. Screens:</span>
        {Object.entries(SCREENS).map(([key, v]) => (
          <a key={key} href={href({ name: 'preview', screen: key })} className={key === screen ? 'underline' : 'opacity-80 hover:opacity-100'}>
            {v.label}
          </a>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        <Sidebar route={s.route} mode={mode} onModeChange={setMode} ownerName="Winston" rooms={f.rooms} jobs={f.jobs} identities={f.identities} sessions={f.sessions} />
        <div className="min-w-0 flex-1">{s.render()}</div>
      </div>
    </div>
  );
}
