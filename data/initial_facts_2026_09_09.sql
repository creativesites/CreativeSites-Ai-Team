-- Initial FACTS populated from Vela's investigation (2026-09-09)
-- These are verified findings from multi-repository analysis

INSERT INTO facts (id, claim, category, repository, evidence_class, evidence, verification_command, verified_by, verified_at, freshness_days, status, expires_at, tags) VALUES

-- Chat Protocol Duplication
('FACT-001',
 'BlockType enum exists in three byte-identical copies, not two',
 'architecture',
 'Myavana-Chatbot',
 'VERIFIED',
 'diff packages/core/src/chatProtocol/types.js packages/myavana/src/chatProtocol/types.js exit 0; diff packages/core/src/chatProtocol/types.js packages/chat-protocol/src/types.js exit 0',
 'cd packages && for f in core myavana chat-protocol; do echo "=== $f ===" && grep "BlockType\s*=" "$f/src/chatProtocol/types.js" 2>/dev/null || grep "BlockType\s*=" "$f/src/types.js" 2>/dev/null; done',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["protocol-duplication", "architecture", "high-priority"]'
),

-- Chat Protocol Canonical Source
('FACT-002',
 'packages/chat-protocol is the properly-structured shared npm package (myavana-chat-protocol); react-native-sdk already depends on it correctly',
 'architecture',
 'Myavana-Chatbot',
 'VERIFIED',
 'packages/chat-protocol/package.json describes it as "Shared chat wire protocol... for Mya across web, dashboard, and mobile"; packages/react-native-sdk/package.json lists it in dependencies',
 'grep -l "myavana-chat-protocol" packages/*/package.json',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["protocol-duplication", "architecture", "high-priority"]'
),

-- ProfileEntity Hairstyle Field
('FACT-003',
 'ProfileEntity has no "hairstyle" or "current_style" field; profile only tracks type/porosity/density/length/journey_stage/health_rating/concerns/goals',
 'codebase',
 'myavana-hair-journey-next',
 'VERIFIED',
 'ProfileEntity.php lines 21-43 enumerated public fields: hairType, porosity, density, length, hairJourneyStage, hairHealthRating, lifeJourneyStage, concerns, goals. No hairstyle field.',
 'sed -n "21,43p" includes/Domain/Profile/ProfileEntity.php | grep -i hairstyle',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["profile", "hairstyle", "data-model"]'
),

-- Journal Entry Hairstyle Field
('FACT-004',
 'JournalEntryEntity has no hairstyle field; entries capture entryType/mood/moistureLevel/scalpState/productsUsed/photos/notes/tags but not structured hairstyle',
 'codebase',
 'myavana-hair-journey-next',
 'VERIFIED',
 'JournalEntryEntity.php lines 1-40 show all public fields; hairstyle not present. Users can mention hairstyle in free-text notes/tags but no queryable field.',
 'grep -n "public\|class\|hairstyle" includes/Domain/Journal/JournalEntryEntity.php | head -30',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["hairstyle", "data-model", "journal"]'
),

-- Location Field Exists
('FACT-005',
 'ProfileEntity.location (free-text city/state, e.g. "Atlanta, GA") already exists and persists to myavana_location user meta; no zip field exists',
 'codebase',
 'myavana-hair-journey-next',
 'VERIFIED',
 'ProfileEntity.php:21 "public string $location"; UI shows placeholder "e.g. Atlanta, GA" in templates/views/profile.php:314 and header-and-sidebar.php:422; persisted via ProfileRepository:44-45',
 'grep -n "location" includes/Domain/Profile/ProfileEntity.php includes/Domain/Profile/ProfileRepository.php templates/views/profile.php templates/pages/partials/header-and-sidebar.php',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["location", "weather", "profile", "existing-feature"]'
),

-- FCM Token Capture and Flow
('FACT-006',
 'Mobile app (MyAvana_FrontEnd_RN/src/App.js) has real @react-native-firebase/messaging integration: getToken(), requestPermission(), onMessage(), setBackgroundMessageHandler()',
 'codebase',
 'MyAvana_FrontEnd_RN',
 'VERIFIED',
 'App.js lines 7-10 import Firebase messaging; lines 89-282 implement token capture, refresh, permission request, foreground/background handlers',
 'grep -n "messaging\|FCM\|getToken\|requestPermission" MyAvana_FrontEnd_RN/src/App.js',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["fcm", "mobile", "push-notifications", "existing-feature"]'
),

