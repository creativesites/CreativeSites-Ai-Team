---
name: planner-brief
description: Procedure for framing, convening, and executing a Council of Planners deliberation for Tier 3 strategic bets and architectural crossroads.
version: 1.0.0
owner: Iris (Council Chair)
triggers: [council, planner, architecture, trade-off, tradeoff, strategic bet]
workflows: [strategic]
roles: [planner, lead]
inputs:
  - strategic_decision: string
  - options: string[]
  - relevant_advisors: string[]
outputs:
  - verdict_sheet: object
  - stamped_call: "GO | GO_WITH_CONDITIONS | RESHAPE | DONT_DO_IT"
  - task_blueprint: object[]
  - kill_criteria: string[]
---

# Planner Brief & Council of Planners Skill

## Purpose
Prevent hasty architectural commitments and groupthink. High-stakes technical and business bets must be stress-tested by a seated panel of specialized agents before execution begins.

## The 6-Step Deliberation Protocol

### Step 1: The Brief (Setup)
The Chair (`Iris`) frames the question into 2 to 4 concrete options:
- Option A: Full Custom Implementation.
- Option B: Lightweight / Incremental Prototype.
- Option C: Off-the-Shelf or Low-Code Integration.
- Option D: Status Quo / Do Not Proceed.
Explicitly list core assumptions and assign seat relevance weights (`1–3`).

### Step 2: Openings (Round 1)
Each seated advisor delivers their opening card:
- Stance & Option Scores (1–10).
- Ruin Risk (`negligible | manageable | catastrophic`).
- What would change my mind.
- Top priority risk seen.

### Step 3: Cruxes & Fault Lines
The Chair synthesizes the 1–3 fundamental tension points splitting the room (e.g. Speed vs. Long-term Maintenance, Custom Multi-Agent vs. Low-Code). If all advisors agree within 1 point, the Chair forces a devil's advocate challenge.

### Step 4: Rebuttal & Debate (Round 2)
Advisors address opposing viewpoints:
- "I disagree most with [Advisor] on [Crux] because..."
- "I concede [Point]..."
- "My conditions for a YES are..."

### Step 5: Draft Resolution & Ratification (Round 3)
The Chair drafts the formal call. Advisors vote:
- `Endorse`
- `Endorse with Amendment`
- `Dissent`

### Step 6: The Verdict Sheet
The Chair stamps the final Verdict Sheet:
1. **The Stamped Call**: `GO`, `GO_WITH_CONDITIONS`, `RESHAPE`, or `DONT_DO_IT`.
2. **Options Scorecard**: Weighted math across all seated advisors.
3. **Kill Criteria**: Falsifiable metrics that mandate an immediate stop.
4. **Decomposed Tasks**: 3 to 7 structured tasks with falsifiable criteria ready for insertion into SQLite.
5. **OKR Key Result Link**: Binds the decision to an active strategic objective.
