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

const sessionId = 'fake-session-1';

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

async function handlePrompt(message) {
  const promptText = (message.params?.prompt ?? [])
    .map((part) => (part?.type === 'text' ? part.text : ''))
    .join('\n');
  currentPrompt = { id: message.id, cancelled: false };
  agentText('working');
  try {
    if (/sleep/i.test(promptText)) {
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

    if (/create a file/i.test(promptText)) {
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

    if (/edit\.txt/i.test(promptText)) {
      toolCall('t-edit', 'Edit edit.txt', 'pending', { file_path: join(cwd, 'edit.txt') });
      const read = await request('fs/read_text_file', { sessionId, path: join(cwd, 'edit.txt') });
      const content = read.result?.content ?? '';
      const next = content.endsWith('\n') ? `${content}line two\n` : `${content}\nline two\n`;
      const write = await request('fs/write_text_file', { sessionId, path: join(cwd, 'edit.txt'), content: next });
      toolCall('t-edit', 'Edit edit.txt', write.error ? 'failed' : 'completed');
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/exit 3|exit code/i.test(promptText)) {
      toolCall('t-exit3', 'Run sh -c exit 3', 'pending', { command: "sh -c 'exit 3'" });
      const terminal = await runTerminal('sh', ['-c', 'exit 3']);
      toolCall('t-exit3', 'Run sh -c exit 3', terminal.exitCode === 0 ? 'failed' : 'completed');
      agentText(`command exited with ${terminal.exitCode}`);
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/simulate rate limit/i.test(promptText)) {
      process.stderr.write('Claude AI usage limit reached. Your session limit resets in 45m.\n');
      respondError(message.id, -32000, 'Session limit reached · resets in 45m');
      return;
    }

    if (/emit directive:/i.test(promptText)) {
      const m = promptText.match(/emit directive:\s*([^\n]+)/i);
      if (m) {
        agentText(`\nExecuting requested action:\n${m[1].trim()}\n`);
      }
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/echo ok/i.test(promptText)) {
      toolCall('t-echo', 'Run echo ok', 'pending', { command: 'echo ok' });
      const terminal = await runTerminal('echo', ['ok']);
      toolCall('t-echo', 'Run echo ok', 'completed');
      agentText(`output: ${terminal.output.trim()} (exit ${terminal.exitCode})`);
      respond(message.id, { stopReason: 'end_turn' });
      return;
    }

    if (/outside/i.test(promptText)) {
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
        agentCapabilities: { loadSession: false },
        agentInfo: { name: 'fake-acp-agent', title: 'Fake ACP agent (harness self-test)', version: '0.1.0' },
        authMethods: [],
      });
      break;
    case 'session/new':
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
