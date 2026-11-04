import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LAUNCH_AGENT_LABEL, launchAgentPlist, launchctlArgs } from '../src/launchagent.ts';

const base = { node: '/usr/local/bin/node', runtimeDir: '/Users/x/CreativeSites-Ai-Team/runtime', logDir: '/Users/x/.myaos/logs' };

test('plist is well-formed XML with the label, the runtime command, restart and logs', () => {
  const xml = launchAgentPlist({ ...base, env: { PATH: '/opt/homebrew/bin:/usr/bin', EMPTY: '' } });
  assert.match(xml, new RegExp(`<string>${LAUNCH_AGENT_LABEL}</string>`));
  assert.match(xml, /<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/Users\/x\/CreativeSites-Ai-Team\/runtime\/src\/main\.ts<\/string>/);
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(xml, /<key>SuccessfulExit<\/key>\s*<false\/>/);
  assert.match(xml, /runtime\.err\.log/);
  assert.match(xml, /<key>PATH<\/key>\s*<string>\/opt\/homebrew\/bin:\/usr\/bin<\/string>/);
  // Parse it with a real plist parser when one is available (python3 ships plistlib).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-plist-'));
  try {
    const f = path.join(dir, 'a.plist');
    fs.writeFileSync(f, xml);
    const out = execFileSync('python3', ['-c', 'import plistlib,sys,json;d=plistlib.load(open(sys.argv[1],"rb"));print(json.dumps([d["Label"],d["ProgramArguments"],d["KeepAlive"]]))', f], { encoding: 'utf8' });
    const [label, args, keep] = JSON.parse(out);
    assert.equal(label, LAUNCH_AGENT_LABEL);
    assert.equal(args.length, 2);
    assert.deepEqual(keep, { SuccessfulExit: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('XML special characters in paths and env are escaped', () => {
  const xml = launchAgentPlist({ ...base, runtimeDir: '/Users/a&b/<x>/runtime', env: { NOTE: 'a "q" & <b>' } });
  assert.ok(!xml.includes('a&b'));
  assert.ok(xml.includes('a&amp;b'));
  assert.ok(xml.includes('&lt;x&gt;'));
  assert.ok(xml.includes('a &quot;q&quot; &amp; &lt;b&gt;'));
});

test('relative paths are refused and launchctl arguments target the user GUI domain', () => {
  assert.throws(() => launchAgentPlist({ ...base, node: 'node' }), /absolute/);
  assert.deepEqual(launchctlArgs('install', 501, '/p.plist'), ['bootstrap', 'gui/501', '/p.plist']);
  assert.deepEqual(launchctlArgs('uninstall', 501, '/p.plist'), ['bootout', `gui/501/${LAUNCH_AGENT_LABEL}`]);
  assert.deepEqual(launchctlArgs('status', 501, '/p.plist'), ['print', `gui/501/${LAUNCH_AGENT_LABEL}`]);
});
