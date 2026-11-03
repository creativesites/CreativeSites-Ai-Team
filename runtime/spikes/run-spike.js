#!/usr/bin/env node
// Phase 0.6 ACP probe harness.
//
// Usage:
//   node run-spike.js --adapter claude            # one adapter, all six scenarios
//   node run-spike.js --adapter gemini
//   node run-spike.js --adapter all               # claude, gemini, codex, dsh
//   node run-spike.js --adapter fake              # harness self-test (not an adapter)
//   node run-spike.js --probe                     # environment facts only
//   node run-spike.js --adapter claude --scenarios create-file,cancel-mid-turn
//
// Everything is written under runtime/spikes/runs/<stamp>-<adapter>/.
// Scratch workspaces live under /tmp/myaos-acp-spike/ and are left behind for
// inspection (the run summary prints the path).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AcpClient } from './lib/acp-client.js';
import { SpikeLog } from './lib/log.js';
import { delay } from './lib/jsonrpc.js';
import { processEnumerationSupport, sampleDescendants, survivors } from './lib/processes.js';
import { redact, sha256 } from './lib/redact.js';
import { SCENARIOS, pickScenarios } from './lib/scenarios.js';
import { adapterDefs, collectEnvironment, SPIKES_DIR } from './lib/adapters.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(HERE, 'runs');
const TMP_ROOT = '/tmp/myaos-acp-spike';

// ------------------------------------------------------------------ utilities

function parseArgs(argv) {
  const options = {
    adapter: 'all',
    scenarios: 'all',
    maxMinutes: 15,
    promptTimeoutMs: 180000,
    initTimeoutMs: 60000,
    probe: false,
    clean: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--adapter':
      case '-a':
        options.adapter = argv[++i];
        break;
      case '--scenarios':
      case '-s':
        options.scenarios = argv[++i];
        break;
      case '--max-minutes':
        options.maxMinutes = Number(argv[++i]);
        break;
      case '--prompt-timeout-ms':
        options.promptTimeoutMs = Number(argv[++i]);
        break;
      case '--init-timeout-ms':
        options.initTimeoutMs = Number(argv[++i]);
        break;
      case '--probe':
        options.probe = true;
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(2);
    }
  }
  return options;
}

function printHelp() {
  console.log(`ACP spike harness — Phase 0.6

  node run-spike.js [options]

  --adapter, -a      claude | gemini | codex | dsh | fake | all   (default: all)
  --scenarios, -s    comma list of ids or 1-6, or "all"           (default: all)
  --max-minutes      per-adapter wall clock cap                   (default: 15)
  --prompt-timeout-ms per-turn timeout                            (default: 180000)
  --init-timeout-ms  initialize/session/new timeout               (default: 60000)
  --probe            only collect environment facts and adapter availability
  --clean            remove /tmp/myaos-acp-spike before running
  --help, -h         this text

Scenario ids: ${SCENARIOS.map((scenario) => scenario.id).join(', ')}`);
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function snapshot(root) {
  const files = {};
  const walk = (dir, relativeBase) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relativePath);
      } else if (entry.isFile()) {
        try {
          const buffer = readFileSync(absolute);
          files[relativePath] = {
            bytes: buffer.length,
            sha256: sha256(buffer),
            mtimeMs: Number(statSync(absolute).mtimeMs.toFixed(0)),
          };
        } catch {
          /* unreadable file: omitted from the snapshot */
        }
      }
    }
  };
  walk(root, '');
  return files;
}

function diffSnapshots(before, after) {
  const added = [];
  const removed = [];
  const modified = [];
  for (const [path, entry] of Object.entries(after)) {
    if (!(path in before)) added.push({ path, ...entry, how: 'unobservable-from-snapshot' });
    else if (before[path].sha256 !== entry.sha256) modified.push({ path, before: before[path], after: entry });
  }
  for (const [path, entry] of Object.entries(before)) {
    if (!(path in after)) removed.push({ path, ...entry });
  }
  return { added, removed, modified };
}

function capabilityUseFromStats(stats) {
  return {
    fsRead: stats.calls.fsRead.length,
    fsWrite: stats.calls.fsWrite.length,
    terminalCreate: stats.calls.terminal.length,
    permissionRequests: stats.calls.permission.length,
    otherClientMethods: stats.calls.otherMethods.map((entry) => entry.method),
  };
}

function aggregateUsage(scenarios) {
  const totals = { fsRead: 0, fsWrite: 0, terminalCreate: 0, permissionRequests: 0, otherClientMethods: [] };
  for (const scenario of scenarios) {
    if (!scenario.capabilityUse) continue;
    totals.fsRead += scenario.capabilityUse.fsRead;
    totals.fsWrite += scenario.capabilityUse.fsWrite;
    totals.terminalCreate += scenario.capabilityUse.terminalCreate;
    totals.permissionRequests += scenario.capabilityUse.permissionRequests;
    totals.otherClientMethods.push(...scenario.capabilityUse.otherClientMethods);
  }
  totals.otherClientMethods = [...new Set(totals.otherClientMethods)];
  return totals;
}

