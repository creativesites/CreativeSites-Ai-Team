import * as React from 'react';
import { X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { alertFor, notifyOs, type Alert } from '@/lib/notify';
import { href } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

const TOAST_MS = 8000;
const MAX_TOASTS = 4;

interface Toast extends Alert {
  id: number;
}

/**
 * Surfaces approvals, rate limits and job changes as they happen. The event stream
 * replays history from the start, so only events created after this window opened count.
 */
export function Toaster() {
  const { subscribe } = useRuntime();
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const openedAt = React.useRef(Date.now());

  const dismiss = React.useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  React.useEffect(
    () =>
      subscribe((event) => {
        if (Date.parse(event.createdAt) < openedAt.current) return;
        const alert = alertFor(event);
        if (!alert) return;
        setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { ...alert, id: event.seq }]);
        window.setTimeout(() => dismiss(event.seq), TOAST_MS);
        notifyOs(alert);
      }),
    [subscribe, dismiss]
  );

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass-panel flex items-start gap-3 rounded-xl p-3 text-sm">
          <a href={href(t.route)} onClick={() => dismiss(t.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline">
            <span className="font-medium">{t.title}</span>
            <span className="text-xs text-muted-foreground">{t.body}</span>
          </a>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className={cn(buttonVariants({ variant: 'glass', size: 'icon-sm' }), 'shrink-0')}
          >
            <X />
          </button>
        </div>
      ))}
    </div>
  );
}
