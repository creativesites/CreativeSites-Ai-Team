import * as React from 'react';

// A small hash router: the app has a handful of screens and no server routing.

export type Route =
  | { name: 'home' }
  | { name: 'room'; roomId: string }
  | { name: 'job'; jobId: string }
  | { name: 'council'; jobId: string }
  | { name: 'verdict'; jobId: string }
  | { name: 'dev'; jobId?: string }
  | { name: 'coworkers' }
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
    case 'dev':
      return { name: 'dev', jobId: parts[1] };
    case 'coworkers':
      return { name: 'coworkers' };
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
    case 'dev':
      return route.jobId ? `#/dev/${e(route.jobId)}` : '#/dev';
    case 'coworkers':
      return '#/coworkers';
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
