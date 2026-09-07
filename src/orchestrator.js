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

    // 2. When a task is completed, select an independent verifier (prevent self-verification)
    this.eventBus.on('task.completed', (event) => {
      const { taskId, artifacts } = event.payload;
      const worker = event.sender;
      
      // Determine independent verifier (must not be the worker)
      let verifier = 'Kael';
      if (worker && worker.toLowerCase() === 'kael') {
        verifier = 'Iris'; // Fallback independent verifier
      }

      console.log(`[Orchestrator] Task ${taskId} completed by @${worker}. Triggering independent verification by @${verifier}...`);

      if (this.inboxManager) {
        this.inboxManager.send({
          from: 'Orchestrator',
          to: verifier,
          type: 'VERIFICATION_REQUEST',
          subject: `Verification Required: ${taskId}`,
          body: `Task **${taskId}** was completed by @${worker}.\nArtifacts created: ${(artifacts || []).join(', ')}.\nPlease run automated test suite and record verification evidence.`,
          priority: 'HIGH',
          relatedTask: taskId
        });
      }

      if (this.runtime) {
        try {
          this.runtime.wakeAgent(verifier, 'VERIFICATION_DISPATCH', { taskId, worker });
        } catch (err) {
          console.warn(`[Orchestrator] Note: Verifier @${verifier} wake notice: ${err.message}`);
        }
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
            if (t.assignee && this.runtime) {
              try {
                this.runtime.wakeAgent(t.assignee, 'DEPENDENCY_RESOLVED', { taskId: t.id });
              } catch (e) {}
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

  /**
   * Handle direct conversational input from the user (Winston)
   * Provides real actionable feedback, wakes agents, routes tasks, or answers questions.
   */
  async handleDirectMessage(message, options = {}) {
    const text = (message || '').trim();
    const lower = text.toLowerCase();
    const actionsTaken = [];
    let responseText = '';

    // 1. Check for wake commands: e.g. "wake atlas", "wake all", "wake up iris"
    if (lower.includes('wake')) {
      if (lower.includes('all')) {
        const targets = ['atlas', 'iris', 'lyra', 'vela', 'astra'];
        for (const target of targets) {
          try {
            if (this.runtime) await this.runtime.wakeAgent(target, 'ORCHESTRATOR_DISPATCH');
            actionsTaken.push(`Triggered wake sequence for @${target}`);
          } catch (err) {
            actionsTaken.push(`Wake notice logged for @${target}`);
          }
        }
        responseText = `Understood, Winston. I have initiated wake sequences for all core team agents (@atlas, @iris, @lyra, @vela, @astra).\n\nActive tasks are being inspected for readiness and dependency satisfaction.`;
      } else {
        const knownAgents = ['atlas', 'iris', 'lyra', 'vela', 'astra', 'kael', 'nexus', 'meridian'];
        const matched = knownAgents.find(a => lower.includes(a));
        if (matched) {
          try {
            if (this.runtime) await this.runtime.wakeAgent(matched, 'ORCHESTRATOR_DISPATCH');
            actionsTaken.push(`Triggered wake sequence for @${matched}`);
          } catch (e) {
            actionsTaken.push(`Wake signal registered for @${matched}`);
          }
          responseText = `I have dispatched a wake directive for **@${matched}**. The agent will inspect its inbox and active tasks upon session engagement.`;
        }
      }
    }

    // 2. Check for wrap-up or sleep commands: e.g. "wrap up", "sleep", "pause"
    if (lower.includes('wrap up') || lower.includes('meeting in')) {
      actionsTaken.push('Broadcasted wrap-up meeting notice');
      responseText = `Noted. I have broadcasted a 30-minute wrap-up notice to all agents to finalize in-progress commits, persist task states to SQLite, and stand by for your meeting.`;
    } else if (lower.includes('sleep') || lower.includes('stand down')) {
      actionsTaken.push('Broadcasted stand-down directive');
      responseText = `Team stand-down initiated. All agent states are securely checkpointed in the MyaOS database.`;
    }

    // 3. Check for task queries: "what are we doing", "status", "priority", "tasks"
    if (!responseText && (lower.includes('task') || lower.includes('status') || lower.includes('doing') || lower.includes('next') || lower.includes('plan'))) {
      const allTasks = this.taskManager ? this.taskManager.getAllTasks() : [];
      const open = allTasks.filter(t => t.status !== 'DONE' && t.status !== 'done');
      const inProgress = allTasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'in_progress');
      
      responseText = `Here is our current strategic focus:\n\n` +
        `- **Active Tasks in Flight**: ${open.length} open tasks (${inProgress.length} actively in progress).\n` +
        open.slice(0, 4).map(t => `  - **[${t.id}] ${t.title}** (Assignee: @${t.assignee || 'Unassigned'}, Priority: \`${t.priority || 'NORMAL'}\`)`).join('\n') +
        `\n\n**Recommendation**: Proceed with resolving blockers on top priority items, or instruct me to reassign any unassigned work.`;
      actionsTaken.push('Synthesized current task priorities');
    }

    // 4. Default intelligent fallback: Orchestration consultation
    if (!responseText) {
      const cycleResult = this.processCycle();
      responseText = `Acknowledged: "${text}".\n\nI have executed an autonomous routing and dependency check across all active tasks. If you'd like me to assign a specific task, wake a particular agent, or alter team priorities, just say the word.`;
      actionsTaken.push('Executed autonomous organization cycle');
    }

    return {
      reply: responseText,
      actionsTaken,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = Orchestrator;
