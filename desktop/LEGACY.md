# Legacy (v1): read-only

This directory belongs to MyaOS v1. As of 2026-11-03 (programme plan decision K1, approved by Winston) the canonical system is the V2 runtime in [`runtime/`](../runtime) with the desktop in [`apps/desktop/`](../apps/desktop), and the only workflow store is `~/.myaos/runtime.db`.

- Do not add features here or write new workflow state through this code.
- Bug fixes are allowed only to keep it running until its data is imported into V2 and the import is verified.
- It will be removed after that import is verified on the owner's machine (WP0-T10).

See [`community/proposals/MYAOS_V2_PROGRAMME_PLAN.md`](../community/proposals/MYAOS_V2_PROGRAMME_PLAN.md).
