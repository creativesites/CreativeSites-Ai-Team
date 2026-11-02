# MeetingMind Initial Mission: Discovery, Prioritization & Consensus Roadmap 🛡️⚖️⚙️

**Date:** 2026-10-21  
**Squad:** MeetingMind Engineering Squad (`meetingmind`)  
**Contributors:** Sentinel (QA 🛡️), Themis (Product Planner ⚖️), Daedalus (Engineering Planner ⚙️), Mira (Challenge Reviewer ✺), Synapse (Squad Orchestrator ⚡)  
**Status:** DISCOVERY COMPLETE — CONSENSUS ROADMAP ESTABLISHED  

---

## 1. Repository & Baseline Audit

- **Active Workspace:** `/Users/winstonzulu/Documents/GitHub/MeetingMind`
- **Active Branch:** `work-circles-integration` (commit `b114134`, tracking `origin/work-circles-integration`)
- **Designated Base Branch:** `claude/meetingmind-mvp-planning-7dgowm` (commit `a06b52b`)
- **Pending Local Changes:** `agents/README.md` (uncommitted Mira council role definition preserved intact)
- **Active Worktrees:**
  - `.worktrees/baseline-ccr-08b1bb9f` (branch `ccr-08b1bb9f-iljmtb`)
  - `.worktrees/speech-ai` (branch `claude/meetingmind-multilingual-speech-ai`)
  - `/private/tmp/mm-qa-audit` (branch `wt-qa-audit`)
  - `/private/tmp/mm-product-audit` (branch `wt-product-audit`)
  - `/private/tmp/mm-engineering-audit` (branch `wt-engineering-audit`)
- **Build Infrastructure:** Gradle 9.3.1, AGP 9.1.1, Kotlin 2.2.10, KSP 2.3.5, Room v27, Compose BOM 2024.09.00, `minSdk = 24`, `targetSdk = 36`, `compileSdk = 36`.

---

## 2. Independent Product Assessment (Themis ⚖️)

### Key Journey Audits:
1. **Onboarding & First-Success Guidance**:
   - *Current State:* 7-step onboarding flow with 9-language i18n support and sample transcript streaming (~2.1s).
   - *Product Gap:* Welcome screen jumps straight to permissions and setup without an immediate guided interactive first-recording checklist. When dismissed, user lands on Home without clear contextual guidance for their first real meeting capture.
2. **Work Navigation & Comprehension**:
   - *Current State:* 5 separate doors into Work (Quick tile, Home style, Bottom nav 4th slot, Notes filter chip, Settings).
   - *Product Gap:* High cognitive burden. When opened from default Today Home, the Work page previously hid the back arrow and tab bar (`W-01`). The Work home has two surfaces (`ProfessionalHome.kt` vs `WorkPageToday.kt`) with conflicting verbs ("Wrap up" vs "Review"). The "Task" button opens a list with no "Add Task" button (`W-03`). Failed recordings never surface in Work (`W-04`), stranding user recovery.
3. **Circles Usability & Work Vertical Adaptation**:
   - *Current State:* Full client v2 overhaul with space-aware templates (`isWork` vs Faith), 5 professional post types, 5 professional reactions, and "Share to Circle" post-meeting sheet in `WrapUpScreen`.
   - *Product Gap:* Offline/delay state: When network latency exceeds 3500ms or anonymous Firebase auth stalls, the Home Circles tile displays a blank header or stays in Loading (`ISS-06`), rather than displaying an actionable retry state.
4. **Faith Create & Devotional Journeys**:
   - *Current State:* Bundled public-domain classics ensure devotionals are never empty. Zuri companion features Gold rim for Faith scope.
   - *Product Gap:* "Read to Me" entry point on Bible reader top bar reported not visible on physical device. Faith Home "Your week in faith" partly implemented.
5. **Paywall & Billing Correctness**:
   - *Current State:* 4-tier model (`FREE`, `BYOK` $4.99/mo, `PRO` $12.99/mo, `CHURCH` $49.99/mo) backed by Cloudflare managed Gemini proxy. Closed testing toggle defaults to unlocked Pro features.
   - *Product Guardrail:* Free tier must guarantee 30 minutes cloud transcription and 30 AI actions without preemptive paywall blocking.

