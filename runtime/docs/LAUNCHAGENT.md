# Running the runtime in the background (macOS LaunchAgent)

With the LaunchAgent installed, the runtime starts at login and is restarted if it exits, so the
scheduler (the 10:00 Africa/Lusaka stand-up, stale-task sweeps, weekly reviews) runs with the
desktop window closed. When the Mac is off nothing runs; at the next start the scheduler's catch-up
records and runs the latest missed slot.

```
node runtime/scripts/launchagent.ts install     # needs Node 24+ (set MYAOS_NODE if your default is older)
node runtime/scripts/launchagent.ts status
node runtime/scripts/launchagent.ts uninstall
node runtime/scripts/launchagent.ts print       # show the plist without installing
```

- The agent runs `runtime/src/main.ts` with the PATH you installed it from, so adapters such as
  `claude`, `codex` and `gemini` are found. Re-run `install` after changing where they live.
- The desktop attaches to a running runtime and only stops one it started itself, so the two coexist.
- Logs: `~/.myaos/logs/runtime.out.log` and `runtime.err.log`.
- Nothing here stores a secret: the plist holds paths and PATH only. The API token stays in
  `~/.myaos/runtime.json` (owner-only), and owner actions still need the owner key.
- Not verified in the build environment (Linux): `launchctl bootstrap/bootout` itself. The plist is
  generated and validated as XML by tests; the first real install is on the owner's Mac.
