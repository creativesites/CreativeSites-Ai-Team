import path from 'node:path';

/**
 * macOS LaunchAgent for the runtime (programme plan WP6 6.6, vision §10.4).
 *
 * With the agent installed, the runtime starts at login and is restarted if it dies, so the 10:00
 * stand-up and other recurring work run with the desktop window closed. The desktop attaches to a
 * running runtime and only stops one it started itself, so the two coexist. When the Mac is off
 * nothing runs; the scheduler's catch-up reconciles missed slots at next start.
 */

export const LAUNCH_AGENT_LABEL = 'com.creativesites.myaos.runtime';

export interface LaunchAgentOptions {
  /** Absolute path to a Node.js >= 24 binary. */
  node: string;
  /** Absolute path to the `runtime/` folder (contains src/main.ts). */
  runtimeDir: string;
  /** Where logs go (default ~/.myaos/logs). */
  logDir: string;
  /** Extra environment (e.g. PATH so adapters like claude and codex are found). Never put secrets here. */
  env?: Record<string, string>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function launchAgentPlist(o: LaunchAgentOptions): string {
  for (const [name, p] of [['node', o.node], ['runtimeDir', o.runtimeDir], ['logDir', o.logDir]] as const) {
    if (!path.isAbsolute(p)) throw new Error(`${name} must be an absolute path (got ${p})`);
  }
  const env = Object.entries(o.env ?? {})
    .filter(([k]) => /^[A-Z_][A-Z0-9_]*$/i.test(k))
    .map(([k, v]) => `      <key>${esc(k)}</key>\n      <string>${esc(v)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(o.node)}</string>
    <string>${esc(path.join(o.runtimeDir, 'src', 'main.ts'))}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${esc(o.runtimeDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${esc(path.join(o.logDir, 'runtime.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${esc(path.join(o.logDir, 'runtime.err.log'))}</string>${
    env
      ? `
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>`
      : ''
  }
</dict>
</plist>
`;
}

/** `launchctl` arguments for each action on the current user's GUI domain. */
export function launchctlArgs(action: 'install' | 'uninstall' | 'status', uid: number, plistPath: string): string[] {
  const domain = `gui/${uid}`;
  switch (action) {
    case 'install':
      return ['bootstrap', domain, plistPath];
    case 'uninstall':
      return ['bootout', `${domain}/${LAUNCH_AGENT_LABEL}`];
    case 'status':
      return ['print', `${domain}/${LAUNCH_AGENT_LABEL}`];
  }
}