---

## 3. Independent Engineering Assessment (Daedalus ⚙️)

### Architecture & Subsystem Audits:
1. **Persistence & Room Migrations**:
   - Room Version **27** with 26 sequential migrations (`MIGRATION_1_2` to `MIGRATION_26_27`).
   - Version 27 adds `transcript_translations` with `meetingId` foreign key cascade delete. Pre-migration backup guard (`DatabaseGuard.copyBeforeMigration`) ensures database integrity against schema drift.
2. **Audio Capture & Hardware Resilience**:
   - `MediaRecorder.stop()` throws `RuntimeException` on zero-duration / rapid stops (<500ms). Fixed in `d91757d` by deleting empty scratch files and discarding 0-byte recordings (`ISS-03`).
   - Android 14+ Foreground Service type `microphone` properly declared, but runtime permission revocation during active capture requires explicit UI listener and error state recovery.
   - `RecordingJournalStore` heartbeats every 10s to rescue `.m4a` files on abnormal process termination.
3. **Offline AI Inference & Low-RAM Memory Budget (ISS-05)**:
   - Sherpa-ONNX 1.13.6 (Parakeet TDT, Whisper Turbo, Omnilingual CTC) + MediaPipe Tasks GenAI (Qwen 2.5, DeepSeek R1 Distill).
   - *Critical Engineering Risk:* Consecutive native heap allocations on <=4GB RAM devices risk triggering the Android OS LowMemoryKiller (LMK) during background processing handoffs. Explicit engine teardown (`release()`) and GC invocation are required between ASR completion and LLM loading.
4. **Compose & Lifecycle Concurrency**:
   - Conditional Compose state collection in `MainActivity.kt:444` (`homeCirclesVm.state.collectAsState()`) resolved in `d91757d` / `fa4d00c`.
   - Credential security: `meetmind_credentials` DataStore containing BYOK keys explicitly excluded from cloud backup in `data_extraction_rules.xml` and `backup_rules.xml` (`ISS-04`).

---

## 4. Independent QA & Reliability Assessment (Sentinel 🛡️)

### Test Coverage & Crash Investigation:
1. **Automated Test Coverage**:
   - 371 test classes in `app/src/test/java`.
   - Architectural guardrails strictly active: `ColorLiteralGuardTest`, `LocaleResourcesIntegrityTest`, `PromptsIntegrityTest`.
2. **Crash & Reliability Telemetry**:
   - *Notes Page Crash:* Root cause traced to empty hero meeting bubble dropping a child view (`5f120cf`); unit tests pass.
   - *52% Processing Hang:* Silence during speaker separation stalled the pipeline; resolved with `NoSpeechRecordingTest` and diarization budget timer.
   - *Shona Flashing Loop:* Resolved by `shouldApplySavedLanguage` guard and synchronous locale persistence.
3. **Zero-Mock & Unverified Device Surface**:
   - *Gap:* The current CI/sandbox lacks physical hardware instrumentation. Physical verification required before production:
     - Real incoming phone call audio focus loss & resume prompt.
     - Exact alarm delivery for 00:01 devotional under Android Doze mode.
     - Live R2 photo/video upload across varying mobile networks.
     - Google Sign-In with release keystore SHA-1 fingerprint.

---

## 5. Consolidated Deduplicated Backlog

