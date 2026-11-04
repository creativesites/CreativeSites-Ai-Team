import * as React from 'react';
import { discoverRuntime, RuntimeClient, type ConnectionState } from '@/lib/runtime';
import type { RuntimeEvent } from '@runtime/types';

type EventListener = (event: RuntimeEvent) => void;

interface RuntimeContextValue {
  state: ConnectionState;
  client: RuntimeClient | null;
  /** Bumps on every runtime event, so views refetch what they show. */
  revision: number;
  /** Calls `listener` with each runtime event as it arrives. Returns the unsubscribe function. */
  subscribe: (listener: EventListener) => () => void;
  retry: () => void;
}

const RuntimeContext = React.createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConnectionState>({ status: 'connecting' });
  const [client, setClient] = React.useState<RuntimeClient | null>(null);
  const [revision, setRevision] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);
  const listeners = React.useRef(new Set<EventListener>());
  const subscribe = React.useCallback((listener: EventListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setState({ status: 'connecting' });
    (async () => {
      try {
        const connection = await discoverRuntime();
        const c = new RuntimeClient(connection);
        const health = await c.health();
        // Owner key (security S1): enrol once; a mismatch is surfaced, never silently replaced.
        const ownerKey = await c.ensureOwnerKey().catch((e) => ({ state: 'unavailable' as const, fingerprint: null, detail: String(e) }));
        if (ownerKey.state === 'mismatch') console.warn('[myaos] owner key mismatch:', ownerKey.detail);
        if (cancelled) return;
        setClient(c);
        setState({ status: 'connected', connection, health, ownerKey });
        void c.followEvents((event) => {
          for (const listener of listeners.current) listener(event);
          setRevision((r) => r + 1);
        }, abort.signal);
      } catch (e) {
        if (cancelled) return;
        setClient(null);
        setState({ status: 'unavailable', reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [attempt]);

  // While connected, check health every 10s; tolerate transient blips and auto-rediscover if the runtime restarted on a new port.
  React.useEffect(() => {
    if (!client) return;
    let consecutiveFailures = 0;
    const timer = window.setInterval(async () => {
      try {
        await client.health();
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
        // Try immediate re-discovery in case the runtime restarted on a new port
        try {
          const freshConnection = await discoverRuntime();
          if (freshConnection.url !== client.connection.url || freshConnection.token !== client.connection.token) {
            setAttempt((a) => a + 1);
            return;
          }
        } catch {
          /* ignore discovery failure during transient blip */
        }
        if (consecutiveFailures >= 3) {
          setClient(null);
          setState({ status: 'unavailable', reason: 'The runtime stopped answering. Reconnecting automatically…' });
        }
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [client]);

  // When unavailable, automatically attempt to reconnect every 3.5s so the user never has to click "Try again" manually.
  React.useEffect(() => {
    if (state.status !== 'unavailable') return;
    const timer = window.setInterval(() => {
      setAttempt((a) => a + 1);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [state.status]);

  const value = React.useMemo(
    () => ({ state, client, revision, subscribe, retry: () => setAttempt((a) => a + 1) }),
    [state, client, revision, subscribe]
  );
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeContextValue {
  const ctx = React.useContext(RuntimeContext);
  if (!ctx) throw new Error('useRuntime must be used inside RuntimeProvider');
  return ctx;
}

export type Loadable<T> =
  | { status: 'offline' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** Loads runtime data, and reloads it whenever the runtime reports a change. */
export function useRuntimeData<T>(load: (c: RuntimeClient) => Promise<T>, deps: React.DependencyList = []): Loadable<T> {
  const { client, revision } = useRuntime();
  const [result, setResult] = React.useState<Loadable<T>>({ status: 'loading' });

  React.useEffect(() => {
    if (!client) {
      setResult({ status: 'offline' });
      return;
    }
    let cancelled = false;
    load(client).then(
      (data) => !cancelled && setResult({ status: 'ready', data }),
      (e: unknown) => !cancelled && setResult({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, revision, ...deps]);

  return result;
}
