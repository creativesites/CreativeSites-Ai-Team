import * as React from 'react';
import { discoverRuntime, RuntimeClient, type ConnectionState } from '@/lib/runtime';

interface RuntimeContextValue {
  state: ConnectionState;
  client: RuntimeClient | null;
  /** Bumps on every runtime event, so views refetch what they show. */
  revision: number;
  retry: () => void;
}

const RuntimeContext = React.createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConnectionState>({ status: 'connecting' });
  const [client, setClient] = React.useState<RuntimeClient | null>(null);
  const [revision, setRevision] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setState({ status: 'connecting' });
    (async () => {
      try {
        const connection = await discoverRuntime();
        const c = new RuntimeClient(connection);
        const health = await c.health();
        if (cancelled) return;
        setClient(c);
        setState({ status: 'connected', connection, health });
        void c.followEvents(() => setRevision((r) => r + 1), abort.signal);
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

  // While connected, check health every 10s; a failed check is shown, not hidden.
  React.useEffect(() => {
    if (!client) return;
    const timer = window.setInterval(async () => {
      try {
        await client.health();
      } catch {
        setClient(null);
        setState({ status: 'unavailable', reason: 'The runtime stopped answering.' });
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [client]);

  const value = React.useMemo(
    () => ({ state, client, revision, retry: () => setAttempt((a) => a + 1) }),
    [state, client, revision]
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
