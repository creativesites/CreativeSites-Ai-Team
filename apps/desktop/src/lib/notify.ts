import type { RuntimeEvent } from '@runtime/types';
import { href, type Route } from '@/lib/route';

// Which runtime events are worth interrupting the owner for, and what they say.
// The runtime emits approval.requested and agent.rate_limited / adapter.rate_limited;
// those are the names subscribed to here.

export interface Alert {
  /** Stable per event, so the same event never surfaces twice. */
  key: string;
  title: string;
  body: string;
  route: Route;
}

const STAGES_THAT_NEED_YOU = new Set(['verify', 'approve', 'done', 'cancelled']);

function when(iso: unknown): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 'later' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Turns one runtime event into an alert, or null when the owner does not need to hear about it. */
export function alertFor(event: RuntimeEvent): Alert | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const key = `event-${event.seq}`;

  switch (event.type) {
    case 'approval.requested':
    case 'approval.created': {
      const risk = typeof p.risk === 'string' ? p.risk : 'unrated';
      const action = typeof p.actionType === 'string' && p.actionType !== 'action' ? p.actionType : 'An action';
      const assignedTo = typeof p.assignedTo === 'string' ? p.assignedTo : 'Winston';
      return {
        key,
        title: 'Approval needed',
        body: `${action} (${risk} risk) for ${assignedTo} is waiting for a decision.`,
        route: { name: 'approvals' },
      };
    }
    case 'agent.rate_limited':
    case 'identity.rate_limited':
      return {
        key,
        title: 'Agent hit a session limit',
        body: `${event.subjectId ?? 'An agent'} is paused until ${when(p.resetAt)}${typeof p.reason === 'string' ? `: ${p.reason}` : '.'}`,
        route: { name: 'coworkers' },
      };
    case 'agent.rate_limit_cleared':
    case 'agent.resumed':
    case 'identity.resumed':
      return {
        key,
        title: 'Agent auto-resumed',
        body: `${event.subjectId ?? 'An agent'} has resumed normal work.`,
        route: { name: 'coworkers' },
      };
    case 'adapter.rate_limited':
      return {
        key,
        title: 'Runtime hit a session limit',
        body: `${event.subjectId ?? 'An adapter'} is paused until ${when(p.resetAt)}${typeof p.reason === 'string' ? `: ${p.reason}` : '.'}`,
        route: { name: 'settings' },
      };
    case 'job.stage_changed': {
      const to = typeof p.to === 'string' ? p.to : '';
      if (!event.subjectId || !STAGES_THAT_NEED_YOU.has(to)) return null;
      const verb =
        to === 'verify'
          ? 'is in independent verification'
          : to === 'approve'
            ? 'finished verification and is ready to ship'
            : to === 'done'
              ? 'is done and shipped'
              : 'was cancelled';
      return {
        key,
        title: to === 'approve' ? 'Job ready to ship' : 'Job update',
        body: `Job #${event.subjectId} ${verb}.`,
        route: { name: 'job', jobId: event.subjectId },
      };
    }
    default:
      return null;
  }
}

/**
 * Shows an OS notification when the window is in the background. The in-app toast
 * already covers the foreground, and where the webview has no Notification API this does nothing.
 */
export function notifyOs(alert: Alert): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (document.hasFocus()) return;
  try {
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
      return;
    }
    if (Notification.permission !== 'granted') return;
    const note = new Notification(alert.title, { body: alert.body, tag: alert.key });
    note.onclick = () => {
      window.focus();
      window.location.hash = href(alert.route);
    };
  } catch {
    /* a webview that refuses notifications still gets the in-app toast */
  }
}
