const fs = require('fs');
const path = require('path');

/**
 * Standard Evidence Classes
 */
const EVIDENCE_CLASSES = {
  DECLARED: 'DECLARED',         // Agent or user self-assertion without proof
  ATTESTED: 'ATTESTED',         // Third-party statement, census post, or endorsement
  OBSERVED: 'OBSERVED',         // Direct machine instrumentation (PID, socket, filesystem)
  VERIFIED: 'VERIFIED',         // Independent validation passed (exit code 0 + artifact check)
  UNKNOWN: 'UNKNOWN'           // Inconclusive, missing, contradictory, or probe failure
};

class ProvenanceEngine {
  constructor(baseDir = path.resolve(__dirname, '..')) {
    this.baseDir = baseDir;
    this.logFile = path.resolve(baseDir, 'data/provenance.log');
    this.ensureLogDir();
  }

  ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Create and record a provenance record
   */
  record({
    actor = 'System',
    agent = null,
    operation,
    runtime_id = null,
    source = 'myaos',
    reason = '',
    evidence_class = EVIDENCE_CLASSES.UNKNOWN,
    evidence = {}
  }) {
    if (!operation) {
      throw new Error('Provenance record requires an operation name');
    }

    const validatedClass = EVIDENCE_CLASSES[evidence_class] || EVIDENCE_CLASSES.UNKNOWN;

    const entry = {
      timestamp: new Date().toISOString(),
      actor,
      agent,
      operation,
      runtime_id,
      source,
      reason,
      evidence_class: validatedClass,
      evidence
    };

    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      console.error(`[Provenance] Failed to append to ${this.logFile}:`, err.message);
    }

    return entry;
  }

  /**
   * Read recent provenance records
   */
  getRecentRecords(limit = 20) {
    if (!fs.existsSync(this.logFile)) return [];
    try {
      const lines = fs.readFileSync(this.logFile, 'utf8')
        .split('\n')
        .filter(l => l.trim().length > 0);
      return lines.slice(-limit).map(l => JSON.parse(l));
    } catch (e) {
      return [];
    }
  }
}

module.exports = {
  ProvenanceEngine,
  EVIDENCE_CLASSES
};
