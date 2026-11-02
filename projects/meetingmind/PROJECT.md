# MeetingMind Project Specification

## 1. Mission & Objective
Establish and operate a dedicated, production-focused MeetingMind engineering squad inside the CreativeSites AI Team / MyaOS environment. The squad continuously maintains, stabilizes, refines, tests, builds, and prepares MeetingMind for production through disciplined multi-agent workflows.

**Primary Objective**: Improve MeetingMind continuously without sacrificing stability, product quality, user privacy, or maintainability.

## 2. Repositories & Working Baseline
- **CreativeSites AI Team Repository**: `https://github.com/creativesites/CreativeSites-Ai-Team.git`
  - Base Directory: `/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team`
- **MeetingMind Repository**: `https://github.com/creativesites/MeetingMind.git`
  - Base Directory: `/Users/winstonzulu/Documents/GitHub/MeetingMind`
- **Requested Baseline Branch**: `ccr-08b1bb9f-iljmtb`
  - Remote Head SHA: `5f39cd1` (`origin/ccr-08b1bb9f-iljmtb`)
  - Local Baseline Worktree: `/Users/winstonzulu/Documents/GitHub/MeetingMind/.worktrees/baseline-ccr-08b1bb9f`
  - Note: Working directory root holds uncommitted edits on `work-circles-integration`. All concurrent and squad work must run in isolated git worktrees.

## 3. Core Product Principles (Inviolate)
1. **Generic by Default**: Personal context only when explicitly enabled by the user.
2. **Experience First, Notes After**: A prominent button starts the experience named on the label; "Write…" buttons remain quiet.
3. **A Devotional is Never Empty**: Bundled classical readings are always the immediate fallback.
4. **Every Note Gets Its Moment**: Every note gets its moment every time it is opened, including notes with no speech, typed notes, failed notes, and sacred notes.
5. **Circle Content Lives on the Server; Personal Notes Stay Local**: User transcripts and local audio never leak to cloud storage without explicit action.
6. **Learning is Out of MVP**: Defer complex learning algorithms until core recording, audio processing, and note intelligence are fully stabilized.

## 4. Prioritised Workstreams
- **P0 — Stability & Crash Elimination**: Recording lifecycle, decoder stall guards, foreground service notifications, audio buffer cleanup, coroutine cancellation, Room database migrations.
- **P1 — Onboarding & First Experience**: Zero-crash startup, seamless permissions recovery, offline language model setup, sample transcript reveal.
- **P1 — Paywall & Monetization Correctness**: 4-tier model (Free, BYOK, Pro, Church), RevenueCat entitlement checks, restore flows, closed-testing vs production toggle.
- **P2 — Existing Verticals Polish**: Work (Today, Tasks, Projects), Notes (hero tiles, moments), Faith (devotionals, Bible study, Read to Me), Circles (chat, feed, photo/verse sharing).
- **P3 — Production Readiness & Release**: Build reproducibility, APK/AAB signing, credential leak scanning, dependency licenses, Android 14/15 compatibility.
