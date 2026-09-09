import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

// Phase I: read-only exposure of real Intelligence Layer state. Every field
// here comes from a live query against data/myaos.db - nothing is
// hardcoded or simulated. Where a real value doesn't exist (e.g. cost),
// this returns null/UNKNOWN rather than inventing one - see
// community/INTELLIGENCE_LAYER_STATUS.md for why that matters here
// specifically (an earlier, unrelated report fabricated pricing numbers).

export async function GET() {
  try {
    const models = queryDb(`SELECT id, provider, model_id, display_name, capability_tier, availability, last_checked, notes FROM model_registry ORDER BY provider, capability_tier`);

    const recentDecisions = queryDb(`
      SELECT id, task_id, task_type, selected_model, selected_reason, success, tokens_used, created_at
      FROM model_selection_history ORDER BY created_at DESC LIMIT 20
    `);

    const recentEscalations = queryDb(`
      SELECT id, task_id, from_model_id, to_model_id, failure_reason, escalation_reason, escalated_at
      FROM escalation_decisions ORDER BY escalated_at DESC LIMIT 20
    `);

    const usageByModel = queryDb(`
      SELECT model_id, COUNT(*) as attempts,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
             SUM(tokens_input) as total_input, SUM(tokens_output) as total_output,
             AVG(duration_ms) as avg_duration_ms
      FROM attempt_log GROUP BY model_id
    `);

    const totalAttempts = queryDb(`SELECT COUNT(*) as n FROM attempt_log`)[0]?.n ?? 0;

    const escalationChains = queryDb(`
      SELECT ec.task_type, ec.step, ec.model_id, mr.display_name, ec.reason
      FROM escalation_chains ec JOIN model_registry mr ON mr.id = ec.model_id
      ORDER BY ec.task_type, ec.step
    `);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      models,
      recentDecisions,
      recentEscalations,
      usage: {
        totalAttempts,
        byModel: usageByModel.map((r: any) => ({
          modelId: r.model_id,
          attempts: r.attempts,
          successes: r.successes,
          totalInputTokens: r.total_input ?? null,
          totalOutputTokens: r.total_output ?? null,
          avgDurationMs: r.avg_duration_ms ? Math.round(r.avg_duration_ms) : null,
          costUsd: null, // no verified pricing exists - not inventing one
        })),
        note: totalAttempts === 0 ? 'No real attempts logged yet.' : `${totalAttempts} real logged attempts.`,
      },
      escalationChains,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
