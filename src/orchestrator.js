class Orchestrator {
  constructor({ registry, taskManager, inboxManager, runtime, eventBus }) {
    this.registry = registry;
    this.taskManager = taskManager;
    this.inboxManager = inboxManager;
    this.runtime = runtime;
    this.eventBus = eventBus;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    if (!this.eventBus) return;

    // 1. When a task is created without assignee, route it automatically!
    this.eventBus.on('task.created', (event) => {
      const task = event.payload.task;
      if (task && !task.assignee) {
        try {
          console.log(`[Orchestrator] Auto-routing unassigned task: ${task.id}`);
          const assigned = this.taskManager.routeTaskByCapabilities(task.id);
          console.log(`[Orchestrator] Task ${task.id} routed to @${assigned.assignee}`);
        } catch (err) {
          console.error(`[Orchestrator] Routing failed for ${task.id}:`, err.message);
        }
      }
    });

    // 2. When a task is completed, wake the Lead Verifier (Kael)!
    this.eventBus.on('task.completed', (event) => {
      const { taskId, artifacts } = event.payload;
      const verifier = 'Kael';
      console.log(`[Orchestrator] Task ${taskId} completed by @${event.sender}. Triggering verification by @${verifier}...`);

      this.inboxManager.send({
        from: 'Orchestrator',
        to: verifier,
        type: 'VERIFICATION_REQUEST',
        subject: `Verification Required: ${taskId}`,
        body: `Task **${taskId}** was completed by @${event.sender}.\nArtifacts created: ${artifacts.join(', ')}.\nPlease run automated test suite and record verification evidence.`,
        priority: 'HIGH',
        relatedTask: taskId
      });

      const verifierAgent = this.registry ? this.registry.getAgent(verifier) : null;
      if (verifierAgent) {
        this.runtime.wakeAgent(verifier, 'VERIFICATION_DISPATCH', { taskId });
      } else {
        console.log(`[Orchestrator] Designated verifier @${verifier} not registered in this environment. Verification remains UNASSIGNED.`);
      }
    });

    // 3. When verification passes, check if dependent tasks can now be unblocked!
    this.eventBus.on('verification.passed', (event) => {
      const { taskId } = event.payload;
      console.log(`[Orchestrator] Task ${taskId} verified clean! Checking for downstream dependent tasks...`);

      const allTasks = this.taskManager.getAllTasks();
      for (const t of allTasks) {
        if (t.status === 'BLOCKED' && t.dependencies && t.dependencies.includes(taskId)) {
          // Check if all dependencies are DONE
          const allDepsDone = t.dependencies.every(depId => {
            const dep = this.taskManager.getTask(depId);
            return dep && dep.status === 'DONE';
          });

          if (allDepsDone) {
            t.status = 'TODO';
            this.taskManager.save();
            console.log(`[Orchestrator] Unblocked downstream task ${t.id}!`);
            if (t.assignee) {
              this.runtime.wakeAgent(t.assignee, 'DEPENDENCY_RESOLVED', { taskId: t.id });
            }
          }
        }
      }
    });
  }

  processCycle() {
    console.log('[Orchestrator] Running autonomous synthesis cycle...');
    const tasks = this.taskManager.getAllTasks();
    const unassigned = tasks.filter(t => t.status === 'TODO' && !t.assignee);
    for (const t of unassigned) {
      try {
        const assigned = this.taskManager.routeTaskByCapabilities(t.id);
        console.log(`[Orchestrator] Assigned ${t.id} to @${assigned.assignee}`);
      } catch (e) {
        console.warn(`[Orchestrator] Could not route ${t.id}: ${e.message}`);
      }
    }
    return { cycle_completed: true, timestamp: new Date().toISOString() };
  }
}

module.exports = Orchestrator;