// --------------------------------------------------------------------- probe

function runProbe() {
  const defs = adapterDefs();
  const result = {
    capturedAt: new Date().toISOString(),
    environment: collectEnvironment(),
    adapters: {},
  };
  for (const [name, def] of Object.entries(defs)) {
    if (def.hidden) continue;
    const blocked = def.blocked();
    result.adapters[name] = {
      label: def.label,
      command: def.command() ?? null,
      args: def.args ?? [],
      available: blocked === null,
      blocked,
      probe: def.probe?.() ?? null,
    };
  }
  mkdirSync(RUNS_DIR, { recursive: true });
  const file = join(RUNS_DIR, `probe-${stampNow()}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nwrote ${file}`);
  return result;
}

// ---------------------------------------------------------------- one adapter

async function runAdapter(name, options) {
  const defs = adapterDefs();
  const def = defs[name];
  if (!def) throw new Error(`Unknown adapter: ${name}`);

  const stamp = stampNow();
  const runDir = join(RUNS_DIR, `${stamp}-${name}`);
  const log = new SpikeLog(runDir);
  const blocked = def.blocked();

  const summary = {
    adapter: name,
    label: def.label,
    startedAt: new Date().toISOString(),
    blocked,
    command: def.command() ?? null,
    args: def.args ?? [],
    environment: collectEnvironment(),
  };

  if (blocked) {
    summary.skipped = true;
    summary.reason = blocked;
    summary.endedAt = new Date().toISOString();
    log.writeJson('summary.json', summary);
    console.log(`\n[${name}] SKIPPED — ${blocked.code}\n  ${blocked.detail}`);
    return summary;
  }

  const root = join(TMP_ROOT, `${stamp}-${name}`);
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(workspace, 'edit.txt'), 'line one\n');

  summary.spikeRoot = root;
  summary.workspace = workspace;
  summary.runDir = runDir;
  summary.session = null;
  summary.scenarios = [];
  summary.shutdown = null;
  summary.orphans = null;

  log.writeJson('run.json', {
    adapter: name,
    label: def.label,
    command: summary.command,
    args: summary.args,
    cwd: workspace,
    spikeRoot: root,
    environment: summary.environment,
    startedAt: summary.startedAt,
  });

  const client = new AcpClient({
    name,
    command: summary.command,
    args: summary.args,
    cwd: workspace,
    env: { ...process.env, MYAOS_ACP_SPIKE_RUN: `${stamp}-${name}` },
    log,
    workspaceRoot: workspace,
    spikeRoot: root,
    promptTimeoutMs: options.promptTimeoutMs,
    initTimeoutMs: options.initTimeoutMs,
  });

  const scenarios = pickScenarios(options.scenarios);
  const deadline = Date.now() + options.maxMinutes * 60 * 1000;
  const trackedPids = new Set();
  const samplePids = () => {
    const sample = sampleDescendants(client.peer.pid);
    for (const entry of sample) trackedPids.add(entry.pid);
    if (client.peer.pid) trackedPids.add(client.peer.pid);
    return sample;
  };

  try {
    client.start();
    samplePids();
    summary.initialize = await client.initialize();
    summary.initializeSummary = {
      protocolVersion: summary.initialize?.protocolVersion ?? null,
      agentInfo: summary.initialize?.agentInfo ?? null,
      agentCapabilities: summary.initialize?.agentCapabilities ?? null,
      authMethods: summary.initialize?.authMethods ?? [],
    };
    summary.sessionResult = await client.newSession(workspace);
    summary.session = {
      sessionId: client.sessionId,
      resultKeys: summary.sessionResult && typeof summary.sessionResult === 'object'
        ? Object.keys(summary.sessionResult)
        : [],
    };
  } catch (err) {
    summary.fatal = { phase: 'initialize-or-session', message: err.message, code: err.code ?? null };
    log.event('adapter/fatal', summary.fatal);
    await finalize();
    return summary;
  }

  for (const scenario of scenarios) {
    if (Date.now() > deadline) {
      summary.scenarios.push({ id: scenario.id, skipped: 'adapter-time-budget-exceeded' });
      continue;
    }
    client.resetScenarioStats();
    client.setScenario({ scenarioId: scenario.id, rejectPermissions: Boolean(scenario.rejectPermissions) });

    const startedAt = Date.now();
    const before = { workspace: snapshot(workspace), outside: snapshot(outside) };
    const record = {
      id: scenario.id,
      title: scenario.title,
      prompt: scenario.prompt,
      probeQuestion: scenario.probe,
      startedAt: new Date(startedAt).toISOString(),
      promptResult: null,
      cancel: null,
    };

    try {
      const promptPromise = client.prompt(scenario.prompt, {
        timeoutMs: scenario.timeoutMs ?? options.promptTimeoutMs,
      });
      // A cancel timer may be pending when the turn fails: handle the rejection
      // here so a fast failure cannot crash the runner before we await it.
      promptPromise.catch(() => {});
      if (scenario.cancelAfterMs) {
        await delay(scenario.cancelAfterMs);
        record.cancel = { sentAt: new Date().toISOString(), sentAfterMs: Date.now() - startedAt };
        await client.cancel();
      }
      const { result, ms } = await promptPromise;
      record.promptResult = {
        ok: true,
        stopReason: result?.stopReason ?? null,
        ms,
        result: redact(result, { maxLen: 800, maxItems: 30 }),
      };
      if (scenario.cancelAfterMs) {
        record.cancel.respondedAt = new Date().toISOString();
        record.cancel.respondedAfterMs = Date.now() - startedAt;
        record.cancel.stopReason = result?.stopReason ?? null;
      }
    } catch (err) {
      record.promptResult = { ok: false, error: err.message, code: err.code ?? null };
    }

    record.durationMs = Date.now() - startedAt;
    const after = { workspace: snapshot(workspace), outside: snapshot(outside) };
    record.mutations = {
      workspace: diffSnapshots(before.workspace, after.workspace),
      outside: diffSnapshots(before.outside, after.outside),
    };
    const stats = client.stats();
    record.capabilityUse = capabilityUseFromStats(stats);
    record.calls = stats.calls;
    record.updates = stats.updates;
    record.toolCalls = stats.toolCalls;
    record.terminals = stats.terminals;
    record.terminalResults = stats.terminalResults;
    record.clientMethodsSeen = Object.keys(stats.calls).filter(
      (key) => Array.isArray(stats.calls[key]) && stats.calls[key].length > 0,
    );
    record.agentTextTail = stats.lastAgentText.slice(-1500);
    record.descendantsAfterScenario = samplePids();
    summary.scenarios.push(record);
    log.writeJson(`scenario-${scenario.id}.json`, record);
    log.event('scenario/result', {
      id: scenario.id,
      stopReason: record.promptResult?.stopReason ?? null,
      ok: record.promptResult?.ok ?? false,
      capabilityUse: record.capabilityUse,
      workspaceMutations: record.mutations.workspace,
      outsideMutations: record.mutations.outside,
    });
    console.log(
      `  [${name}] ${scenario.id}: ${
        record.promptResult.ok ? `stopReason=${record.promptResult.stopReason}` : `failed (${record.promptResult.error})`
      } | client calls fs.read=${record.capabilityUse.fsRead} fs.write=${record.capabilityUse.fsWrite} terminal=${record.capabilityUse.terminalCreate} permission=${record.capabilityUse.permissionRequests} | workspace +${
        record.mutations.workspace.added.length
      } ~${record.mutations.workspace.modified.length}`,
    );
  }

  const exit = await client.close();
  summary.shutdown = { ...exit, stderrTail: client.peer.stderrSummary(15) };
  await delay(1500);
  const alive = survivors([...trackedPids]);
  summary.processSampling = processEnumerationSupport();
  summary.orphans = {
    trackedPids: trackedPids.size,
    survivors: alive,
    method: summary.processSampling.method,
  };
  summary.capabilityUse = aggregateUsage(summary.scenarios);
  summary.endedAt = new Date().toISOString();
  summary.verdict = summarizeVerdict(summary);
  log.writeJson('summary.json', summary);
  log.event('adapter/done', { verdict: summary.verdict, orphans: summary.orphans });

  console.log(`  [${name}] shutdown: exit=${JSON.stringify(summary.shutdown)} orphans=${alive.length}`);
  console.log(`  [${name}] wrote ${runDir}`);
  return summary;

  async function finalize() {
    const exit = await client.close();
    summary.shutdown = { ...exit, stderrTail: client.peer.stderrSummary(15) };
    await delay(1500);
    summary.processSampling = processEnumerationSupport();
    summary.orphans = {
      trackedPids: trackedPids.size,
      survivors: survivors([...trackedPids]),
      method: summary.processSampling.method,
    };
    summary.capabilityUse = aggregateUsage(summary.scenarios);
    summary.endedAt = new Date().toISOString();
    summary.verdict = summarizeVerdict(summary);
    log.writeJson('summary.json', summary);
    console.log(`  [${name}] fatal: ${summary.fatal.message}`);
    console.log(`  [${name}] wrote ${runDir}`);
  }
}

