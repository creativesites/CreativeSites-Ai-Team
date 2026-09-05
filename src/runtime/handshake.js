const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class RuntimeHandshakeManager {
  constructor(options = {}) {
    this.baseDir = typeof options === 'string' ? options : (options.baseDir || path.resolve(__dirname, '../..'));
    this.handshakeFile = path.resolve(this.baseDir, 'data/runtime_handshakes.json');
    this.sessionsFile = path.resolve(this.baseDir, 'data/runtime_sessions.json');
    this.pendingHandshakes = new Map(); // runtime_id -> record
    this.verifiedSessions = new Map();  // runtime_id -> session record

    this._loadDiskState();
  }

  _loadDiskState() {
    try {
      if (fs.existsSync(this.handshakeFile)) {
        const raw = fs.readFileSync(this.handshakeFile, 'utf8');
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          this.pendingHandshakes.set(k, v);
        }
      }
    } catch (e) {}

    try {
      if (fs.existsSync(this.sessionsFile)) {
        const raw = fs.readFileSync(this.sessionsFile, 'utf8');
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          this.verifiedSessions.set(k, v);
        }
      }
    } catch (e) {}
  }

  _saveHandshakes() {
    try {
      const dir = path.dirname(this.handshakeFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.pendingHandshakes.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.handshakeFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {}
  }

  _saveSessions() {
    try {
      const dir = path.dirname(this.sessionsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.verifiedSessions.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.sessionsFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {}
  }

  createPendingRegistration(agentId, runtimeType = 'REAL_PROCESS') {
    const cleanId = agentId ? agentId.toLowerCase().trim() : 'anon';
    const runtime_id = `rt_${String(runtimeType).toLowerCase()}_${cleanId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const token = this.issueToken({ runtime_id, agent_id: cleanId, runtime_type: runtimeType });
    return { runtime_id, token, handshake_token: token };
  }

  /**
   * Generate a one-time cryptographic handshake token for a launching runtime
   */
  issueToken({ runtime_id, agent_id, runtime_type = 'REAL_PROCESS', ttlMs = 15000 }) {
    if (!runtime_id || !agent_id) {
      throw new Error('issueToken requires runtime_id and agent_id');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const record = {
      runtime_id,
      agent_id: agent_id.toLowerCase().trim(),
      runtime_type,
      handshake_token: token,
      issued_at: new Date().toISOString(),
      expires_at: Date.now() + ttlMs
    };

    this.pendingHandshakes.set(runtime_id, record);
    this._saveHandshakes();
    return token;
  }

  /**
   * Verify and complete the registration handshake from the client process
   */
  verifyAndRegister({ runtime_id, agent_id, handshake_token, pid, parent_pid, cwd }) {
    if (!runtime_id || !handshake_token || !pid) {
      return {
        success: false,
        reason: 'MISSING_HANDSHAKE_PARAMETERS: runtime_id, handshake_token, and pid are required'
      };
    }

    // Refresh state from disk in case token was issued by another process
    this._loadDiskState();

    const pending = this.pendingHandshakes.get(runtime_id);
    if (!pending) {
      return {
        success: false,
        reason: `UNKNOWN_OR_EXPIRED_HANDSHAKE: No pending registration for runtime_id ${runtime_id}`
      };
    }

    // Check expiry
    if (Date.now() > pending.expires_at) {
      this.pendingHandshakes.delete(runtime_id);
      this._saveHandshakes();
      return {
        success: false,
        reason: 'HANDSHAKE_TOKEN_EXPIRED: Token TTL exceeded'
      };
    }

    // Verify token cryptographically
    if (pending.handshake_token !== handshake_token) {
      return {
        success: false,
        reason: 'HANDSHAKE_TOKEN_MISMATCH: Forged or incorrect token provided'
      };
    }

    // Verify agent identity
    const cleanAgentId = agent_id ? agent_id.toLowerCase().trim() : '';
    if (cleanAgentId && cleanAgentId !== pending.agent_id) {
      return {
        success: false,
        reason: `IDENTITY_MISMATCH: Token was issued for @${pending.agent_id}, received @${cleanAgentId}`
      };
    }

    // Machine-verify PID is alive on the operating system
    const numericPid = parseInt(pid, 10);
    try {
      process.kill(numericPid, 0);
    } catch (e) {
      return {
        success: false,
        reason: `PROCESS_NOT_FOUND: PID ${numericPid} cannot be confirmed alive on host OS`
      };
    }

    // Successful registration
    const verifiedRecord = {
      runtime_id,
      agent_id: pending.agent_id,
      runtime_type: pending.runtime_type,
      pid: numericPid,
      parent_pid: parent_pid ? parseInt(parent_pid, 10) : process.pid,
      cwd: cwd || process.cwd(),
      handshake_verified: true,
      registered_at: new Date().toISOString(),
      status: 'REGISTERED'
    };

    this.verifiedSessions.set(runtime_id, verifiedRecord);
    this.pendingHandshakes.delete(runtime_id); // One-time token consumed
    this._saveHandshakes();
    this._saveSessions();

    return {
      success: true,
      session: verifiedRecord
    };
  }

  getVerifiedSession(runtime_id) {
    this._loadDiskState();
    const session = this.verifiedSessions.get(runtime_id);
    if (!session) return null;
    // Confirm PID is still alive
    try {
      process.kill(session.pid, 0);
      return session;
    } catch (e) {
      this.verifiedSessions.delete(runtime_id);
      this._saveSessions();
      return null;
    }
  }

  isRegistered(runtime_id) {
    return Boolean(this.getVerifiedSession(runtime_id));
  }
}

module.exports = RuntimeHandshakeManager;
