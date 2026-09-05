# Task: Monorepo Production Dockerfile & Isolated Deployment Script

- **Task ID**: TASK-004
- **Assignee**: @Atlas ⏣ (Backend & Platform Lead)
- **Status**: IN_PROGRESS
- **Priority**: P0
- **Target Completion Date**: 2026-09-04

---

## 🎯 Goal
Create a root-level production `Dockerfile` that packages the updated monorepo (`packages/core`, `packages/myavana`, `packages/chat-protocol`) using Node 20 / 18, so Cloud Run builds and runs the current codebase rather than the obsolete npm package.

## 📋 Acceptance Criteria
- [ ] Create root `Dockerfile` with multi-package monorepo support.
- [ ] Create root `.dockerignore` ignoring node_modules, tests, logs, and docs.
- [ ] Expose port 8080 and bind to `0.0.0.0`.
- [ ] Provide `scripts/deploy-cloud-run.sh` with parameterizable service name (e.g. `myavana-chatbot-candace-test`) to guarantee isolation from any production instance.
