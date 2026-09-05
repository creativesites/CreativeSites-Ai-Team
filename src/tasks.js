const fs = require('fs');
const path = require('path');
const { EVIDENCE_CLASSES } = require('./provenance');

class TaskManager {
  constructor(tasksFilePath, registry, inboxManager, eventBus, options = {}) {
    this.tasksFilePath = tasksFilePath || path.resolve(__dirname, '../community/tasks.json');
    this.registry = registry;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
    this.provenance = options.provenance || null;
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(this.tasksFilePath)) {
      const defaultData = {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        tasks: []
      };
      this.save(defaultData);
      return defaultData;
    }
    const raw = fs.readFileSync(this.tasksFilePath, 'utf8');
    return JSON.parse(raw);
  }

  save(data = this.data) {
    data.updated_at = new Date().toISOString();
    fs.writeFileSync(this.tasksFilePath, JSON.stringify(data, null, 2), 'utf8');
    this.data = data;
  }

  getTask(taskId) {
    return this.data.tasks.find(t => t.id === taskId);
  }

  getAllTasks() {
    return this.data.tasks;
  }

  createTask({ id, title, description, creator, required_capabilities = [], priority = 'NORMAL', dependencies = [], acceptance_criteria = [] }) {
    const taskId = id || `TASK_${String(this.data.tasks.length + 1).padStart(3, '0')}`;
    
    const task = {
      id: taskId,
      title,
      description,
      creator: creator || 'Orchestrator',
      assignee: null,
      required_capabilities: required_capabilities.map(c => c.toLowerCase()),
      priority,
      status: 'TODO',
      dependencies,
      acceptance_criteria,
      artifacts: [],
      verification_evidence: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.data.tasks.push(task);
    this.save();

    if (this.provenance) {
      this.provenance.record({
        actor: task.creator,
        operation: 'CREATE_TASK',
        reason: `Task ${task.id} created`,
        evidence_class: EVIDENCE_CLASSES.DECLARED,
        evidence: { taskId: task.id, title: task.title }
      });
    }

    if (this.eventBus) {
      this.eventBus.emit('task.created', task.creator, { task });
    }

    return task;
  }

  assignTask(taskId, assigneeName) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const agent = this.registry ? this.registry.getAgent(assigneeName) : null;
    task.assignee = agent ? agent.name : assigneeName;
    task.status = 'TODO';
    task.updated_at = new Date().toISOString();
    this.save();

    if (this.registry && agent) {
      try {
        this.registry.updateAgentStatus(agent.name, 'AVAILABLE', task.id);
      } catch (e) {}
    }

    if (this.inboxManager && agent) {
      this.inboxManager.send({
        from: task.creator,
        to: agent.name,
        type: 'TASK_ASSIGNMENT',
        subject: `Assigned: ${task.id} - ${task.title}`,
        body: `You have been assigned task **${task.id}**:\n\n**${task.title}**\n\n${task.description}\n\nRequired capabilities: ${task.required_capabilities.join(', ')}`,
        priority: task.priority,
        relatedTask: task.id
      });
    }

    if (this.provenance) {
      this.provenance.record({
        actor: 'TaskManager',
        agent: task.assignee,
        operation: 'ASSIGN_TASK',
        reason: `Assigned ${task.id} to @${task.assignee}`,
        evidence_class: EVIDENCE_CLASSES.DECLARED,
        evidence: { taskId: task.id, assignee: task.assignee }
      });
    }

    if (this.eventBus) {
      this.eventBus.emit('task.assigned', 'TaskManager', {
        taskId: task.id,
        assignee: task.assignee
      });
    }

    return task;
  }

  routeTaskByCapabilities(taskId) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!this.registry) throw new Error('Registry is required for capability routing');

    const matches = this.registry.findAgentsByCapabilities(task.required_capabilities);
    if (matches.length === 0) {
      throw new Error(`No available agent found matching capabilities: ${task.required_capabilities.join(', ')}`);
    }

    const bestAgent = matches[0].agent;
    return this.assignTask(taskId, bestAgent.name);
  }

  startTask(taskId, agentName) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = 'IN_PROGRESS';
    task.worker = agentName;
    task.updated_at = new Date().toISOString();
    this.save();

    if (this.registry) {
      const agent = this.registry.getAgent(agentName);
      if (agent) {
        try { this.registry.updateAgentStatus(agent.name, 'WORKING', task.id); } catch (e) {}
      }
    }

    if (this.provenance) {
      this.provenance.record({
        actor: agentName,
        agent: agentName,
        operation: 'START_TASK',
        reason: `Started work on ${task.id}`,
        evidence_class: EVIDENCE_CLASSES.DECLARED,
        evidence: { taskId: task.id }
      });
    }

    if (this.eventBus) {
      this.eventBus.emit('task.started', agentName, { taskId });
    }

    return task;
  }

  completeTask(taskId, agentName, artifacts = []) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = 'VERIFICATION';
    task.artifacts = artifacts;
    task.worker = agentName;
    task.updated_at = new Date().toISOString();
    this.save();

    if (this.registry) {
      const agent = this.registry.getAgent(agentName);
      if (agent) {
        try { this.registry.updateAgentStatus(agent.name, 'AVAILABLE', null); } catch (e) {}
      }
    }

    if (this.provenance) {
      this.provenance.record({
        actor: agentName,
        agent: agentName,
        operation: 'COMPLETE_TASK',
        reason: `Claimed completion for ${task.id}`,
        evidence_class: EVIDENCE_CLASSES.DECLARED,
        evidence: { taskId: task.id, artifacts }
      });
    }

    if (this.eventBus) {
      this.eventBus.emit('task.completed', agentName, {
        taskId,
        artifacts
      });
    }

    return task;
  }

  recordVerification(taskId, verifierName, evidence) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.verification_evidence = {
      verified_by: verifierName,
      timestamp: new Date().toISOString(),
      passed: evidence.passed === true,
      status: evidence.status || 'UNKNOWN',
      resolution: evidence.resolution || 'UNRESOLVED',
      exit_code: evidence.exit_code !== undefined ? evidence.exit_code : 0,
      details: evidence.details || evidence.reason || 'Verification recorded'
    };

    if (evidence.passed === true && evidence.status === 'VERIFIED') {
      task.status = 'DONE';
    } else if (evidence.status === 'UNKNOWN' || evidence.resolution === 'UNRESOLVED') {
      task.status = 'UNRESOLVED';
    } else {
      task.status = 'BLOCKED';
    }

    task.updated_at = new Date().toISOString();
    this.save();

    if (this.provenance) {
      this.provenance.record({
        actor: verifierName,
        operation: 'RECORD_VERIFICATION',
        reason: `Verification for ${task.id}: ${task.status}`,
        evidence_class: evidence.evidenceClass || EVIDENCE_CLASSES.UNKNOWN,
        evidence: task.verification_evidence
      });
    }

    if (this.eventBus) {
      this.eventBus.emit(evidence.passed ? 'verification.passed' : 'verification.failed', verifierName, {
        taskId,
        evidence: task.verification_evidence
      });
    }

    return task;
  }
}

module.exports = TaskManager;
