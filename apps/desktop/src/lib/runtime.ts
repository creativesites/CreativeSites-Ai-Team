import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  AdapterInfo,
  CreateIdentityInput,
  CreateJobInput,
  CreateRoomInput,
  Health,
  Identity,
  JobDetail,
  JobSummary,
  Message,
  PostMessageInput,
  Room,
  RuntimeEvent,
  Session,
  Summary,
  UpdateIdentityInput,
} from '@runtime/types';

// The desktop's only way to the data: the runtime's local API. The desktop
// never opens the database and never calls an AI model itself.

export interface RuntimeConnection {
  url: string;
  token: string;
}

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; connection: RuntimeConnection; health: Health }
  | { status: 'unavailable'; reason: string };

/**
 * Finds the running runtime. In the desktop app the Rust side reads
 * ~/.myaos/runtime.json (starting the runtime first if needed). In a plain
 * browser during development, a dev-only Vite route serves the same file.
 */
export async function discoverRuntime(): Promise<RuntimeConnection> {
  if (isTauri()) return invoke<RuntimeConnection>('runtime_connection');
  if (import.meta.env.DEV) {
    const res = await fetch('/__myaos/runtime');
    if (res.ok) return (await res.json()) as RuntimeConnection;
    throw new Error(await res.text());
  }
  throw new Error('The runtime can only be reached from the MyaOS desktop app.');
}

export class RuntimeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class RuntimeClient {
  readonly connection: RuntimeConnection;

  constructor(connection: RuntimeConnection) {
    this.connection = connection;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.connection.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.connection.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new RuntimeError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  health = () => this.request<Health>('GET', '/health');
  summary = () => this.request<Summary>('GET', '/v1/summary');
  identities = () => this.request<Identity[]>('GET', '/v1/identities');
  createIdentity = (input: CreateIdentityInput) => this.request<Identity>('POST', '/v1/identities', input);
  updateIdentity = (id: string, input: UpdateIdentityInput) =>
    this.request<Identity>('POST', `/v1/identities/${encodeURIComponent(id)}`, input);
  rooms = () => this.request<Room[]>('GET', '/v1/rooms');
  createRoom = (input: CreateRoomInput) => this.request<Room>('POST', '/v1/rooms', input);
  messages = (roomId: string) => this.request<Message[]>('GET', `/v1/rooms/${encodeURIComponent(roomId)}/messages`);
  postMessage = (roomId: string, input: PostMessageInput) =>
    this.request<Message>('POST', `/v1/rooms/${encodeURIComponent(roomId)}/messages`, input);
  jobs = () => this.request<JobSummary[]>('GET', '/v1/jobs');
  job = (jobId: string) => this.request<JobDetail>('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
  createJob = (input: CreateJobInput) => this.request<JobDetail>('POST', '/v1/jobs', input);
  sessions = () => this.request<Session[]>('GET', '/v1/sessions');
  adapters = () => this.request<AdapterInfo[]>('GET', '/v1/adapters');

  /**
   * Follows the event stream until `signal` aborts, resuming after the last
   * event seen. fetch is used instead of EventSource so the token stays in a
   * header rather than the URL.
   */
  async followEvents(onEvent: (e: RuntimeEvent) => void, signal: AbortSignal, since = 0): Promise<void> {
    let last = since;
    while (!signal.aborted) {
      try {
        const res = await fetch(`${this.connection.url}/v1/events`, {
          headers: { Authorization: `Bearer ${this.connection.token}`, 'Last-Event-ID': String(last) },
          signal,
        });
        if (!res.ok || !res.body) throw new RuntimeError(res.status, 'event stream refused');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = block
              .split('\n')
              .filter((l) => l.startsWith('data: '))
              .map((l) => l.slice(6))
              .join('\n');
            if (!data) continue;
            const event = JSON.parse(data) as RuntimeEvent;
            last = event.seq;
            onEvent(event);
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      // Stream ended or failed: wait a moment, then resume where it left off.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
