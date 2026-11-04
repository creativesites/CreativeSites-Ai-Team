import type { DatabaseSync } from 'node:sqlite';
import type { Repo } from '../store/repo.ts';
import type { AgentPrincipal } from './tokens.ts';
import { callTool, TOOLS, type ToolDef } from './tools.ts';

/**
 * Minimal MCP server (JSON-RPC 2.0 over HTTP POST, "streamable HTTP" without
 * server-initiated streams). Supports initialize, ping, tools/list and
 * tools/call, which is all the agent action interface needs.
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'myaos-runtime', version: '1.0.0' };

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type RpcResponse = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

export function handleMcp(
  body: unknown,
  deps: { principal: AgentPrincipal; repo: Repo; db: DatabaseSync; now?: () => Date; tools?: ToolDef[] }
): RpcResponse | RpcResponse[] | null {
  if (Array.isArray(body)) {
    const out = body.map((b) => handleOne(b as RpcRequest, deps)).filter((r): r is RpcResponse => r !== null);
    return out.length ? out : null;
  }
  return handleOne(body as RpcRequest, deps);
}

function handleOne(req: RpcRequest, deps: { principal: AgentPrincipal; repo: Repo; db: DatabaseSync; now?: () => Date; tools?: ToolDef[] }): RpcResponse | null {
  const id = req?.id ?? null;
  const isNotification = req?.id === undefined;
  const ok = (result: unknown): RpcResponse | null => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string): RpcResponse | null => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message } });
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return fail(-32600, 'Invalid JSON-RPC request');
  const tools = (deps.tools ?? TOOLS).filter((t) => !t.roles || t.roles.includes(deps.principal.role));

  switch (req.method) {
    case 'initialize':
      return ok({
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'These tools are your hands inside MyaOS. Report progress with task_report, attach evidence with evidence_add, ' +
          'raise blockers with blocker_raise. You act only as your own identity and only on your session job and task. ' +
          'You cannot mark work verified or done: the runtime and an independent verifier do that.',
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const name = String(req.params?.name ?? '');
      const outcome = callTool(
        { principal: deps.principal, repo: deps.repo, db: deps.db, now: deps.now ?? (() => new Date()) },
        name,
        req.params?.arguments ?? {},
        deps.tools ?? TOOLS
      );
      if (outcome.status === 'ok') {
        return ok({ content: [{ type: 'text', text: JSON.stringify(outcome.result ?? null) }], structuredContent: outcome.result ?? null, isError: false });
      }
      // Tool-level failures are results with isError, so the model can read and correct them.
      return ok({ content: [{ type: 'text', text: outcome.error ?? 'failed' }], isError: true });
    }
    default:
      return fail(-32601, `Method not found: ${req.method}`);
  }
}
