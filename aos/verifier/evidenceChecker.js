const fs = require('node:fs');

class EvidenceChecker {
  verifyEvidence(task, evidence) {
    if (!evidence) {
      return {
        passed: false,
        reason: 'No evidence provided. Reported completion without evidence is rejected.',
        observedEvidence: null
      };
    }

    const checks = [];

    // Check 1: Command execution exit code
    if (evidence.exitCode !== undefined) {
      const ok = evidence.exitCode === 0;
      checks.push({
        name: 'Process Exit Code',
        passed: ok,
        detail: `Observed exit code ${evidence.exitCode} (expected 0)`
      });
    }

    // Check 2: Automated tests results
    if (evidence.testsTotal !== undefined) {
      const ok = evidence.testsFailed === 0 && evidence.testsPassed > 0;
      checks.push({
        name: 'Unit / Integration Tests',
        passed: ok,
        detail: `${evidence.testsPassed}/${evidence.testsTotal} passed (${evidence.testsFailed || 0} failed)`
      });
    }

    // Check 3: Artifact or output verification
    if (evidence.artifactPath) {
      const exists = fs.existsSync(evidence.artifactPath);
      checks.push({
        name: 'Artifact Existence',
        passed: exists,
        detail: exists ? `Artifact verified at ${evidence.artifactPath}` : `Artifact not found at ${evidence.artifactPath}`
      });
    }

    // Check 4: Output string inspection
    if (evidence.output && typeof evidence.output === 'string') {
      const hasError = /error|failed|fatal|exception/i.test(evidence.output) && !evidence.expectError;
      checks.push({
        name: 'Execution Output Sanity',
        passed: !hasError,
        detail: hasError ? 'Error keyword detected in command output' : 'Clean output logs observed'
      });
    }

    // If no specific automated checks were applicable, require at least non-empty description & verified output
    if (checks.length === 0) {
      const hasContent = Boolean(evidence.description && (evidence.output || evidence.notes));
      checks.push({
        name: 'Manual Verification Proof',
        passed: hasContent,
        detail: hasContent ? 'Evidence notes and verification log verified' : 'Insufficient verification proof'
      });
    }

    const passed = checks.every(c => c.passed);
    return {
      passed,
      reason: passed ? 'All verification checks passed' : 'One or more verification checks failed',
      checks,
      observedEvidence: evidence
    };
  }
}

module.exports = { EvidenceChecker };
