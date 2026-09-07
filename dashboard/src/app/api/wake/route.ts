import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import path from 'path';

// Real wake attempt through the actual CLI (bin/myaos.js wake <agent>) - the
// same code path a human running `mya wake` gets, not a simulated result.
// For interactive-ide agents (Atlas/Vela/Iris/Astra) this can only ever
// succeed if a live IDE socket is already open - the adapter has no way to
// launch or notify an IDE window (see src/runtime/interactiveIdeAdapter.js
// send(): "IDE requires SendMessage tool or in-turn dispatch"). We report
// that truthfully instead of hiding it.

export async function POST(request: Request) {
  try {
    const { agent } = await request.json();
    if (!agent) {
      return NextResponse.json({ error: 'agent is required' }, { status: 400 });
    }

    const baseDir = path.resolve(process.cwd(), '..');
    const scriptPath = path.join(baseDir, 'bin', 'myaos.js');

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(process.execPath, [scriptPath, 'wake', agent], {
        cwd: baseDir,
        encoding: 'utf8',
        timeout: 15000,
      });
    } catch (e: any) {
      stdout = e.stdout ? e.stdout.toString() : '';
      stderr = e.stderr ? e.stderr.toString() : e.message;
      exitCode = typeof e.status === 'number' ? e.status : 1;
    }

    const failed = exitCode !== 0 || !/Status = AGENT_ACTIVE/.test(stdout);
    const honestNote = failed
      ? 'Wake did not succeed. A .wake token may still have been written to the agent inbox in case it is opened manually later, but no live process was actually started or notified.'
      : 'The CLI reported a runtime start/observation. This does NOT confirm the agent will do correct or complete work - only that a runtime is now running or was already running.';

    return NextResponse.json({ exitCode, stdout, stderr, failed, honestNote });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