-- FCM Token Destination
('FACT-007',
 'FCM token IS sent from mobile app to https://api.myavana.com/Account/userDetails?deviceId=<token> via saveDeviceId() called at dashboard/index.js:815',
 'deployment',
 'MyAvana_FrontEnd_RN',
 'VERIFIED',
 'dashboard/index.js:740-815 implements saveDeviceId() which retrieves FCM token from AsyncStorage and POSTs to baseUrlLive (= https://api.myavana.com/) Account/userDetails endpoint with deviceId and isAndroid params',
 'grep -n "saveDeviceId\|api.myavana.com\|deviceId" MyAvana_FrontEnd_RN/src/components/Screens/dashboard/index.js',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["fcm", "deployment", "api.myavana.com", "existing-infrastructure"]'
),

-- Notification Infrastructure Partial
('FACT-008',
 'Notifications infrastructure is partial: profile has emailNotifications/communityNotifications toggles (stored but unused); community likes/comments create notifications in DB; routines show in-app only; no proactive email/push exists yet',
 'architecture',
 'myavana-hair-journey-next',
 'OBSERVED',
 'ProfileEntity:38-39 has toggles; SocialFeatures.php:244-275 creates myavana_notifications table; RoutineTracking.php:539-658 computes notifications pulled only on app open; grep for wp_mail only in AuthService.php (auth emails only)',
 'grep -rn "wp_mail\|emailNotifications\|communityNotifications" includes/Domain includes/Application includes/Http --include="*.php"',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["notifications", "architecture", "partial-feature"]'
),

-- P0 Auth Fix (Nonce)
('FACT-009',
 'X-WP-Nonce sent on public auth endpoints (register/login/google/forgot-password/reset-password) causes 403 for stale nonce; fix is to skip nonce header on public endpoints using existing isPublicEndpoint() helper',
 'bug-root-cause',
 'myavana-hair-journey-next',
 'VERIFIED',
 'assets/js/api.js includes nonce in every request; public endpoints are defined with permission_callback __return_true but WordPress rest_cookie_check_errors() runs BEFORE route permission callback, rejecting with 403/rest_cookie_invalid_nonce if nonce stale; fix: conditionally omit nonce for public routes',
 'curl -X POST https://myhairjourney.ai/wp-json/myavana/v1/auth/register -H "Content-Type: application/json" -d "..." returns 403/rest_cookie_invalid_nonce when nonce > 24h old (test against cached homepage)',
 'agent-2',
 '2026-09-09',
 14,
 'active',
 datetime('now', '+14 days'),
 '["p0", "auth", "root-cause", "identified", "fix-committed"]'
),

-- P0 Auth Fix Isolation
('FACT-010',
 'P0 auth nonce fix cleanly isolated onto hotfix/p0-signup-login-nonce branch (2 files: api.js + version bump); dirty tree on widget-polish-and-real-data contains ~37 other unreviewed files from separate work',
 'deployment',
 'myavana-hair-journey-next',
 'VERIFIED',
 'git show hotfix/p0-signup-login-nonce --stat shows only assets/js/api.js and myavana-hair-journey-next.php changed; branch branched from origin/main commit 5a83df4',
 'git diff origin/main hotfix/p0-signup-login-nonce --stat',
 'agent-2',
 '2026-09-09',
 14,
 'active',
 datetime('now', '+14 days'),
 '["p0", "deployment", "isolated-fix"]'
),

-- Deploy Mechanism Manual
('FACT-011',
 'myhairjourney.ai WordPress plugin deployment is currently manual: Winston uploads plugin ZIP through wp-admin; no GitHub Actions or automated pipeline exists yet',
 'deployment',
 'myavana-hair-journey-next',
 'ATTESTED',
 'Winston confirmed in Myavana-Chatbot thread that deployment is manual ZIP upload; investigation revealed no GitHub Actions workflow in repo; team tasked with building real CI/CD pipeline to replace manual uploads',
 'ls -la .github/workflows/',
 'agent-2',
 '2026-09-09',
 30,
 'active',
 datetime('now', '+30 days'),
 '["deployment", "manual-process", "no-ci-cd"]'
);

-- Create provenance record for this import
INSERT INTO provenance_log (actor, operation, reason, evidence_class, evidence) VALUES
('agent-2',
 'FACTS_BULK_IMPORT',
 'Phase 1 initialization: Vela investigation into P0 auth bug, protocol duplication, and feature scope',
 'VERIFIED',
 'Discovered during multi-repo cross-session coordination (Myavana-Chatbot + myavana-hair-journey-next + MyAvana_FrontEnd_RN); verified by direct code inspection and manual testing'
);
