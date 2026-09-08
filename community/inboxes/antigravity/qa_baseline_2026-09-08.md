# Antigravity QA Baseline — Hair Journey Production
# Established: 2026-09-08T08:39:15Z
# Test Method: Playwright/Chromium Headless Browser (LEVEL 3 — AUTOMATED BROWSER)
# Target: https://myhairjourney.ai/
# Test Account: qa_test_1788837640809@mailinator.com (disposable, not a real user)

---

## QA Evidence Model

Every finding in this baseline is classified by evidence level:

- **LEVEL 1 — SOURCE**: Code/configuration inspection
- **LEVEL 2 — HTTP/API**: Direct endpoint/request verification
- **LEVEL 3 — AUTOMATED BROWSER**: Playwright/Chromium interaction and assertions
- **LEVEL 4 — EXPLORATORY BROWSER**: Human-like exploratory testing (Claude's role)
- **LEVEL 5 — HUMAN ACCEPTANCE**: Stakeholder/user acceptance

> ⚠️ API returns 200 ≠ user journey works. React component exists ≠ feature works in production.

---

## Dependency Chain

```
REGISTRATION FAIL (P0-1)
  → LOGIN FAIL (P0-1, same cause)
    → ONBOARDING BLOCKED
      → AUTHENTICATED DASHBOARD JOURNEY BLOCKED
        → HAIR PROFILE BLOCKED
        → HAIR JOURNEY BLOCKED
        → GOALS BLOCKED
        → DIARY BLOCKED
        → MYA CONVERSATION BLOCKED
        → PERSISTENCE TEST BLOCKED
        → LOGOUT BLOCKED
        → RE-LOGIN BLOCKED

SEPARATELY:
MYA API 403 (P0-2) → Chat non-functional even for landing page visitors
EMPTY NAV (P0-3) → No wayfinding for any visitor
```

---

## Open P0 Blockers (4)

### P0-1: `[myavana_register]` / `[myavana_login]` shortcodes not rendered

| Field | Value |
|---|---|
| **SEVERITY** | P0 |
| **EVIDENCE LEVEL** | LEVEL 3 — AUTOMATED BROWSER |
| **URL** | https://myhairjourney.ai/register/ |
| **USER STATE** | Unauthenticated visitor |
| **STEPS** | Navigate to /register/ |
| **EXPECTED** | Email/password signup form renders |
| **ACTUAL** | Literal text `[myavana_register]` displayed. Zero form inputs. |
| **CONSOLE ERRORS** | Mixed content (fonts), 400 on admin-ajax.php |
| **LIKELY ROOT CAUSE** | WordPress plugin providing `myavana_register` shortcode is deactivated or missing |
| **BLOCKED DOWNSTREAM** | Login, Onboarding, all authenticated features |
| **VERIFIED CLOSED** | NO — pending re-test |

---

### P0-2: `/wp-json/myavana/v1/auth/chat-token` returns HTTP 403

| Field | Value |
|---|---|
| **SEVERITY** | P0 |
| **EVIDENCE LEVEL** | LEVEL 3 — AUTOMATED BROWSER (network capture) |
| **URL** | https://myhairjourney.ai/wp-json/myavana/v1/auth/chat-token |
| **HTTP STATUS** | 403 Forbidden |
| **USER STATE** | Unauthenticated visitor on landing page |
| **ACTUAL** | Chat token endpoint refuses request — Mya cannot initialize |
| **LIKELY ROOT CAUSE** | `permission_callback` on REST route is too restrictive (requires auth when unauthenticated token issuance is needed) |
| **BLOCKED DOWNSTREAM** | Mya (Chat with Mia CTA on landing page), all Mya interactions |
| **VERIFIED CLOSED** | NO — pending re-test |

---

### P0-3: Main navigation menu is empty

| Field | Value |
|---|---|
| **SEVERITY** | P0 |
| **EVIDENCE LEVEL** | LEVEL 3 — AUTOMATED BROWSER (DOM inspection) |
| **URL** | https://myhairjourney.ai/ |
| **ACTUAL** | `<nav id="main-menu" class="navbar-static-top"></nav>` — zero menu items |
| **LIKELY ROOT CAUSE** | No WordPress menu assigned to "Primary Navigation" location in Appearance → Menus |
| **BLOCKED DOWNSTREAM** | Any user attempting to navigate the site |
| **VERIFIED CLOSED** | NO — pending re-test |

---

### P0-4: Site never reaches network idle

| Field | Value |
|---|---|
| **SEVERITY** | P0 |
| **EVIDENCE LEVEL** | LEVEL 3 — AUTOMATED BROWSER |
| **URL** | https://myhairjourney.ai/ |
| **ACTUAL** | `page.goto(waitUntil:'networkidle')` times out at 30 seconds on every load |
| **POSSIBLE ROOT CAUSE** | Kommunicate widget or another plugin holds open indefinite long-poll XHR |
| **IMPACT** | Perceived load time infinite for any tool awaiting network idle; real users may experience slow/stalled loading |
| **VERIFIED CLOSED** | NO — pending re-test |

---

## Open P1 Problems (5)

### P1-1: Mixed content — Google Fonts blocked sitewide

- **EVIDENCE LEVEL**: LEVEL 3 (17 console errors captured)
- Google Fonts Raleway + Open Sans requested over `http://` — blocked by browser on HTTPS page
- **FIX**: Change `http://fonts.googleapis.com/` → `https://` in Louie theme functions.php
- **VERIFIED CLOSED**: NO

### P1-2: Dashboard / Hair Journey / Goals / Profile accessible without auth

- **EVIDENCE LEVEL**: LEVEL 2 (HTTP) + LEVEL 3 (browser nav)
- `/dashboard/`, `/hair-journey/`, `/goals/`, `/profile/` return HTTP 200 to unauthenticated session
- **VERIFIED CLOSED**: NO

### P1-3: Hair Profile (404) and Hair Diary (404)

- **EVIDENCE LEVEL**: LEVEL 2 (HTTP 404 confirmed)
- `/hair-profile` → 404; `/diary` → 404
- **VERIFIED CLOSED**: NO

### P1-4: `wp-admin/admin-ajax.php` returns HTTP 400 on page load

- **EVIDENCE LEVEL**: LEVEL 3 (network capture)
- Two automatic POSTs on landing page load return 400
- **VERIFIED CLOSED**: NO

### P1-5: Kommunicate widget fails to authenticate

- **EVIDENCE LEVEL**: LEVEL 3 (network + DOM)
- `kommunicate-widget-iframe` loads but chat-token 403 prevents initialization
- **VERIFIED CLOSED**: NO

---

## Open P2 Issues (6)

1. Default WordPress blog sidebar displayed on /register/ and /login/ pages
2. Body class exposes `non-logged-in` state in HTML
3. WordPress 7.0.4 + WPBakery + RevSlider 5.4.8 versions in meta generator tags
4. `xmlrpc.php` pingback link advertised (DDoS amplification risk)
5. `wp-login.php` accessible with no brute-force protection
6. Button labeled `"undefined"` (failed JS template substitution)

---

## Open P3 Issues (4)

1. `/signup`, `/sign-up`, `/sign-in`, `/signin` all → 404 (no redirects)
2. No Open Graph / Twitter Card / structured data meta tags
3. RevSlider 5.4.8 (~2018) — known critical CVEs
4. `viewport` meta missing `initial-scale=1`

---

## Automated Test Coverage Status

| Journey | Test Written | Last Result | Notes |
|---|---|---|---|
| Landing Page Load | ✅ | ⚠️ PARTIAL | domcontentloaded works; networkidle never resolves |
| Signup — Email | ✅ | 🔴 FAIL | Form not rendered |
| Signup — Google | ❌ Not written | — | Cannot test until signup form exists |
| Login | ✅ | 🔴 FAIL | Form not rendered |
| Onboarding | ❌ Blocked | — | Requires working auth |
| Dashboard | ✅ | ⚠️ SHELL | Returns 200, unprotected |
| Hair Profile | ✅ | 🔴 404 | Page not found |
| Hair Journey | ✅ | ⚠️ SHELL | Returns 200, unprotected |
| Goals | ✅ | ⚠️ SHELL | Returns 200, unprotected |
| Hair Diary | ✅ | 🔴 404 | Page not found |
| Community | ✅ | ⚠️ PARTIAL | Returns 200, content visible |
| Mya | ✅ | 🔴 FAIL | Chat token 403 |
| Logout | ❌ Blocked | — | Cannot log in |
| Re-login | ❌ Blocked | — | Cannot log in |
| Persistence | ❌ Blocked | — | Requires auth |
| Mobile — Landing | ✅ | 🔴 FAIL | domcontentloaded timeout |

---

## Verification Protocol

When engineering claims a fix is deployed:

1. Do NOT accept the claim at face value
2. Identify which test above covers the fix
3. Re-run Playwright against production
4. Report PASS or FAIL with browser evidence
5. Only close a finding when LEVEL 3 evidence confirms it

**"Source fixed" ≠ "Production fixed" ≠ "User journey works."**
