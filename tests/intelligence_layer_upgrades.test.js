const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const DB_PATH = path.resolve(__dirname, '../data/myaos.db');

function queryDb(sql) {
  const out = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : [];
}

test('Intelligence Layer Upgrades: Event-Bus Emission, Error-Based Retries/Abortion, and Structured Schema Output', async (t) => {
  // Test TASK_INTEL_003: Gemini Adapter Structured Schema-Validated Output
  await t.test('Gemini Adapter injects responseSchema generationConfig payload', () => {
    const geminiAdapter = require('../src/intelligence/geminiAdapter');
    const originalFetch = global.fetch;

    let capturedPayload = null;

    global.fetch = async (url, options) => {
      if (options && options.body) {
        capturedPayload = JSON.parse(options.body);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"success": true}' }] }, finishReason: 'STOP' }],
          modelVersion: 'gemini-1.5-flash-test',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        })
      };
    };

    const schema = {
      type: 'object',
      properties: {
        success: { type: 'boolean' }
      },
      required: ['success']
    };

    try {
      // Execute call with structured output schema option
      geminiAdapter.generateContent('Produce valid JSON matching schema', {
        responseSchema: schema
      });

      assert.ok(capturedPayload, 'Payload must have been captured');
      assert.ok(capturedPayload.generationConfig, 'generationConfig must be present in request');
      assert.equal(capturedPayload.generationConfig.responseMimeType, 'application/json');
      assert.deepEqual(capturedPayload.generationConfig.responseSchema, schema);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test TASK_INTEL_001 & TASK_INTEL_002: Event-Bus Emission and Differentiated Error Routing
  await t.test('Escalation Router differentiates retry on rate-limit vs immediate abortion on auth failures', async () => {
    const originalFetch = global.fetch;
    const escalationRouter = require('../src/intelligence/escalationRouter');

    // Create a mock task and record in tasks table to bypass FK constraint
    const testTaskId = `tsk-intel-test-${Date.now()}`;
    const testTaskType = `tsk-type-test-${Date.now()}`;
    
    // Set up database mock table environment
    execFileSync('sqlite3', [DB_PATH, `
      INSERT INTO tasks (id, title, status) VALUES ('${testTaskId}', 'Intel Mock Test Task', 'open');
      INSERT INTO escalation_chains (step, task_type, model_id, reason) VALUES (1, '${testTaskType}', 'model-gemini-api', 'Mock Step 1');
      INSERT INTO escalation_chains (step, task_type, model_id, reason) VALUES (2, '${testTaskType}', 'model-gemini-pro', 'Mock Step 2');
    `]);

    try {
      // Scenario A: RATE_LIMIT error on Step 1 -> Should retry once (attempt_count increments, logs task_retry)
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return {
          ok: false,
          status: 429, // RATE LIMIT
          json: async () => ({ error: { message: 'Rate limit exceeded', status: 'RESOURCE_EXHAUSTED' } })
        };
      };

      const resultRateLimit = await escalationRouter.executeWithEscalation({
        taskId: testTaskId,
        taskType: testTaskType,
        prompt: 'Retry please'
      });

      assert.equal(resultRateLimit.ok, false);
      assert.ok(fetchCount >= 2, 'Should have retried once on rate limit (attempt count >= 2)');

      // Verify task_retry and attempt events were logged to the event_bus
      const retryEvents = queryDb(`SELECT * FROM event_bus WHERE task_id = '${testTaskId}' AND event_type = 'task_retry'`);
      assert.ok(retryEvents.length > 0, 'Should have written task_retry events inside the event_bus table');

      const attemptEvents = queryDb(`SELECT * FROM event_bus WHERE task_id = '${testTaskId}' AND event_type = 'attempt_started'`);
      assert.ok(attemptEvents.length >= 2, 'Should have written attempt_started events to the event_bus table');

      // Scenario B: AUTH_FAILURE on Step 1 -> Should abort immediately with 0 retries and no escalation to Step 2
      fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return {
          ok: false,
          status: 400, // Invalid Key
          json: async () => ({ error: { details: [{ reason: 'API_KEY_INVALID' }] } })
        };
      };

      const testTaskIdAuth = `tsk-intel-auth-${Date.now()}`;
      execFileSync('sqlite3', [DB_PATH, `INSERT INTO tasks (id, title, status) VALUES ('${testTaskIdAuth}', 'Intel Auth Mock Task', 'open');`]);

      const resultAuthFailure = await escalationRouter.executeWithEscalation({
        taskId: testTaskIdAuth,
        taskType: testTaskType,
        prompt: 'Abort please'
      });

      assert.equal(resultAuthFailure.ok, false);
      assert.equal(resultAuthFailure.errorClass, 'AUTH_FAILURE');
      assert.equal(fetchCount, 1, 'Should have aborted immediately after 1 failure, with 0 retries');

      // Verify task_failed events logged to event_bus and task_events
      const failedEvb = queryDb(`SELECT * FROM event_bus WHERE task_id = '${testTaskIdAuth}' AND event_type = 'task_failed'`);
      assert.equal(failedEvb.length, 1, 'Should have logged task_failed to event_bus');

      const failedTke = queryDb(`SELECT * FROM task_events WHERE task_id = '${testTaskIdAuth}' AND event_type = 'task_failed'`);
      assert.equal(failedTke.length, 1, 'Should have logged task_failed to task_events');

    } finally {
      global.fetch = originalFetch;
      // Cleanup mock data
      execFileSync('sqlite3', [DB_PATH, `
        DELETE FROM tasks WHERE id LIKE 'tsk-intel-%';
        DELETE FROM escalation_chains WHERE task_type LIKE 'tsk-type-test-%';
        DELETE FROM attempt_log WHERE task_id LIKE 'tsk-intel-%';
        DELETE FROM escalation_decisions WHERE task_id LIKE 'tsk-intel-%';
        DELETE FROM model_selection_history WHERE task_id LIKE 'tsk-intel-%';
        DELETE FROM event_bus WHERE task_id LIKE 'tsk-intel-%';
        DELETE FROM task_events WHERE task_id LIKE 'tsk-intel-%';
      `]);
    }
  });
});
