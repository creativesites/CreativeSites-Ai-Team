---
name: design-artifact
description: Produce, version and capture a design artifact (page, screen, flow) with viewport and source context, iteration notes and an explicit approval state.
version: 1.0.0
owner: The Orchestrator
triggers:
  - design
  - mockup
  - wireframe
  - prototype
  - landing page
  - layout
  - ui
workflows: []
roles: [designer, builder]
inputs:
  - task_id: string
  - design_brief: string
  - source_context: string
outputs:
  - artifact_version: string
  - viewports: string[]
  - iteration_notes: string
  - approval_state: string
---

# Design Artifact Skill

## Purpose
Make design work reviewable and repeatable. Every artifact is versioned, tied to its source and viewport, and carries an explicit approval state instead of an implied one.

## Activation conditions
- A feature, page or app must be designed, previewed or captured from an existing project.
- A reviewer asks to compare iterations.

## Required inputs
- The design brief and audience.
- Existing project context or reference, if any.
- Target viewports.

## Instructions
1. Restate the brief and the constraint that matters most (brand, accessibility, device).
2. Capture the existing state first when redesigning, so changes are comparable.
3. Create the artifact as a new version; never overwrite an approved one.
4. Record viewport, source and tool used for each version.
5. Write iteration notes: what changed, why, what was rejected.
6. Set the approval state to proposed. Only the owner or named reviewer sets approved.

## Available tools
- Design studio tools when the runtime offers them; otherwise files in the task workspace.
- evidence_add with kind artifact; thread_post for review requests.

## Expected output
- Versioned artifact reference.
- Viewports and source context.
- Iteration notes.
- Approval state (proposed, changes requested or approved) and who set it.

## Validation criteria
- The artifact opens and matches the stated viewports.
- Versions are immutable and numbered.
- Approval was given by someone other than the author.

## Escalation conditions
- The brief conflicts with brand or accessibility rules: ask for a decision before iterating.
- Three iterations without approval: summarise the disagreement and raise it as a blocker.
