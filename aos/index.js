const path = require('node:path');
const { AgentRegistry } = require('./core/registry');
const { TaskStore } = require('./core/tasks');
const { EventBus } = require('./core/eventBus');
const { InboxSystem } = require('./core/inbox');
const { CapabilityRouter } = require('./router/capabilityRouter');
const { EvidenceChecker } = require('./verifier/evidenceChecker');
const { WakeController } = require('./runtime/wakeController');
const { Doctor } = require('./doctor/doctor');

class AgentOperatingSystem {
  constructor(options = {}) {
    const rootDir = options.rootDir || path.resolve(__dirname, '..');
    const dataDir = options.dataDir || path.join(rootDir, 'data');
    const communityDir = options.communityDir || path.join(rootDir, 'community');

    this.registry = new AgentRegistry(path.join(dataDir, 'agents.json'));
    this.taskStore = new TaskStore(path.join(dataDir, 'tasks.json'));
    this.eventBus = new EventBus(path.join(dataDir, 'events.ndjson'));
    this.inboxSystem = new InboxSystem(communityDir);

    this.router = new CapabilityRouter(this.registry);
    this.verifier = new EvidenceChecker();
    this.wakeController = new WakeController({
      registry: this.registry,
      taskStore: this.taskStore,
      eventBus: this.eventBus,
      inboxSystem: this.inboxSystem
    });
    this.doctor = new Doctor({
      registry: this.registry,
      taskStore: this.taskStore,
      eventBus: this.eventBus,
      inboxSystem: this.inboxSystem
    });
  }

  // High-level automated task assignment & execution flow
  routeAndAssign(taskData) {
    const task = this.taskStore.createTask(taskData);
    this.eventBus.emitEvent('task.created', { task }, taskData.creator || 'system');

    const routing = this.router.routeTask(task);
    if (!routing.matchedAgent) {
      this.taskStore.updateStatus(task.id, 'BLOCKED');
      this.eventBus.emitEvent('task.blocked', {
        taskId: task.id,
        reason: routing.reason
      }, 'AOS_ROUTER');
      return { task, routing, assigned: false };
    }

    const assignedTask = this.taskStore.assignTask(task.id, routing.matchedAgent.name);
    this.eventBus.emitEvent('task.assigned', {
      taskId: task.id,
      assignee: routing.matchedAgent.name,
      matchScore: routing.score,
      capabilities: routing.matchedCapabilities
    }, 'AOS_ROUTER');

    // Wake the assigned agent
    const wakeResult = this.wakeController.wakeAgent(routing.matchedAgent.name, {
      reason: `Assigned task ${task.id}: ${task.title}`,
      taskId: task.id
    });

    return {
      task: assignedTask,
      routing,
      assigned: true,
      wakeResult
    };
  }

  submitCompletion(taskId, agentName, evidence) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    // Attach evidence and move to REVIEW
    this.taskStore.attachEvidence(taskId, evidence);
    this.taskStore.updateStatus(taskId, 'REVIEW');

    this.eventBus.emitEvent('task.completed', {
      taskId,
      agent: agentName,
      evidenceSummary: evidence.description || 'Evidence submitted'
    }, agentName);

    // Identify reviewer
    const reviewerName = task.reviewer || (agentName.toLowerCase() === 'atlas' ? 'Vela' : 'Atlas');
    this.eventBus.emitEvent('review.requested', {
      taskId,
      agent: agentName,
      reviewer: reviewerName
    }, agentName);

    // Wake reviewer
    const wakeReviewer = this.wakeController.wakeAgent(reviewerName, {
      reason: `Review requested for task ${taskId}`,
      taskId
    });

    return {
      task: this.taskStore.getTask(taskId),
      reviewer: reviewerName,
      wakeReviewer
    };
  }

  verifyAndClose(taskId, reviewerName, evidence = null) {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const evidenceToTest = evidence || task.evidence;
    const verification = this.verifier.verifyEvidence(task, evidenceToTest);

    if (verification.passed) {
      this.taskStore.attachVerification(taskId, {
        reviewer: reviewerName,
        passed: true,
        checks: verification.checks
      });
      this.eventBus.emitEvent('verification.passed', {
        taskId,
        reviewer: reviewerName,
        checks: verification.checks
      }, reviewerName);

      // Check dependent tasks
      const allTasks = this.taskStore.getAll();
      const dependentTasks = allTasks.filter(t => t.dependencies && t.dependencies.includes(taskId));
      for (const dep of dependentTasks) {
        if (this.taskStore.areDependenciesMet(dep.id)) {
          this.eventBus.emitEvent('dependency.resolved', {
            taskId: dep.id,
            resolvedDependency: taskId
          }, 'AOS_ENGINE');

          if (dep.assignee) {
            this.wakeController.wakeAgent(dep.assignee, {
              reason: `Dependencies resolved for ${dep.id}`,
              taskId: dep.id
            });
          }
        }
      }
    } else {
      this.taskStore.attachVerification(taskId, {
        reviewer: reviewerName,
        passed: false,
        checks: verification.checks
      });
      this.eventBus.emitEvent('verification.failed', {
        taskId,
        reviewer: reviewerName,
        reason: verification.reason
      }, reviewerName);
    }

    return {
      task: this.taskStore.getTask(taskId),
      verification
    };
  }
}

module.exports = { AgentOperatingSystem };
