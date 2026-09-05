const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestVerificationRecorder {
  constructor(baseDir = path.resolve(__dirname, '..')) {
    this.baseDir = baseDir;
    this.outputFile = path.resolve(baseDir, 'community/system/VERIFICATION_RECORD.json');
  }

  /**
   * Execute tests and record canonical proof
   */
  runAndRecord(testCommand = 'node --test tests/*.test.js') {
    const startTime = new Date().toISOString();

    // 1. Capture Git Metadata
    let commitSha = 'UNKNOWN';
    let gitClean = false;
    let gitPorcelain = '';
    try {
      commitSha = execSync('git rev-parse HEAD', { cwd: this.baseDir, encoding: 'utf8' }).trim();
      gitPorcelain = execSync('git status --porcelain', { cwd: this.baseDir, encoding: 'utf8' }).trim();
      gitClean = gitPorcelain.length === 0;
    } catch (e) {
      commitSha = 'NON_GIT_WORKSPACE';
    }

    // 2. Execute Test Command Directly on Machine
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execSync(testCommand, {
        cwd: this.baseDir,
        encoding: 'utf8',
        env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` }
      });
    } catch (err) {
      exitCode = err.status !== undefined ? err.status : 1;
      stdout = err.stdout ? String(err.stdout) : '';
      stderr = err.stderr ? String(err.stderr) : '';
    }

    // 3. Parse TAP and Node.js spec test results machine-accurately
    const combined = stdout + '\n' + stderr;
    const okMatches = combined.match(/^(?:ok|✔)\s+.+/gm) || [];
    const notOkMatches = combined.match(/^(?:not ok|✖)\s+.+/gm) || [];

    const testsMatch = combined.match(/(?:#|ℹ)\s+tests\s+(\d+)/);
    const passMatch = combined.match(/(?:#|ℹ)\s+pass\s+(\d+)/);
    const failMatch = combined.match(/(?:#|ℹ)\s+fail\s+(\d+)/);
    const cancelledMatch = combined.match(/(?:#|ℹ)\s+cancelled\s+(\d+)/);
    const skippedMatch = combined.match(/(?:#|ℹ)\s+skipped\s+(\d+)/);

    const totalTests = testsMatch ? parseInt(testsMatch[1], 10) : okMatches.length + notOkMatches.length;
    const passCount = passMatch ? parseInt(passMatch[1], 10) : okMatches.length;
    const failCount = failMatch ? parseInt(failMatch[1], 10) : notOkMatches.length;
    const skippedCount = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
    const cancelledCount = cancelledMatch ? parseInt(cancelledMatch[1], 10) : 0;


    const record = {
      verification_type: 'AUTOMATED_SUITE_EXECUTION',
      timestamp: startTime,
      completed_at: new Date().toISOString(),
      commit_sha: commitSha,
      git_working_tree_clean: gitClean,
      git_uncommitted_changes_count: gitPorcelain ? gitPorcelain.split('\n').length : 0,
      test_command: testCommand,
      exit_code: exitCode,
      passed: exitCode === 0 && failCount === 0,
      metrics: {
        total: totalTests,
        passed: passCount,
        failed: failCount,
        skipped: skippedCount,
        cancelled: cancelledCount
      },
      raw_summary: stdout.split('\n').slice(-15).join('\n')
    };

    // Ensure directory exists
    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(this.outputFile, JSON.stringify(record, null, 2), 'utf8');
    return record;
  }
}

module.exports = TestVerificationRecorder;
