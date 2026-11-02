import test from 'node:test';
import assert from 'node:assert/strict';
import { probeAdapters, adapterInfo, ADAPTER_PRESETS } from '../src/adapters.ts';
import { Orchestrator } from '../src/orchestrator.ts';

test('antigravity adapter is registered as a first-class AI provider preset', () => {
  const preset = ADAPTER_PRESETS.find((p) => p.id === 'antigravity');
  assert.ok(preset, 'Antigravity preset must exist in ADAPTER_PRESETS');
  assert.equal(preset.name, 'Antigravity');
  assert.equal(preset.command, 'antigravity');
  assert.deepEqual(preset.args, ['--acp']);
  assert.ok(preset.aliases.includes('agy'));
  assert.ok(preset.aliases.includes('antigravity-ide'));
});

test('probeAdapters includes antigravity with probed installation and auth info', () => {
  const adapters = probeAdapters(true);
  const ag = adapters.find((a) => a.id === 'antigravity');
  assert.ok(ag, 'Antigravity must be reported in probeAdapters');
  assert.equal(ag.id, 'antigravity');
  assert.equal(ag.command, 'antigravity');
  assert.deepEqual(ag.args, ['--acp']);
  assert.ok(typeof ag.installed === 'boolean');
  assert.ok(ag.auth, 'Auth info must be present');
  assert.ok(['ready', 'configured', 'missing_binary', 'needs_login'].includes(ag.auth.state));

  const direct = adapterInfo('antigravity', true);
  assert.ok(direct, 'adapterInfo("antigravity") must return adapter details');
  assert.equal(direct.id, 'antigravity');
});

test('orchestrator infers antigravity adapter and runtime label properly', async () => {
  const mockRepo = {
    listAdapterOverrides: () => [],
    listIdentities: () => [],
  };
  const orchestrator = new Orchestrator({
    repo: mockRepo as any,
    sessions: { setHooks: () => {} } as any,
    checker: {} as any,
  });

  // Infer adapter from various strings
  assert.equal((orchestrator as any).inferAdapterFromRuntime('Antigravity'), 'antigravity');
  assert.equal((orchestrator as any).inferAdapterFromRuntime('antigravity --acp'), 'antigravity');
  assert.equal((orchestrator as any).inferAdapterFromRuntime('agy'), 'antigravity');
  assert.equal((orchestrator as any).inferAdapterFromRuntime('gemini --acp'), 'gemini');
  assert.equal((orchestrator as any).inferAdapterFromRuntime('claude-agent-acp'), 'claude');
});
