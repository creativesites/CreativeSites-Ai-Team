const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EVIDENCE_CLASSES } = require('./provenance');

class VerificationEngine {
  constructor(taskManager, eventBus, options = {}) {
    this.taskManager = taskManager;
    this.eventBus = eventBus;
    this.provenance = options.provenance || null;
  }

  verifyTaskArtifacts(taskId, verifierName, { requiredFiles = [], testCommand = null, cwd = process.cwd() } = {}) {
    const task = this.taskManager.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const startTime = Date.now();
    const missingFiles = [];
    const verifiedFiles = [];

    // Check 1: Invariant - Claimant cannot be their own independent verifier
    const claimant = task.assignee || task.worker;
    if (claimant && verifierName && claimant.toLowerCase().trim() === verifierName.toLowerCase().trim()) {
      const selfRejection = {
        status: 'UNKNOWN',
        resolution: 'UNRESOLVED',
        passed: false,
        reason: 'SELF_VERIFICATION_REJECTED: An agent cannot act as its own independent verifier.',
        duration_ms: Date.now() - startTime,
        evidenceClass: EVIDENCE_CLASSES.UNKNOWN
      };
      this.taskManager.recordVerification(taskId, verifierName, selfRejection);
      return selfRejection;
    }

    // Check 2: Artifact existence on disk
    for (const relPath of requiredFiles) {
      const fullPath = path.resolve(cwd, relPath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0) {
        verifiedFiles.push(relPath);
      } else {
        missingFiles.push(relPath);
      }
    }

    let commandResult = { exit_code: 0, output: 'No test command executed', isExecError: false };

    // Check 3: Execute independent test command if provided
    if (testCommand) {
      try {
        const stdout = execSync(testCommand, { cwd, encoding: 'utf8', timeout: 30000 });
        commandResult = { exit_code: 0, output: stdout.trim(), isExecError: false };
      } catch (err) {
        // Distinguish system execution error (e.g. missing command/binary) from test assertion failure
        const output = (err.stdout || '') + (err.stderr || '') + (err.message || '');
        const isSystemError = err.code === 'ENOENT' || 
                              err.killed || 
                              err.status === 127 || 
                              err.status === 126 || 
                              /not found|No such file or directory/i.test(output);
        commandResult = {
          exit_code: err.status !== undefined ? err.status : 1,
          output,
          isExecError: isSystemError
        };
      }
    }

    const hasMachineEvidence = (requiredFiles.length > 0) || Boolean(testCommand);
    let status = 'UNKNOWN';
    let resolution = 'UNRESOLVED';
    let passed = false;
    let reason = '';
    let evidenceClass = EVIDENCE_CLASSES.UNKNOWN;

    if (!hasMachineEvidence) {
      // INSUFFICIENT EVIDENCE: Fail toward UNKNOWN
      status = 'UNKNOWN';
      resolution = 'UNRESOLVED';
      passed = false;
      reason = 'INSUFFICIENT_EVIDENCE: Neither artifact existence nor test command provided. System refuses to infer state.';
      evidenceClass = EVIDENCE_CLASSES.UNKNOWN;
    } else if (commandResult.isExecError) {
      // Invariant: ERROR != FALSE. If test tool is missing/broken, state is UNKNOWN, not false
      status = 'UNKNOWN';
      resolution = 'UNRESOLVED';
      passed = false;
      reason = `EXECUTION_ERROR: Test command could not be executed (${commandResult.output}). State remains UNKNOWN.`;
      evidenceClass = EVIDENCE_CLASSES.UNKNOWN;
    } else if (missingFiles.length > 0 || (testCommand && commandResult.exit_code !== 0)) {
      status = 'FAILED';
      resolution = 'RESOLVED_FAIL';
      passed = false;
      reason = missingFiles.length > 0 
        ? `MISSING_ARTIFACTS: Required files not found on disk: ${missingFiles.join(', ')}`
        : `TEST_FAILURE: Verification command exited with non-zero code ${commandResult.exit_code}`;
      evidenceClass = EVIDENCE_CLASSES.OBSERVED;
    } else {
      status = 'VERIFIED';
      resolution = 'RESOLVED_PASS';
      passed = true;
      reason = 'All machine-observed verification checks passed with exit code 0 and valid artifacts on disk.';
      evidenceClass = EVIDENCE_CLASSES.VERIFIED;
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
      evidenceClass
    };

    this.taskManager.recordVerification(taskId, verifierName, evidence);

    if (this.provenance) {
      this.provenance.record({
        actor: verifierName,
        operation: 'TASK_VERIFICATION',
        reason,
        evidence_class: evidenceClass,
        evidence
      });
    }

    return evidence;
  }
}

module.exports = VerificationEngine;
