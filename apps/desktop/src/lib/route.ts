import * as React from 'react';

// A small hash router: the app has a handful of screens and no server routing.

export type CommunicationSubpage = 'inboxes' | 'threads' | 'announcements' | 'social' | 'standups';

export type Route =
  | { name: 'home' }
  | { name: 'room'; roomId: string }
  | { name: 'job'; jobId: string }
  | { name: 'council'; jobId: string }
  | { name: 'verdict'; jobId: string }
  | { name: 'design-studio'; boardId?: string }
  | { name: 'dev'; jobId?: string }
  | { name: 'coworkers' }
  | { name: 'team'; agentId?: string }
  | { name: 'communication'; tab?: CommunicationSubpage }
  | { name: 'approvals' }
  | { name: 'jobs' }
  | { name: 'workspaces' }
  | { name: 'settings' }
  | { name: 'preview'; screen: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'rooms':
      if (parts[1]) return { name: 'room', roomId: parts[1] };
      break;
    case 'jobs':
      if (parts[1] && parts[2] === 'council') return { name: 'council', jobId: parts[1] };
      if (parts[1] && parts[2] === 'verdict') return { name: 'verdict', jobId: parts[1] };
      if (parts[1]) return { name: 'job', jobId: parts[1] };
      break;
    case 'design-studio':
      return { name: 'design-studio', boardId: parts[1] };
    case 'dev':
      return { name: 'dev', jobId: parts[1] };
    case 'coworkers':
      return { name: 'coworkers' };
    case 'team':
      return { name: 'team', agentId: parts[1] };
    case 'communication':
    case 'chat':
      return { name: 'communication', tab: parts[1] as CommunicationSubpage | undefined };
    case 'approvals':
      return { name: 'approvals' };
    case 'jobs':
      return { name: 'jobs' };
    case 'workspaces':
      return { name: 'workspaces' };
    case 'settings':
      return { name: 'settings' };
    case 'preview':
      return { name: 'preview', screen: parts[1] ?? '' };
  }
  return { name: 'home' };
}

export function href(route: Route): string {
  const e = encodeURIComponent;
  switch (route.name) {
    case 'home':
      return '#/home';
    case 'room':
      return `#/rooms/${e(route.roomId)}`;
    case 'job':
      return `#/jobs/${e(route.jobId)}`;
    case 'council':
      return `#/jobs/${e(route.jobId)}/council`;
    case 'verdict':
      return `#/jobs/${e(route.jobId)}/verdict`;
    case 'design-studio':
      return route.boardId ? `#/design-studio/${e(route.boardId)}` : '#/design-studio';
    case 'dev':
      return route.jobId ? `#/dev/${e(route.jobId)}` : '#/dev';
    case 'coworkers':
      return '#/coworkers';
    case 'team':
      return route.agentId ? `#/team/${e(route.agentId)}` : '#/team';
    case 'communication':
      return route.tab ? `#/communication/${e(route.tab)}` : '#/communication';
    case 'approvals':
      return '#/approvals';
    case 'jobs':
      return '#/jobs';
    case 'workspaces':
      return '#/workspaces';
    case 'settings':
      return '#/settings';
    case 'preview':
      return `#/preview/${e(route.screen)}`;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = React.useState(() => parseRoute(window.location.hash));
  React.useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