function summarizeVerdict(summary) {
  const scenarios = summary.scenarios;
  const byId = Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario]));
  const cancelScenario = byId['cancel-mid-turn'];
  const outsideScenario = byId['outside-workspace-write'];
  return {
    sessionStarted: Boolean(summary.session?.sessionId),
    promptsCompleted: scenarios.filter((scenario) => scenario.promptResult?.ok).length,
    promptsFailed: scenarios.filter((scenario) => scenario.promptResult && !scenario.promptResult.ok).length,
    clientObservedFileWrites: summary.capabilityUse?.fsWrite ?? 0,
    clientObservedFileReads: summary.capabilityUse?.fsRead ?? 0,
    clientObservedTerminalCommands: summary.capabilityUse?.terminalCreate ?? 0,
    permissionRequests: summary.capabilityUse?.permissionRequests ?? 0,
    cancelStopReason: cancelScenario?.cancel?.stopReason ?? cancelScenario?.promptResult?.stopReason ?? null,
    cancelAtMs: cancelScenario?.cancel?.sentAfterMs ?? null,
    outsideWorkspaceTouchedByAgent: Boolean(outsideScenario?.mutations?.outside?.added?.length),
    orphanSurvivors: summary.orphans?.survivors?.length ?? null,
    orphanDetectionMethod: summary.orphans?.method ?? 'unknown',
  };
}

