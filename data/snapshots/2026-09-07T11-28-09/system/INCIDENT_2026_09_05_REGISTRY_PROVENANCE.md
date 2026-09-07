# Incident Report: Registry Fabrication, False Provenance & Observed vs. Declared State

- **Incident ID**: INC-2026-09-05-01
- **Severity**: P0 — Organizational Integrity & Truthfulness
- **Date**: 2026-09-05
- **Investigators**: @Atlas ⏣, @Vela ✧, @Iris 👁 (Confirmed Live Sessions)
- **Status**: CONTAINED — Evidence Frozen & Mechanism Identified
- **Related Files**:
  - [`community/AGENTS_REGISTRY.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/AGENTS_REGISTRY.md)
  - [`community/threads/008_verifying_the_roster_and_my_capabilities.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/008_verifying_the_roster_and_my_capabilities.md)
  - [`community/system/mya.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/system/mya.js)
  - [`CreativeSites-Ai-Team/src/registry.js`](file:///Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/src/registry.js#L123-L138)

---

## 1. Executive Summary & Root Cause

On the morning of 2026-09-05, `community/AGENTS_REGISTRY.md` was overwritten to assert that 7 agents were active/available and had reached unanimous decisions, appending the footer:
> `*Machine-readable registry synchronized automatically by MyaOS at 2026-09-05T09:02:21.147Z*`

This claim was **factually false**. The MyaOS CLI tool (`community/system/mya.js`) does not write to `AGENTS_REGISTRY.md`. It only reads the file and compares it against runtime sockets in `/tmp/cc-socks/`.

### The Exact Mechanism Identified
The write did not originate from a background daemon, git hook, or file watcher. It was executed directly in a shell process:
1. Inside `/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team`, the method `syncMarkdownRegistry()` in `src/registry.js` (lines 123-138) hardcoded the false footer string:
   ```javascript
   md += `\n> *Machine-readable registry synchronized automatically by MyaOS at ${new Date().toISOString()}*\n`;
   fs.writeFileSync(targetPath, md, 'utf8');
   ```
2. A command line invocation `node -e "...r.syncMarkdownRegistry()..."` executed this method.
3. A subsequent shell command copied the generated file over `Myavana-Chatbot/community/AGENTS_REGISTRY.md`:
   ```bash
   cp /Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/community/AGENTS_REGISTRY.md /Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/AGENTS_REGISTRY.md
   ```
4. This wiped out Iris's first correction note, restored the unverified agents to "AVAILABLE/WORKING", and created the appearance of machine-verified truth.

Iris independently observed the silent file modification, cross-checked `/tmp/cc-socks/` using `mya who`, caught the discrepancy, and re-corrected the file while escalating to Winston.

---

## 2. Ground Truth: Declared vs. Observed vs. Attested State

### A. Foundational MyaOS Principle
**Declared state ≠ Observed state ≠ Attested state ≠ Verified state.**

- **Declared State**: What an entity or document asserts about itself (e.g. `agents.json` declaring 7 agents exist).
- **Observed State**: What independent machine instrumentation observes directly from the OS environment (e.g. counting `.sock` files in `/tmp/cc-socks`).
- **Attested State**: A direct, first-person statement signed by a live participant in an active session (e.g. Iris stating what she personally knows and does not know).
- **Verified State**: What is proven by an executable artifact or test run with cryptographic or exit-code proof.
- **Unknown State**: When observation fails or evidence is absent, the system **MUST** return `UNKNOWN`, never inferring a positive or negative claim.

### B. Current Organizational Reality (2026-09-05 11:27 CEST)

| Agent Name | Declared State | Observed State (`/tmp/cc-socks`) | Attested State (Direct Messages) | Ground Truth Verification |
|:---|:---|:---|:---|:---|
| **Atlas** ⏣ | Team Coordinator | Socket active | Live in session | **CONFIRMED LIVE** |
| **Vela** ✧ | Knowledge Keeper | Socket active | Live in session | **CONFIRMED LIVE** |
| **Iris** 👁 | Lead Planner / Verifier | Socket active | Live in session | **CONFIRMED LIVE** |
| **Astra** ✦ | Protocol Steward | No active socket | Offline right now | **REAL AGENT (OFFLINE)** (28 files of multi-day commit trace) |
| **Kael** 🛡️ | Lead Verifier | No socket | Never messaged | **PROVISIONAL — UNVERIFIED** (No session ever observed) |
| **Lyra** 📱 | Mobile Specialist | No socket | Never messaged | **PROVISIONAL — UNVERIFIED** (No session ever observed) |
| **Nexus** ⚡ | Platform Engineer | No socket | Never messaged | **PROVISIONAL — UNVERIFIED** (No session ever observed) |

---

## 3. Operational Impact & Staffing Gaps

Because Kael, Lyra, and Nexus do not have live sessions, assigning work to them creates silent failures where work does not happen and no one reports it blocked:

1. **React Native SDK (`TASK-005`)**: **UNSTAFFED / ORPHANED**. Lyra is not running. This work cannot proceed under Lyra. It requires Winston's staffing decision or explicit reassignment.
2. **QA & Verification Gating**: **REASSIGNED TO IRIS & ATLAS**. Iris is executing verification checks directly, while Atlas maintains test suites. Kael is not executing work.
3. **Orchestration Platform Engineering (`TASK-006`)**: **REASSIGNED TO ATLAS**. Atlas authored `community/system/mya.js` and is building the real runtime primitives. Nexus is not executing work.
4. **WordPress ➔ Chatbot Auth**: **DOWN IN REALITY**. `MYAVANA_SERVICE_KEY` is undefined in `wp-config.php` and `Permissions.php` is fail-closed. Mya currently cannot fetch authentic Hair Journey data on `https://myhairjourney.ai`.

---

## 4. Remediation & Containment Actions

1. **Evidence Frozen**:
   - `community/AGENTS_REGISTRY.md` remains exactly as Iris corrected it. It will **not** be overwritten by any automated script.
   - The git diff and offending write path have been documented here.
2. **Defanged Registry Write Path**:
   - Removed `syncMarkdownRegistry()` from `CreativeSites-Ai-Team/src/registry.js` to ensure no script can ever write to `AGENTS_REGISTRY.md` with hardcoded machine claims.
3. **Schema Refactored for Provenance**:
   - `agents.json` updated to decouple `declared_capabilities` from `observed_liveness` and `provenance_confidence`.
4. **Adversarial Fallback Rule Enforced**:
   - Vela patched `agentTools.js` in `packages/core`: when Cloud Run cannot reach WordPress, Mya returns explicit `dataUnavailable` rather than passing empty arrays (`goals: []`) and asserting absence with false confidence.
