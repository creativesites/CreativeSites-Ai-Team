# MeetingMind Engineering Roadmap

## Milestone 1: Squad Genesis & Verification Baseline (Immediate)
- [x] Register Squad Architect & Permanent Orchestrator (**Synapse ⚡**).
- [x] Complete codebase & infrastructure audit across CreativeSites AI Team and MeetingMind.
- [x] Establish isolated worktree baseline on `ccr-08b1bb9f-iljmtb`.
- [ ] Deliver specialist agent prompts for user spawning and self-naming.
- [ ] Validate Rapid-Fix workflow end-to-end with independent QA verification.
- [ ] Validate Planning Council workflow end-to-end with documented consensus.
- [ ] Validate Build & Release APK workflow.

## Milestone 2: P0 Stability & Core Reliability
- [ ] **Audio Decoder Stall Guard**: Harden audio decoding pipeline against corrupt audio files and mid-stream mic revocation.
- [ ] **Foreground Service Notification Resilience**: Ensure Android 13/14+ notification permission grant/denial handles background audio recording cleanly.
- [ ] **Zero-Silence Recording Lifecycle**: Verify terminal `COMPLETED` state with "No speech was detected" across all engines without hanging the UI progress indicator.
- [ ] **Room Database Integrity**: Regression test migration suite (MIGRATION_1 to MIGRATION_27) on clean and pre-existing installs.

## Milestone 3: P1 Onboarding, Localization & Monetization
- [ ] **Device Localization Verification**: Verify Android 13+ per-app language selection synchronization with system settings across all 9 supported languages.
- [ ] **Continuous Companion Header**: Polish onboarding navigation on compact displays (320x640) ensuring no layout truncation.
- [ ] **RevenueCat Entitlement & Paywall**: Verify trial timeline, weekly price anchoring, and `CLOSED_TESTING` vs `PRODUCTION` tiering switch.

## Milestone 4: P2 Vertical Refinement (Work, Notes, Faith, Circles)
- [ ] **Work UX Polish**: Execute founder-approved findings from `docs/mvp/WORK_UX_AUDIT.md` (W-01 back arrow, W-04 failed-recording recovery, Work home layout).
- [ ] **Faith & Read to Me Polish**: Audit and fix Bible study reader entry point visibility for Read to Me on real devices.
- [ ] **Circles v2 Real-World Deployment**: Ensure Cloudflare Worker and Firestore rules are deployed to unblock live feed and chat media sync.

## Milestone 5: P3 Production Release & Play Store
- [ ] Reproducible release build pipeline with upload key signing.
- [ ] Automated credential leak scan gating every release artifact.
- [ ] Publish signed Dev APKs to `apk-downloads` branch and prepare candidate AABs.