// ----------------------------------------------------------------------- main

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.clean && existsSync(TMP_ROOT)) {
    execFileSync('rm', ['-rf', TMP_ROOT]); // scratch dir under /tmp only
    console.log(`removed ${TMP_ROOT}`);
  }

  if (options.probe) {
    runProbe();
    return;
  }

  const env = collectEnvironment();
  mkdirSync(RUNS_DIR, { recursive: true });
  console.log('ACP spike — Phase 0.6');
  console.log(
    `node ${env.node} | claude ${JSON.stringify(env.tools.claude.version)} | gemini ${JSON.stringify(
      env.tools.gemini.version,
    )} | codex ${env.tools.codex.path ? 'present' : 'absent'} | dsh ${env.tools.dsh.path ? 'present' : 'absent'}`,
  );

  const defs = adapterDefs();
  const requested = options.adapter === 'all' ? ['claude', 'gemini', 'codex', 'dsh'] : [options.adapter];
  for (const name of requested) {
    if (!defs[name]) {
      console.error(`Unknown adapter: ${name}`);
      process.exit(2);
    }
  }

  const summaries = [];
  for (const name of requested) {
    console.log(`\n=== ${name} ===`);
    summaries.push(await runAdapter(name, options));
  }

  const matrix = {
    capturedAt: new Date().toISOString(),
    environment: env,
    adapters: Object.fromEntries(summaries.map((summary) => [summary.adapter, summary])),
  };
  const matrixFile = join(RUNS_DIR, 'matrix.json');
  writeFileSync(matrixFile, `${JSON.stringify(matrix, null, 2)}\n`);
  console.log(`\nwrote ${matrixFile}`);
  printTable(summaries);
}

function printTable(summaries) {
  console.log('\nAdapter matrix (Observed = client method actually called by the adapter)');
  for (const summary of summaries) {
    if (summary.blocked) {
      console.log(`\n${summary.adapter.padEnd(8)} BLOCKED ${summary.blocked.code}`);
      console.log(`         ${summary.blocked.detail}`);
      continue;
    }
    const usage = summary.capabilityUse ?? {};
    const verdict = summary.verdict ?? {};
    const scenarioLines = summary.scenarios
      .map((scenario) => {
        if (scenario.skipped) return `    - ${scenario.id}: skipped (${scenario.skipped})`;
        const stop = scenario.promptResult?.ok ? scenario.promptResult.stopReason : `ERROR ${scenario.promptResult?.error}`;
        const caps = scenario.capabilityUse
          ? `fsRead=${scenario.capabilityUse.fsRead} fsWrite=${scenario.capabilityUse.fsWrite} terminal=${scenario.capabilityUse.terminalCreate} permission=${scenario.capabilityUse.permissionRequests}`
          : '';
        return `    - ${scenario.id.padEnd(24)} ${String(stop).padEnd(12)} ${caps}`;
      })
      .join('\n');
    console.log(`\n${summary.adapter.padEnd(8)} ${summary.label}`);
    console.log(`         session: ${summary.session?.sessionId ?? '(none)'} | protocol: ${summary.initializeSummary?.protocolVersion ?? '?'} | authMethods: ${(summary.initializeSummary?.authMethods ?? []).length}`);
    console.log(`         client-observed totals: fsRead=${usage.fsRead ?? 0} fsWrite=${usage.fsWrite ?? 0} terminal=${usage.terminalCreate ?? 0} permission=${usage.permissionRequests ?? 0}`);
    console.log(`         cancel stopReason: ${verdict.cancelStopReason} | orphans: ${summary.orphans?.survivors?.length ?? '?'}`);
    console.log(scenarioLines);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