| ID | Sev | Domain | Finding / Issue | User Impact | Scope | Recommended Owner |
|---|---|---|---|---|---|---|
| **MM-B01** | **P0** | Stability / AI | Native heap allocation spike during ASR -> LLM handoff on <=4GB RAM devices (`ISS-05`) | App killed by OS LMK during offline meeting processing | High (Engine lifecycle) | Daedalus / Forge |
| **MM-B02** | **P1** | Work Navigation | Work page navigation trap: missing back button / bottom nav derivation in default setup (`W-01`) | User unable to return to Home from Work | Medium (Compose Nav) | Themis / Forge |
| **MM-B03** | **P1** | Work Navigation | Failed recordings never appear in Work vertical (`W-04`) | No recovery path for failed work meetings | Medium (Work ViewModel) | Daedalus / Forge |
| **MM-B04** | **P1** | Circles | Home Circles tile stuck in loading / blank on network timeout (`ISS-06`) | User perceives Circles feature as dead/broken | Medium (Circles VM) | Forge |
| **MM-B05** | **P1** | Audio Capture | Runtime microphone permission revocation during active capture | Unhandled crash or zombie foreground service | Medium (Service / Audio) | Daedalus / Forge |
| **MM-B06** | **P2** | Onboarding | Missing interactive first-success guidance checklist post-onboarding | New users drop off before first meeting recording | Medium (Onboarding UI) | Themis / Forge |
| **MM-B07** | **P2** | Work Navigation | Discrepancy between Work Home (`ProfessionalHome`) and Work Page (`WorkPageToday`) (`W-02`) | Confusing cognitive model; conflicting verbs | High (Work UX Redesign) | Themis / Daedalus |
| **MM-B08** | **P2** | Faith / Audio | Read to Me top-bar entry point reported not visible on device | Users cannot discover audio Scripture listening | Medium (Compose UI) | Themis / Forge |
| **MM-B09** | **P2** | Backend / Infra | Cloudflare Worker (`server/circles-api`) and Firestore rules require production deployment by owner | Live invite links and multi-device circles fail | Low (Owner action) | Squad / Owner |
| **MM-B10** | **P3** | UI / Hygiene | Deprecated vector asset icons (`Icons.Rounded.Forward`, etc.) (`ISS-07`) | AAPT2 warnings; potential RTL layout mirror flaws | Low (Theme tokens) | Forge |

---

## 6. Two-Planner Consensus & Delivery Roadmap

### Alignment Protocol:
- **Themis (Product ⚖️)** prioritized user flow clarity, unblocking trapped navigation (`W-01`), and first-success onboarding guidance.
- **Daedalus (Engineering ⚙️)** prioritized native memory pressure release (`MM-B01`), audio service lifecycle resilience (`MM-B05`), and Room v27 cascade verification.
- **Mira (Reviewer ✺)** verified that solving `W-01` and `ISS-05` first protects both core user utility and device stability without expanding scope prematurely.

### Consensus Delivery Sequence:

#### **Stage 1: Critical Stability, Data Integrity & Release Blockers**
1. **MM-B01**: Implement explicit native engine release (`recognizer.release()`) and GC trigger before LLM loading in `MeetingProcessingPipeline.kt`.
2. **MM-B05**: Harden `MeetingRecordingService` against runtime `RECORD_AUDIO` permission revocation with graceful teardown.
3. **MM-B04**: Fix `HomeCirclesViewModel` timeout handling to emit `HomeCircles.Failed` with an actionable retry button.

#### **Stage 2: Onboarding, First-Success & Billing Flow**
1. **MM-B06**: Implement persistent Home getting-started checklist ("Record first meeting", "Review summary", "Set reminders").
2. Validate 4-tier billing entitlements and closed-testing mode defaults.

#### **Stage 3: Work Navigation & Comprehension (Design Artifact First)**
1. **MM-B02**: Enforce clean back navigation in `WorkPageScreen.kt` and `MainActivity.kt`.
2. **MM-B03**: Surface failed recordings in Work "Needs You" queue with a one-tap retry/re-process action.
3. Present mobile design artifact for Work Home unification (`W-02`) for founder sign-off before implementation.

#### **Stage 4: Circles Usability & Post-Meeting Work Integration**
1. Complete verification of post-meeting `ShareToCircleSheet` in `WrapUpScreen`.
2. Request owner deployment of Cloudflare Worker and Firestore rules.

#### **Stage 5: Faith Create & Bible Usability**
1. Trace and verify Read to Me top-bar entry point visibility across all screen densities.
2. Complete Faith Week timeline integration.
