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

    const hasMachineEvidence = (requiredFiles.length > 0) || Boolean(testCommand);
    let status = 'UNKNOWN';
    let resolution = 'UNRESOLVED';
    let passed = false;
    let reason = '';

    if (!hasMachineEvidence) {
      status = 'UNKNOWN';
      resolution = 'UNRESOLVED';
      passed = false;
      reason = 'INSUFFICIENT_EVIDENCE: Neither artifact existence nor test command provided for verification. System refuses to infer state.';
    } else if (missingFiles.length > 0 || (testCommand && commandResult.exit_code !== 0)) {
      status = 'FAILED';
      resolution = 'RESOLVED_FAIL';
      passed = false;
      reason = 'Machine-observed verification checks failed.';
    } else {
      status = 'VERIFIED';
      resolution = 'RESOLVED_PASS';
      passed = true;
      reason = 'All machine-observed verification checks passed with exit code 0 and valid artifacts.';
    }

    const duration = Date.now() - startTime;

    const evidence = {
      status,
      resolution,
      passed,
      reason,
      exit_code: commandResult.exit_code,
      duration_ms: duration,
      verified_files: verifiedFiles,
      missing_files: missingFiles,
      command_output: commandResult.output.slice(0, 1000),
      evidenceClass: hasMachineEvidence ? 'OBSERVED_MACHINE' : 'INSUFFICIENT'
    };

    this.taskManager.recordVerification(taskId, verifierName, evidence);

    return evidence;
  }
}

module.exports = VerificationEngine;
