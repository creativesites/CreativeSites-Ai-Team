/**
 * Model Router — Intelligent model selection for tasks
 *
 * Routes tasks to the cheapest sufficient model based on:
 * - Task requirements (capabilities, effort level)
 * - Model availability and performance
 * - Historical success rates
 * - Cost vs. quality tradeoff
 *
 * Supports progressive escalation: start cheap, escalate if needed
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class ModelRouter {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../data/myaos.db');
    this.db = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Route a task to the best available model
   *
   * @param {object} taskSpec - Task specification
   *   - task_id: task identifier
   *   - task_type: code_generation, architecture, etc.
   *   - required_capabilities: array of required capabilities
   *   - effort_level: LOW, MEDIUM, HIGH, MAXIMUM
   *   - available_agents: array of agent IDs that can do this
   *   - preferred_agent: optional, preferred agent if available
   * @returns {Promise<object>} - Routing decision with selected model
   */
  async routeTask(taskSpec) {
    const {
      task_id,
      task_type,
      required_capabilities = [],
      effort_level = 'MEDIUM',
      available_agents = [],
      preferred_agent = null,
    } = taskSpec;

    console.log(`[Router] Routing ${task_id}: ${task_type} (${effort_level} effort)`);

    // Step 1: Get escalation chain for this task type
    const escalationChain = await this.getEscalationChain(task_type);
    if (!escalationChain || escalationChain.length === 0) {
      console.warn(`[Router] No escalation chain for ${task_type}, using default`);
      return this.defaultRoute(taskSpec);
    }

    // Step 2: For each model in the escalation chain, check:
    // - Is it available?
    // - Does it have required capabilities?
    // - What's the success rate for this task type?
    // - What's the cost?

    const candidates = [];

    for (const step of escalationChain) {
      const model = await this.getModel(step.model_id);

      if (!model) {
        console.warn(`[Router] Model ${step.model_id} not found`);
        continue;
      }

      if (model.availability !== 'available') {
        console.log(`[Router] Model ${model.model_id} unavailable (${model.availability})`);
        continue;
      }

      // Check if model has required capabilities
      const hasCapabilities = this.checkCapabilities(model, required_capabilities);
      if (!hasCapabilities) {
        console.log(`[Router] Model ${model.model_id} lacks required capabilities`);
        continue;
      }

      // Get performance history for this model + task type
      const performance = await this.getModelPerformance(step.model_id, task_type);
      const successRate = performance ? (performance.successes / (performance.attempts || 1)) : 0.5; // assume 50% if unknown
      const avgCost = performance ? performance.avg_cost_per_task : model.estimated_cost_per_mtok * 50000 / 1000000; // rough estimate

      candidates.push({
        model_id: model.id,
        model_name: model.display_name,
        provider: model.provider,
        step: step.step,
        cost_usd: avgCost,
        estimated_success_rate: successRate,
        speed_tier: model.speed_tier,
        capability_tier: model.capability_tier,
        reason: step.reason,
      });
    }

    if (candidates.length === 0) {
      console.warn(`[Router] No eligible candidates for ${task_type}, escalating to Opus`);
      return {
        task_id,
        task_type,
        selected_model: 'model-claude-opus-5',
        selected_name: 'Claude Opus 5',
        reason: 'No cheaper models available or none pass capability check; escalating to strongest model',
        escalated: true,
        cost_estimate_usd: 0.15, // rough estimate
      };
    }

    // Step 3: Select the best candidate
    // Heuristic: prefer models with >80% success rate; among those, pick cheapest
    // If none >80%, pick the cheapest available

    const reliable = candidates.filter((c) => c.estimated_success_rate > 0.8);
    const selected = reliable.length > 0
      ? reliable.sort((a, b) => a.cost_usd - b.cost_usd)[0]
      : candidates.sort((a, b) => a.cost_usd - b.cost_usd)[0];

    // Record this routing decision
    await this.recordRouting(task_id, task_type, selected, candidates);

    console.log(`[Router] Selected: ${selected.model_name} (${(selected.estimated_success_rate * 100).toFixed(1)}% success, $${selected.cost_usd.toFixed(6)})`);

    return {
      task_id,
      task_type,
      selected_model: selected.model_id,
      selected_name: selected.model_name,
      provider: selected.provider,
      reason: selected.reason,
      estimated_success_rate: selected.estimated_success_rate,
      cost_estimate_usd: selected.cost_usd,
      candidates_considered: candidates.length,
      escalation_step: selected.step,
      escalated: false,
    };
  }

  /**
   * Get escalation chain for a task type
   */
  async getEscalationChain(taskType) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM escalation_chains WHERE task_type = ? ORDER BY step ASC`,
        [taskType],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get a model by ID
   */
  async getModel(modelId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM model_registry WHERE id = ?`,
        [modelId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Get performance history for a model + task type
   */
  async getModelPerformance(modelId, taskType) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM model_performance WHERE model_id = ? AND (task_type = ? OR task_type IS NULL)`,
        [modelId, taskType],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Check if a model has required capabilities
   */
  checkCapabilities(model, required) {
    if (!required || required.length === 0) return true;

    let modelCaps = [];
    try {
      modelCaps = JSON.parse(model.capabilities || '[]');
    } catch (e) {
      console.warn('Failed to parse model capabilities:', model.capabilities);
      return false;
    }

    return required.every((cap) => modelCaps.includes(cap));
  }

  /**
   * Record the routing decision for learning
   */
  async recordRouting(taskId, taskType, selected, candidates) {
    const candidatesJson = JSON.stringify(
      candidates.map((c) => ({
        model_id: c.model_id,
        cost: c.cost_usd,
        success_rate: c.estimated_success_rate,
      }))
    );

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO model_selection_history (id, task_id, task_type, selected_model, selected_reason, candidates) VALUES (?, ?, ?, ?, ?, ?)`,
        [`msh-${Date.now()}`, taskId, taskType, selected.model_id, selected.reason, candidatesJson],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Default routing if no escalation chain exists
   */
  defaultRoute(taskSpec) {
    const { effort_level } = taskSpec;

    const defaultByEffort = {
      LOW: { model: 'model-gemini-flash-36', name: 'Gemini 3.6 Flash' },
      MEDIUM: { model: 'model-claude-sonnet-5', name: 'Claude Sonnet 5' },
      HIGH: { model: 'model-claude-sonnet-5', name: 'Claude Sonnet 5' },
      MAXIMUM: { model: 'model-claude-opus-5', name: 'Claude Opus 5' },
    };

    const selected = defaultByEffort[effort_level] || defaultByEffort.MEDIUM;

    return {
      task_id: taskSpec.task_id,
      task_type: taskSpec.task_type,
      selected_model: selected.model,
      selected_name: selected.name,
      reason: `Default routing for ${effort_level} effort (no escalation chain defined)`,
      cost_estimate_usd: 0.0001, // placeholder
    };
  }

  /**
   * Record task outcome for learning
   */
  async recordOutcome(taskId, modelId, success, tokensUsed, costUsd) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE model_selection_history SET success = ?, tokens_used = ?, cost_usd = ?, completed_at = datetime('now') WHERE task_id = ?`,
        [success ? 1 : 0, tokensUsed, costUsd, taskId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ModelRouter;

// CLI usage
if (require.main === module) {
  (async () => {
    const router = new ModelRouter();
    await router.connect();

    const testTask = {
      task_id: 'test-001',
      task_type: 'code_generation',
      required_capabilities: ['coding'],
      effort_level: 'MEDIUM',
    };

    const routing = await router.routeTask(testTask);
    console.log('\nRouting result:');
    console.log(JSON.stringify(routing, null, 2));

    await router.close();
  })().catch(console.error);
}
