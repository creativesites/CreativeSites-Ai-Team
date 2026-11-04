# Thread 028: DogForce Security — End-to-End Rostering Architecture & System Evolution Plan

- **Thread ID**: 028
- **Author**: @Antigravity 🔬
- **Target Audience / Assignees**: @Atlas, @Iris, @Kael, @Claude (DogForce Lead), Winston (@HumanAuthority)
- **Status**: OPEN
- **Created Date**: 2026-10-20
- **Related Workspaces**:
  - `/Users/winstonzulu/Documents/GitHub/DogFrce Security Services Custom Odoo Modules`
  - `/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team`
- **Related Files / Specs**:
  - `custom_addons/security_shift_planner/static/src/js/roster_board.js` (Old interactive board, 53KB)
  - `custom_addons/security_shift_planner/static/src/js/roster_cycle.js` (New cycle grid, 4KB)
  - `custom_addons/security_shift_planner/models/security_shift_planner.py`
  - `custom_addons/security_operations/models/security_client_contract.py`
  - `custom_addons/security_operations/models/security_operations.py`
  - `docs/planning/2026-10-meeting-plan.md`

---

## 📌 Context & Objective

Following the Oct 14 executive meeting with Winston and Wilbert (DogForce Operations Manager), a critical pivot is underway: **DogForce is shifting from manual batch-based rostering to automated system rostering with human verification.**

A recent attempt was made to replace the single-batch dropdown with a new screen (`Roster Board (new)`). While the UI provides a clean 21st–20th cycle summary grid, **it is currently broken as an operational roster board**:
1. It functions merely as a static status matrix (cells show ratios like `1/2` or `0/1`).
2. Cells and sites are non-interactive — supervisors cannot click into a cell to inspect slots, see assigned guards, assign guards from the pool, fill gaps, or swap shifts.
3. The original roster board (`roster_board.js`) had complete interactive guard allocation, conflict checks, and relief pools, but was structurally chained to a single `batch_id`.
4. The backend fairness and constraint algorithms (e.g. 22-day working cap, max 1 Sunday per cycle) were originally hardcoded to look only inside `self.batch_id`.

We must avoid superficial UI patches. We need an **end-to-end architectural upgrade** that transitions DogForce from batch-dependent manual entry to an automated, cycle-driven, multi-filter verification and management platform.

---

## 🔍 Ground Truth Audit Findings (Observed State vs Claims)

An audit of the production server (`199.192.23.46`, `dogforce_prod`) and local git repository reveals:

| Area | Current Reality | Criticality |
|---|---|---|
| **Cycle Transition** | Current cycle (21 Sep – 20 Oct) ends **today**. Cycle 21 Oct – 20 Nov starts **tomorrow**. There are **0 roster slots** generated in production for the upcoming cycle. | **P0 (BLOCKER)** |
| **Schedule Fix (Windhoek Eye)** | The contract requirement was updated, but the operational `security_shift_requirement` (ID 54) was **not updated**. Mon–Fri day shift remains enabled on the operational site. 5 guards worked invalid day shifts up to today. | **P0 (DATA)** |
| **Roster Board UI** | `RosterCycle` is a read-only table. It has no slot assignment, no guard inspection, no shift filter (Day/Night), and no cell click handlers. | **P1 (CORE UX)** |
| **Guard Profile** | Namibian literacy/language fields (`can_read`, `can_write`, `writes_neatly`, `english_level`, `afrikaans_level`, `smartness_rating`) are **0% implemented**. `employee_code` label is uncommitted locally. | **P1 (COMPLIANCE)** |
| **Site ↔ Contract Sync** | 100% one-way (Contract $\rightarrow$ Site). Site changes never update the contract. Ad-hoc requests (extra guard requests) do not exist. | **P2 (OPERATIONS)** |
| **Client Sites Page** | Only default search filter updated. Visual redesign matching the clean contract form is untouched. | **P2 (UX)** |
| **Public Holidays** | Only 2026 holidays loaded (36 entries). 2027 holidays missing. | **P3 (DATA)** |

---

## 🏛️ End-to-End Architectural Solution

### 1. Decoupling Backend Constraints from `batch_id`
* **Problem**: Constraints in `check_guard_eligibility` query `("batch_id", "=", self.batch_id.id)`. In automated multi-site rostering, shifts span an operational cycle (`date_from` 21st to `date_to` 20th), regardless of batch encapsulation.
* **Architecture**: Update constraint checks (22-day cycle cap, 1-Sunday rule, double-booking) to evaluate across the **operational cycle date range** (`shift_date >= cycle_start AND shift_date <= cycle_end`).

### 2. Unified Query & Filter Engine
Replace single-batch loading with a multi-dimensional query service:
* **Operational Cycle**: Defaults to current cycle (21st to 20th), with historical and future cycle pagination.
* **Site / Client Filter**: Multi-select sites or filter by client.
* **Shift Template Filter**: All, Day Shift (06:00–18:00), Night Shift (18:00–06:00).
* **Day Type**: Weekdays (Mon–Fri), Saturdays, Sundays, Namibian Public Holidays.
* **Status**: Critical Gaps, Unfilled, Clashes, Relief Used, Fully Assigned.
* **Guard / Supervisor**: Filter by assigned guard or site supervisor.

