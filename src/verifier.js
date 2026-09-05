const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class VerificationEngine {
  constructor(taskManager, eventBus) {
    this.taskManager = taskManager;
    this.eventBus = eventBus;
  }

  verifyTaskArtifacts(taskId, verifierName, { requiredFiles = [], testCommand = null, cwd = process.cwd() } = {}) {
    const task = this.taskManager.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const startTime = Date.now();
    const missingFiles = [];
    const verifiedFiles = [];

    // 1. Check required files
    for (const relPath of requiredFiles) {
      const fullPath = path.resolve(cwd, relPath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0) {
        verifiedFiles.push(relPath);
      } else {
        missingFiles.push(relPath);
      }
    }

    let commandResult = { exit_code: 0, output: 'No test command executed' };

    // 2. Execute test command if provided
    if (testCommand) {
      try {
        const stdout = execSync(testCommand, { cwd, encoding: 'utf8', timeout: 30000 });
        commandResult = { exit_code: 0, output: stdout.trim() };
      } catch (err) {
        commandResult = { exit_code: err.status || 1, output: (err.stdout || '') + (err.stderr || '') };
      }
    }

    const passed = missingFiles.length === 0 && commandResult.exit_code === 0;
    const duration = Date.now() - startTime;

    const evidence = {
      passed,
      exit_code: commandResult.exit_code,
      duration_ms: duration,
      verified_files: verifiedFiles,
      missing_files: missingFiles,
      command_output: commandResult.output.slice(0, 1000)
    };

    this.taskManager.recordVerification(taskId, verifierName, evidence);

    return evidence;
  }
}

module.exports = VerificationEngine;
