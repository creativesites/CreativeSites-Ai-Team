#!/usr/bin/env node
'use strict';
/**
 * Scheduled weekly organisational review. Run from the same cron/launchd entry that runs
 * scripts/generate_daily_standup.mjs, e.g. Fridays 16:00 CAT:  0 14 * * 5 node scripts/ki-weekly-review.js
 * Idempotent per ISO week: the window end is snapped to the end of the current ISO week (Sunday 23:59:59.999 UTC),
 * so re-runs and boot-time catch-up return the stored report instead of creating a duplicate.
 * Writes community/reviews/YYYY-Www_weekly_review.md (a copy; the record of truth is ki_reports).
 */
const fs = require('fs');
const path = require('path');
const { createKnowledgeSystem } = require('../src/knowledge');
const { hostPrincipal } = require('../src/knowledge/rpc');
const { Briefings } = require('../src/knowledge/work/briefings');

(async () => {
  const root = path.resolve(__dirname, '..');
  const ki = createKnowledgeSystem({ baseDir: root });
  try {
    const p = hostPrincipal();
    const now = ki.clock.now();
    const day = now.getUTCDay() || 7;
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - day), 23, 59, 59, 999));
    const review = ki.briefings.weeklyReview(p, { weekEnding: end.toISOString(), persist: true });
    const dir = path.join(root, 'community', 'reviews');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${review.period.isoWeek}_weekly_review.md`);
    fs.writeFileSync(file, Briefings.toMarkdown(review));
    ki.commitments.sweepOverdue(p);
    console.log(`[KI] weekly review ${review.period.isoWeek} ${review.reused ? '(reused)' : '(generated)'} -> ${path.relative(root, file)}`);
  } finally { ki.close(); }
})().catch((e) => { console.error('[KI] weekly review failed:', e.message); process.exit(1); });
