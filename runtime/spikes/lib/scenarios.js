// The fixed Phase 0.6 scenario set. Each scenario is one session/prompt turn.
//
// The workspace is a fresh throwaway directory under /tmp; `edit.txt` is seeded
// before the run. `../outside/` is a sibling directory outside the advertised
// workspace, used for the permission scenario.

export const SCENARIOS = [
  {
    id: 'create-file',
    title: 'Create a file',
    prompt:
      'Create a file named created.txt in the current working directory containing exactly this line: hello from acp spike. Use a file write tool. Do not run shell commands. Reply DONE when finished.',
    probe: 'Does the write arrive as fs/write_text_file (Observed) or only as a tool_call/diff (Attested)?',
  },
  {
    id: 'edit-file',
    title: 'Edit an existing file',
    prompt:
      'The current working directory contains edit.txt. Append a second line "line two" to edit.txt using a file edit tool. Do not run shell commands. Reply DONE when finished.',
    probe: 'Does the read+write arrive as fs/read_text_file + fs/write_text_file (Observed)?',
  },
  {
    id: 'command-exit-0',
    title: 'Run a command that exits 0',
    prompt:
      'Run the shell command `echo ok` in the current working directory. Report its output. Reply DONE when finished.',
    probe: 'Does the command arrive as terminal/create (Observed exit code) or only as a tool_call?',
  },
  {
    id: 'command-exit-nonzero',
    title: 'Run a command that exits non-zero',
    prompt:
      "Run the shell command `sh -c 'exit 3'` in the current working directory and report the exit code. Reply DONE when finished.",
    probe: 'Do we observe a real exit code 3 (terminal/wait_for_exit) or only the agent’s claim?',
  },
  {
    id: 'outside-workspace-write',
    title: 'Permission for a write outside the workspace',
    prompt:
      'Write the text "outside" to the file ../outside/outside.txt relative to the current working directory, using a file write tool. Do not run shell commands. Reply DONE when finished.',
    rejectPermissions: true,
    probe: 'Does the adapter call session/request_permission? What options does it offer? What does it do after reject?',
  },
  {
    id: 'cancel-mid-turn',
    title: 'Cancel mid-turn',
    prompt:
      'Run the shell command `sleep 20` in the current working directory, wait for it to finish, then report done.',
    cancelAfterMs: 5000,
    timeoutMs: 60000,
    probe: 'Does session/cancel produce stopReason "cancelled", and do any child processes survive?',
  },
];

export function pickScenarios(selection) {
  if (!selection || selection === 'all') return SCENARIOS;
  const wanted = new Set(
    String(selection)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return SCENARIOS.filter((scenario) => wanted.has(scenario.id) || wanted.has(String(SCENARIOS.indexOf(scenario) + 1)));
}
