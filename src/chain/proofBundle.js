const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ProofBundleEngine {
  constructor(baseDir = path.resolve(__dirname, '../..')) {
    this.baseDir = baseDir;
    this.bundleDir = path.resolve(baseDir, 'data/proof_bundles');
    if (!fs.existsSync(this.bundleDir)) {
      fs.mkdirSync(this.bundleDir, { recursive: true });
    }
  }

  computeFileHash(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  createBundle({
    taskId,
    taskTitle,
    creator,
    workerAgent,
    workerRuntime,
    workerPid,
    claimedAt,
    artifacts = [],
    completedAt,
    verifierAgent,
    verifierRuntime,
    verifierPid,
    verificationCommand,
    verificationExitCode,
    verificationOutput,
    verifiedAt,
    downstreamTaskId = null
  }) {
    if (!taskId || !workerAgent || !verifierAgent) {
      throw new Error('createBundle requires taskId, workerAgent, and verifierAgent');
    }

    // Invariant: Verifier cannot be claimant
    if (workerAgent.toLowerCase().trim() === verifierAgent.toLowerCase().trim()) {
      throw new Error(`SELF_VERIFICATION_REJECTED: Worker @${workerAgent} cannot verify their own bundle`);
    }

    const hashedArtifacts = (artifacts || []).map(filePath => {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.baseDir, filePath);
      return {
        path: filePath,
        full_path: fullPath,
        exists: fs.existsSync(fullPath),
        size_bytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0,
        sha256: this.computeFileHash(fullPath)
      };
    });

    const bundle = {
      bundle_id: `bundle_${taskId}_${Date.now()}`,
      version: '1.0.0',
      created_at: new Date().toISOString(),
      task: {
        id: taskId,
        title: taskTitle,
        creator
      },
      transitions: [
        {
          stage: 'TASK_ASSIGNED',
          actor: creator || 'Orchestrator',
          target_agent: workerAgent,
          timestamp: claimedAt
        },
        {
          stage: 'RUNTIME_REGISTERED',
          actor: workerAgent,
          runtime_id: workerRuntime,
          pid: workerPid,
          handshake_verified: true,
          timestamp: claimedAt
        },
        {
          stage: 'EVIDENCE_PRODUCED',
          actor: workerAgent,
          artifacts: hashedArtifacts,
          timestamp: completedAt
        },
        {
          stage: 'INDEPENDENT_VERIFICATION',
          verifier_agent: verifierAgent,
          verifier_runtime: verifierRuntime,
          verifier_pid: verifierPid,
          command: verificationCommand,
          exit_code: verificationExitCode,
          command_output: verificationOutput ? verificationOutput.slice(0, 500) : '',
          timestamp: verifiedAt
        }
      ],
      downstream_trigger: downstreamTaskId ? {
        downstream_task_id: downstreamTaskId,
        status: 'UNBLOCKED'
      } : null,
      verification_status: verificationExitCode === 0 && hashedArtifacts.every(a => a.exists && a.size_bytes > 0) ? 'VERIFIED' : 'FAILED'
    };

    // Calculate cryptographic signature of the entire proof bundle
    const bundlePayload = JSON.stringify(bundle.transitions) + JSON.stringify(hashedArtifacts);
    bundle.bundle_hash = crypto.createHash('sha256').update(bundlePayload).digest('hex');

    const bundleFile = path.join(this.bundleDir, `proof_bundle_${taskId.toLowerCase()}.json`);
    fs.writeFileSync(bundleFile, JSON.stringify(bundle, null, 2), 'utf8');

    return {
      bundle,
      bundle_path: bundleFile
    };
  }

  /**
   * Verify an existing bundle from disk against actual filesystem reality
   */
  verifyBundle(bundlePath) {
    if (!fs.existsSync(bundlePath)) {
      return { verified: false, reason: `Bundle file not found: ${bundlePath}` };
    }

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

    // 1. Check verifier distinction
    const assignStage = bundle.transitions.find(t => t.stage === 'TASK_ASSIGNED');
    const verifyStage = bundle.transitions.find(t => t.stage === 'INDEPENDENT_VERIFICATION');
    if (assignStage && verifyStage && assignStage.target_agent.toLowerCase() === verifyStage.verifier_agent.toLowerCase()) {
      return { verified: false, reason: 'SELF_VERIFICATION_REJECTED: Verifier matches claimant' };
    }

    // 2. Check artifacts and current hashes on disk
    const evidenceStage = bundle.transitions.find(t => t.stage === 'EVIDENCE_PRODUCED');
    if (!evidenceStage || !evidenceStage.artifacts || evidenceStage.artifacts.length === 0) {
      return { verified: false, reason: 'NO_ARTIFACTS_RECORDED' };
    }

    for (const art of evidenceStage.artifacts) {
      if (!fs.existsSync(art.full_path)) {
        return { verified: false, reason: `Artifact missing on disk: ${art.path}` };
      }
      const currentHash = this.computeFileHash(art.full_path);
      if (currentHash !== art.sha256) {
        return {
          verified: false,
          reason: `ARTIFACT_TAMPERED: Current hash ${currentHash} does not match recorded ${art.sha256}`
        };
      }
    }

    // 3. Check verification exit code
    if (verifyStage.exit_code !== 0) {
      return { verified: false, reason: `Verification exit code was ${verifyStage.exit_code}` };
    }

    return {
      verified: true,
      bundle_id: bundle.bundle_id,
      bundle_hash: bundle.bundle_hash,
      task_id: bundle.task.id,
      worker: assignStage.target_agent,
      verifier: verifyStage.verifier_agent
    };
  }
}

module.exports = ProofBundleEngine;