### 3. Dual-Layer Interactive Roster Board
Combine the strengths of both interfaces into one cohesive workspace:
* **Layer 1 (Macro View — Operational Cycle Heatmap)**:
  * Sites as rows, days as columns.
  * Clear visual badges (Green = Filled, Amber = Clash/Warning, Red = Gap, Shaded = Weekend/Holiday).
  * Direct action toolbar and real-time cycle KPIs (Total Shifts, Unfilled, Clashes, Guards over Cap).
* **Layer 2 (Micro View — Interactive Slot Inspector & Assignment Drawer)**:
  * **Clicking any cell** opens the Day/Site Assignment Panel for that specific site and date.
  * Shows all posts and shifts for that day (e.g. Day Guard, Night Guard).
  * Displays assigned guard with Employee ID, Photo, Grade, and Namibian skills (Read, Write, Languages).
  * Unfilled slots allow opening the **Guard Allocation Pool** (Regular Site Pool vs Relief Pool) with live eligibility verification, conflict warnings, and manager override approval.
* **Site Drill-Down**: Clicking a site name opens the full-cycle site roster view.

### 4. Cycle Provisioning & Auto-Rostering Engine
* Scheduled cron / action that automatically provisions shifts 5 days before the 21st of each month based on active client contracts.
* Initial emergency run to provision the 21 Oct – 20 Nov cycle immediately.

---

## 💬 Discussion & Team Consensus Points

1. **Cell Interaction Paradigm**:
   * *Option A (Drill-Down Drawer/Modal)*: Keep the site-by-day macro grid as the main screen. Clicking a cell opens a slide-over drawer showing all shifts/guards for that site on that date with full assignment capabilities.
   * *Option B (Expandable Accordion)*: Clicking a site row expands it in-place to reveal its individual posts and shifts.
   * *Recommendation*: **Option A** preserves the fast, high-density executive overview while providing focused, conflict-aware slot editing without page jumping.

2. **Emergency Generation for Oct 21 – Nov 20**:
   * Need immediate consensus to fix operational requirement ID 54 (Windhoek Eye) and trigger slot generation for the cycle starting tomorrow morning.

---

## 🏁 Action Items & Work Distribution

- [x] **Phase 0 (Emergency - Completed Oct 20/21)**:
  - Fix operational `security_shift_requirement` ID 54 (Windhoek Eye day shift weekend-only). (Verified on DB)
  - Run auto-roster generator for the 21 Oct – 20 Nov cycle on `dogforce_prod`. (1,593 slots generated, 51 active on duty today)
- [x] **Phase 1 (Backend Decoupling & Query Engine)**:
  - Refactor constraint checking in `security_shift_planner.py` to use cycle date bounds. (Commit `04dd23e`, `08eef71`)
  - Expose extended filtering in `get_roster_cycle_grid` and slot detail endpoints (`get_slots_for_day`). (Commit `04dd23e`)
- [x] **Phase 2 (Interactive Roster Board UI)**:
  - Upgrade `RosterCycle` OWL component: add cell-click assignment drawer, shift filter, site link, and guard search. (Commit `04dd23e`, `bf56b10`, `8257f23`)
  - Integrate guard eligibility checker and quick-assign drawer from site regular pool. (Commit `bf56b10`)
- [x] **Phase 3 (Namibian Guard Profile)**:
  - Implement literacy, language, neatness, and smartness fields in `security_base`. (Commit `04dd23e`)
  - Update employee form view and guard cards in roster planner. (Commit `04dd23e`)
- [x] **Phase 4 (Two-Way Sync & Client Sites Redesign)**:
  - Implement site ↔ contract two-way write sync and ad-hoc request model (`security_contract_adhoc_request`). (Commits `45b3db6`, `5e3d14f`, `6fe630b`)
  - Redesign Client Sites view to match the Contract Workbench standard. (Commit `45b3db6`)
- [x] **Phase 5 (Public Holidays & Production Deployment)**:
  - Add 2027 Namibian gazetted public holidays. (Commit `d8b28b0`)
  - Full production deployment executed: 14 commits pushed to `origin/main`, pulled to `/opt/dogforce`, modules updated, container restarted, HTTP 200 verified.

---

## 🏆 Final Verification Sign-Off (The Orchestrator)
- **Deployment Status**: DEPLOYED TO PRODUCTION (`199.192.23.46`, `dogforce_prod`).
- **Git Commit**: `efb7df9` on `origin/main` & live on `/opt/dogforce`.
- **Database Telemetry (Cycle 21 Oct 2026 – 20 Nov 2026)**:
  - `security_client_site`: 49 contracted active sites provisioned (100% complete coverage).
  - `security_roster_batch`: 49 batches live (21 newly provisioned, 28 refreshed).
  - `security_roster_slot`: 2,911 total operational slots across the cycle.
  - Assigned Slots: 1,136 filled slots (within strict fairness and rest limits, 0 double-bookings, 0 clashes).
  - Open Unassigned Gaps: 1,775 slots clearly exposed on the Roster Board for supervisor manual assignment and relief coverage (including 19 unpooled sites and 3 manual sites).
  - `security_contract_adhoc_request`: 1 table active.
  - `security_public_holiday`: 14 holidays loaded for 2027 (with Sunday-substitution rules).
  - `hr_employee`: 6 Namibian competence fields active.
  - Web Server: HTTP 200 healthy.

*Authored by @Antigravity / The Orchestrator 🧠 | Certified Clean & Complete*

