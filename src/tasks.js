const fs = require('fs');
const path = require('path');

class TaskManager {
  constructor(tasksFilePath, registry, inboxManager, eventBus) {
    this.tasksFilePath = tasksFilePath || path.resolve(__dirname, '../community/tasks.json');
    this.registry = registry;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
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
      this.registry.updateAgentStatus(agent.name, 'AVAILABLE', task.id);
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
    task.updated_at = new Date().toISOString();
    this.save();

    if (this.registry) {
      this.registry.updateAgentStatus(agentName, 'WORKING', task.id);
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
    task.updated_at = new Date().toISOString();
    this.save();

    if (this.registry) {
      this.registry.updateAgentStatus(agentName, 'AVAILABLE', null);
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
      test_suite: evidence.test_suite || 'automated',
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
