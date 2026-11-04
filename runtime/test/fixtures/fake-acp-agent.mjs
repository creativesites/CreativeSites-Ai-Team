#!/usr/bin/env node
// A minimal, deterministic ACP v1 agent used ONLY to self-test the spike harness.
// It exercises every client capability the harness implements:
//   fs/read_text_file, fs/write_text_file, session/request_permission,
//   terminal/create, terminal/output, terminal/wait_for_exit, terminal/kill, and
//   session/cancel -> stopReason "cancelled".
//
// It is not an adapter and its results never appear in the findings matrix.

import { join } from 'node:path';
import readline from 'node:readline';

const cwd = process.cwd();
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let nextId = 1;
const pending = new Map();
let currentPrompt = null;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
}
function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}
function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}
function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}
function update(updatePayload) {
  notify('session/update', { sessionId, update: updatePayload });
}
function agentText(text) {
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
}
function toolCall(toolCallId, title, status, rawInput) {
  update({
    sessionUpdate: status === 'pending' ? 'tool_call' : 'tool_call_update',
    toolCallId,
    title,
    status,
    ...(rawInput ? { rawInput } : {}),
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let sessionId = 'fake-session-1';

async function runTerminal(command, args) {
  const created = await request('terminal/create', { sessionId, command, args, cwd });
  if (created.error) throw new Error(`terminal/create failed: ${created.error.message}`);
  const terminalId = created.result.terminalId;
  const exited = await request('terminal/wait_for_exit', { terminalId });
  const output = await request('terminal/output', { terminalId });
  await request('terminal/release', { terminalId });
  return {
    terminalId,
    exitCode: exited.result?.exitCode ?? null,
    signal: exited.result?.signal ?? null,
    output: output.result?.output ?? '',
  };
}

let mcpServers = [];

async function handlePrompt(message) {
  const promptText = (message.params?.prompt ?? [])
    .map((part) => (part?.type === 'text' ? part.text : ''))
    .join('\n');
  currentPrompt = { id: message.id, cancelled: false };
  agentText('working');
  try {
    // Dispatcher scenarios: `myaos-slow-ms: N` holds the turn open, `myaos-task-file: <name> <word>`
    // writes <word> into <name> in the working folder (the task worktree).
    const slowMs = promptText.match(/myaos-slow-ms: (\d+)/);
    const taskFile = promptText.match(/myaos-task-file: (\S+) ([^\s"]+)/);
    if (slowMs || taskFile) {
      if (slowMs) await sleep(Number(slowMs[1]));
      if (taskFile) {
        const result = await request('fs/write_text_file', { sessionId, path: join(cwd, taskFile[1]), content: `${taskFile[2]}\n` });
        agentText(result.error ? `write failed: ${result.error.message}` : `wrote ${taskFile[1]}`);
      } else {
        agentText('slow task done');
      }
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }
    if (/use myaos tools/i.test(promptText)) {
      // Behave like an MCP client: list the runtime's tools, then report through them.
      const server = mcpServers.find((m) => m.type === 'http' && m.name === 'myaos');
      if (!server) {
        agentText('no myaos MCP server offered');
        respond(message.id, { stopReason: 'end_turn' });
        return;
      }
      const headers = Object.fromEntries((server.headers ?? []).map((h) => [h.name, h.value]));
      const rpc = async (method, params) => {
        const res = await fetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
        return res.json();
      };
      const list = await rpc('tools/list', {});
      const names = (list.result?.tools ?? []).map((t) => t.name).join(',');
      const report = await rpc('tools/call', { name: 'task_report', arguments: { summary: 'fake agent progress via MCP' } });
      agentText(`myaos tools: ${names}; task_report isError=${report.result?.isError}`);
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }
    if (/report usage/i.test(promptText)) {
      update({
        sessionUpdate: 'usage_update',
        inputTokens: 120,
        outputTokens: 45,
        costCents: 3,
      });
      agentText('reported usage update');
      respond(message.id, { stopReason: 'end_turn', usage: { inputTokens: 120, outputTokens: 45, costCents: 3 } });
      return;
    }
    // If prompt was prepended with a prior session summary or Baton Capsule, inspect the trailing active turn
    const activeText = promptText.includes('=== END OF BATON CAPSULE')
      ? promptText.slice(promptText.indexOf('=== END OF BATON CAPSULE')).split('\n').slice(1).join('\n').trim() || promptText
      : promptText.includes('Earlier in this session')
        ? promptText.slice(promptText.lastIndexOf('\n\n')).trim() || promptText
        : promptText;

    // Design Studio runs: write frames into the working folder the way a real agent would.
    if (/myaos-design-test: new/i.test(activeText)) {
      const file = join(cwd, 'home.html');
      const result = await request('fs/write_text_file', {
        sessionId,
        path: file,
        content: '<!-- myaos:frame title="Home" device="phone" notes="first direction" -->\n<main>Home</main>\n',
      });
      agentText(result.error ? `write failed: ${result.error.message}` : 'wrote home.html');
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }
    if (/myaos-design-test: update/i.test(activeText)) {
      const target = activeText.match(/\): (\/\S+\.html)$/m)?.[1];
      const read = await request('fs/read_text_file', { sessionId, path: target });
      const write = await request('fs/write_text_file', {
        sessionId,
        path: target,
        content: `${read.result?.content ?? ''}<footer>Updated</footer>\n`,
      });
      agentText(write.error ? `update failed: ${write.error.message}` : 'updated frame');
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/sleep/i.test(activeText)) {
      toolCall('t-sleep', 'Run sleep 20', 'pending', { command: 'sleep 20' });
      const created = await request('terminal/create', { sessionId, command: 'sleep', args: ['20'], cwd });
      const terminalId = created.result?.terminalId;
      toolCall('t-sleep', 'Run sleep 20', 'in_progress');
      while (!currentPrompt.cancelled) await sleep(150);
      if (terminalId) await request('terminal/kill', { terminalId });
      toolCall('t-sleep', 'Run sleep 20', 'cancelled');
      respond(message.id, { stopReason: 'cancelled' });
      return;
    }

    if (/create a file/i.test(activeText)) {
      toolCall('t-create', 'Write created.txt', 'pending', { file_path: join(cwd, 'created.txt') });
      const result = await request('fs/write_text_file', {
        sessionId,
        path: join(cwd, 'created.txt'),
        content: 'hello from acp spike\n',
      });
      toolCall('t-create', 'Write created.txt', result.error ? 'failed' : 'completed');
      agentText(result.error ? `write failed: ${result.error.message}` : 'wrote created.txt');
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/edit\.txt/i.test(activeText)) {
      toolCall('t-edit', 'Edit edit.txt', 'pending', { file_path: join(cwd, 'edit.txt') });
      const read = await request('fs/read_text_file', { sessionId, path: join(cwd, 'edit.txt') });
      const content = read.result?.content ?? '';
      const next = content.endsWith('\n') ? `${content}line two\n` : `${content}\nline two\n`;
      const write = await request('fs/write_text_file', { sessionId, path: join(cwd, 'edit.txt'), content: next });
      toolCall('t-edit', 'Edit edit.txt', write.error ? 'failed' : 'completed');
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/exit 3|exit code/i.test(activeText)) {
      toolCall('t-exit3', 'Run sh -c exit 3', 'pending', { command: "sh -c 'exit 3'" });
      const terminal = await runTerminal('sh', ['-c', 'exit 3']);
      toolCall('t-exit3', 'Run sh -c exit 3', terminal.exitCode === 0 ? 'failed' : 'completed');
      agentText(`command exited with ${terminal.exitCode}`);
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/simulate rate limit/i.test(activeText)) {
      process.stderr.write('Claude AI usage limit reached. Your session limit resets in 45m.\n');
      respondError(message.id, -32000, 'Session limit reached · resets in 45m');
      return;
    }

    if (/emit directive:/i.test(activeText)) {
      const m = activeText.match(/emit directive:\s*([^\n]+)/i);
      if (m) {
        agentText(`\nExecuting requested action:\n${m[1].trim()}\n`);
      }
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/echo ok/i.test(activeText)) {
      toolCall('t-echo', 'Run echo ok', 'pending', { command: 'echo ok' });
      const terminal = await runTerminal('echo', ['ok']);
      toolCall('t-echo', 'Run echo ok', 'completed');
      agentText(`output: ${terminal.output.trim()} (exit ${terminal.exitCode})`);
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/outside/i.test(activeText)) {
      const permission = await request('session/request_permission', {
        sessionId,
        toolCall: {
          toolCallId: 't-outside',
          title: 'Write outside the workspace',
          kind: 'edit',
          status: 'pending',
          rawInput: { file_path: '../outside/outside.txt', content: 'outside' },
        },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
        ],
      });
      const outcome = permission.result?.outcome;
      const selected = outcome?.outcome === 'selected' ? outcome.optionId : outcome?.outcome;
      agentText(`permission outcome: ${JSON.stringify(outcome)}`);
      if (selected === 'allow-once') {
        const write = await request('fs/write_text_file', {
          sessionId,
          path: join(cwd, '..', 'outside', 'outside.txt'),
          content: 'outside\n',
        });
        agentText(write.error ? `blocked by client: ${write.error.message}` : 'wrote outside file');
      }
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    agentText('no matching fake scenario');
    respond(message.id, { stopReason: 'end_turn' });
  } catch (err) {
    respondError(message.id, -32603, err.message);
  } finally {
    currentPrompt = null;
  }
}

rl.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  // Response to one of our client requests.
  if (message.method === undefined && message.id !== undefined) {
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
    return;
  }
  switch (message.method) {
    case 'initialize':
      respond(message.id, {
        protocolVersion: 1,
        agentCapabilities: { loadSession: process.env.FAKE_LOAD_SESSION === '1', mcpCapabilities: { http: process.env.FAKE_NO_MCP !== '1' } },
        agentInfo: { name: 'fake-acp-agent', title: 'Fake ACP agent (harness self-test)', version: '0.1.0' },
        authMethods: [],
      });
      break;
    case 'session/new':
      mcpServers = message.params?.mcpServers ?? [];
      respond(message.id, {
        sessionId,
        ...(process.env.FAKE_MODEL_ID ? { models: { currentModelId: process.env.FAKE_MODEL_ID, availableModels: [{ modelId: process.env.FAKE_MODEL_ID }] } } : {}),
      });
      break;
    case 'session/load':
      mcpServers = message.params?.mcpServers ?? [];
      sessionId = message.params?.sessionId ?? sessionId;
      agentText(`resumed session: ${sessionId}`);
      respond(message.id, { sessionId });
      break;
    case 'session/prompt':
      handlePrompt(message);
      break;
    case 'session/cancel':
      if (currentPrompt) currentPrompt.cancelled = true;
      break;
    default:
      if (message.id !== undefined) respondError(message.id, -32601, `Method not found: ${message.method}`);
  }
});
