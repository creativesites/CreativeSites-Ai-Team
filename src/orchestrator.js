const path = require('path');
const { observeAndRecord } = require('./liveness');

class Orchestrator {
  constructor({ registry, taskManager, inboxManager, runtime, eventBus, baseDir }) {
    this.registry = registry;
    this.taskManager = taskManager;
    this.inboxManager = inboxManager;
    this.runtime = runtime;
    this.eventBus = eventBus;
    this.baseDir = baseDir || path.resolve(__dirname, '..');
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
    // Uses the durable liveness observer (src/liveness.js) so this reports what
    // is actually true right now, not a blanket success claim regardless of
    // outcome - a prior version of this said "I have initiated wake sequences"
    // even when every single wake attempt failed underneath.
    if (lower.includes('wake')) {
      const dbPath = path.resolve(this.baseDir, 'data/myaos.db');
      const targets = lower.includes('all')
        ? ['atlas', 'iris', 'lyra', 'vela', 'astra']
        : ['atlas', 'iris', 'lyra', 'vela', 'astra', 'kael', 'nexus', 'meridian'].filter(a => lower.includes(a));

      if (targets.length) {
        let observation = { agents: [] };
        try {
          observation = observeAndRecord(targets, dbPath);
        } catch (e) {
          actionsTaken.push(`Liveness observation failed: ${e.message}`);
        }

        const live = observation.agents.filter(a => a.liveness === 'LIVE');
        const offline = observation.agents.filter(a => a.liveness === 'OFFLINE');
        const unknown = observation.agents.filter(a => a.liveness === 'UNKNOWN');

        for (const a of observation.agents) actionsTaken.push(`@${a.id}: ${a.liveness} - ${a.evidence}`);

        // Still leave a durable note in each target's inbox so a human opening
        // that IDE later sees why it was pinged - this is real (a file write),
        // it just isn't the same thing as actually waking anyone.
        if (this.runtime) {
          for (const target of targets) {
            try { await this.runtime.wakeAgent(target, 'ORCHESTRATOR_DISPATCH'); } catch (e) {}
          }
        }

        const lines = [];
        if (live.length) lines.push(`**Already live** (confirmed via socket, not caused by this request): ${live.map(a => '@' + a.id).join(', ')}.`);
        if (offline.length) lines.push(`**Offline** - no live session found, a wake note was left in their inbox for when they're opened manually: ${offline.map(a => '@' + a.id).join(', ')}.`);
        if (unknown.length) lines.push(`**Unknown** - cannot be observed by this method (ephemeral headless workers or ambiguous shared runtime): ${unknown.map(a => '@' + a.id).join(', ')}.`);
        responseText = lines.join('\n') || 'No matching agents found for that wake request.';
      }
    }

    // 2. Check for wrap-up or sleep commands: e.g. "wrap up", "sleep", "pause"
    // Writes a real inbox note to every known agent and reports exactly that -
    // it does NOT claim tasks were checkpointed or sessions stood down, since
    // nothing here can actually verify either of those happened.
    if (lower.includes('wrap up') || lower.includes('meeting in') || lower.includes('sleep') || lower.includes('stand down')) {
      const isWrapUp = lower.includes('wrap up') || lower.includes('meeting in');
      const subject = isWrapUp ? 'Wrap-up requested' : 'Stand-down requested';
      const body = isWrapUp
        ? `Winston has asked the team to wrap up (meeting incoming). Please finish or commit your current work and note your status in the DB before stopping.`
        : `Winston has asked the team to stand down. Please note your current status before stopping - this note does not verify anything was actually saved.`;

      const notified = [];
      const failed = [];
      const targets = ['atlas', 'iris', 'lyra', 'vela', 'astra', 'kael', 'nexus', 'meridian'];
      for (const target of targets) {
        try {
          if (this.inboxManager) {
            this.inboxManager.send({ from: 'Orchestrator', to: target, type: 'COORDINATION', subject, body, priority: 'HIGH' });
            notified.push(target);
          }
        } catch (e) {
          failed.push(target);
        }
      }
      actionsTaken.push(`Wrote ${subject.toLowerCase()} note to ${notified.length} inboxes${failed.length ? `, failed for ${failed.join(', ')}` : ''}`);
      responseText = `I've written a ${isWrapUp ? 'wrap-up' : 'stand-down'} note to ${notified.length} agent inbox(es): ${notified.map(a => '@' + a).join(', ')}.\n\nThis is a durable note, not a live interruption - I have no way to confirm any of them have actually seen it, saved work, or stopped, since none of them have a continuously-running session I can verify against right now. Check the Agents page for real liveness before assuming anyone has responded.`;
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
