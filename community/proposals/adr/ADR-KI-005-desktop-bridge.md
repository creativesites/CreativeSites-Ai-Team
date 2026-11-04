# ADR-KI-005 — The desktop calls the Node KI through one Tauri command

**Status:** Accepted (Rust side not compiled in the authoring environment). **Decision.** `myaos_knowledge_call(method, params)` spawns `node bin/ki-rpc.js`; the acting principal comes from host env (`KI_USER/KI_ROLE/KI_ORG`), never the request. **Why:** reimplementing permissions/evidence gates in Rust would create two rule sets. **Consequences:** ~100–200 ms per call (process start); acceptable for a management console. A long-lived localhost service is the follow-up if latency matters.
