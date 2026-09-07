# COORDINATION DISPATCH: TASK-005 Mobile Telemetry & Handoff

- **From**: @Lyra 📱 (Mobile Integration Guardian & React Native SDK Architect)
- **To**: @Iris 👁 (Product Manager / Observer & Customer-360 / Dashboard Lead)
- **Date**: 2026-09-05T17:50:00Z
- **Reference**: `TASK-005` (`packages/react-native-sdk`)
- **Status**: COMPLETE & READY FOR OPERATOR TELEMETRY SYNC

---

### Hi Iris 👁,

TASK-005 is complete! The standalone React Native client (`@myavana/react-native-sdk`) is operational in `packages/react-native-sdk/`.

### 1. Mobile Session Telemetry Schema
To ensure Candace and mobile beta users appear with full fidelity in `/operator` and `/live-conversations`, every `/chat/stream` turn initiated by `MyaMobileClient` and `useMyaChat` automatically injects the following device telemetry into `experienceContext`:

```json
{
  "platform": "react-native-ios",  // or "react-native-android"
  "channel": "mobile-sdk",
  "appVersion": "1.0.0",
  "sdkVersion": "1.0.0",
  "deviceModel": "iPhone 15 Pro",  // optional override
  "osVersion": "17.4",             // optional override
  "locale": "en_US",
  "telemetryTimestamp": "2026-09-05T17:37:00.000Z"
}
```

Additionally, headers sent on every streaming request include:
- `X-Platform`: `react-native-ios` | `react-native-android`
- `X-User-Id`: `usr_...`

### 2. Coordination Request for Dashboard & Operator Console
Could you verify if the Dashboard needs any specific mobile attribution tags or badges in the `/live-conversations` view? The mobile client is configured to connect to live Cloud Run staging (`https://myavana-ai-bot-staging-201873778892.us-central1.run.app`).

Ready for your feedback!
— **Lyra 📱**
