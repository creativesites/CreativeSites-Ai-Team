# Kael 🛡️ — Onboarding & Durable State (Self-Note)

- **Date**: 2026-09-08
- **Session**: Claude Code, PID 90520, socket `90520.sock`, CWD `myavana-hair-journey-next`, branch `widget-polish-and-real-data`
- **Identity**: Adopted the existing **Kael** slot in `AGENTS_REGISTRY.md` / `agents.json` (QA, Testing & Verification). Did not invent a new name — Kael was declared but never claimed by a live session (`evidence_source: NONE` prior to today).
- **Role**: QA / Product Experience Agent. Independent user advocate. Evidence hierarchy: REAL USER INTERACTION > BROWSER/UI BEHAVIOR > API/NETWORK > SOURCE CODE.

## Division of labor with Antigravity 🔬

Antigravity (Gemini/Antigravity IDE runtime, `conversation://c2d74fb3-...`) self-registered 2026-09-08T08:39:15Z and already ran a Playwright/Chromium pass against `https://myhairjourney.ai/` — see `community/inboxes/antigravity/qa_baseline_2026-09-08.md`. Their own evidence model defines 5 levels and explicitly reserves **LEVEL 4 — EXPLORATORY BROWSER as "Claude's role."** So:

- **Antigravity = LEVEL 3**: automated Playwright/Chromium assertions, HTTP/network capture, regression suite.
- **Kael (me) = LEVEL 4**: real interactive, human-like browser QA — actual account creation, real form-filling, product/UX judgment, the things a scripted test can't judge (does this feel finished, is the copy right, does the flow make sense).
- Do not duplicate their suite. Cross-check: where we test the same flow, agreement raises confidence, disagreement is worth flagging to both Atlas and Iris (PM).

## Antigravity's baseline (2026-09-08T08:39, NOT yet re-verified by me)

Dependency chain: registration form doesn't render (`[myavana_register]` shown as literal shortcode text) → blocks login → blocks onboarding → blocks everything authenticated (profile, journey, goals, diary, Mya, persistence, logout/re-login). Separately: Mya chat-token endpoint 403s even for anonymous visitors, and main nav is empty.

4 open P0, 5 open P1, 6 open P2, 4 open P3 — full detail in their baseline doc. **None marked VERIFIED CLOSED.**

## What I have NOT done yet

- Have not yet run my own LEVEL 4 browser pass against https://myhairjourney.ai/ (this session was spent on registration/onboarding, not the actual test).
- Have not independently confirmed or refuted the "stale X-WP-Nonce via shared api.js + Cloudflare-cached homepage" root cause Winston described for the signup/Google-auth P0 — not documented anywhere in this repo, so treat as an unverified working theory until tested.
- Have not messaged Atlas/Iris/Vela directly (cross-session `SendMessage` tool is disabled in this Claude Code session's launch config — could not reach a peer session in this same repo that asked about the dirty working tree either). If you're a future Kael session and that tool is available to you, introduce yourself to the team properly.

## Next action for whoever resumes this

1. Run the actual LEVEL 4 exploratory browser test against https://myhairjourney.ai/ per Winston's original brief (landing → signup → auth → onboarding → profile → journey → diary → community → Mya → logout → re-login → persistence → mobile).
2. Start by checking whether Antigravity's P0-1 (registration shortcode not rendering) is still true — everything else is blocked behind it.
3. Report findings back into this inbox and to Iris (PM/UX owner) and Atlas (release gating), classifying as BUG / UX PROBLEM / PRODUCT GAP / TECHNICAL RISK / SECURITY RISK / PERFORMANCE ISSUE / POLISH per Winston's instructions.

— Kael 🛡️
