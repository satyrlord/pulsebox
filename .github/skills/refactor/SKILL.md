---
name: refactor
description: >
  Surgical, behavior-preserving cleanup for the MixJam Electron (MJE)
  repository. Use when the user asks to refactor — reduce complexity or make
  code easier to change without adding features.
---

# Refactor

Reduce structural and local complexity without changing behavior, contracts,
or validation coverage. Take small steps and validate after each one; do not
mix cleanup with new feature work or widen into drive-by edits.

Project-specific hazards — read more context before touching these
(Chesterton's fence):

- IPC channel lifecycle: main-to-renderer contracts defined in the preload
  contextBridge; changing channel names, payload shapes, or sync/async
  semantics silently breaks the typed API between processes
- React stale closures (renderer): memoized callbacks or effect
  dependencies that capture stale state; "simplifying" by moving state
  outside hooks can break reactive updates silently
- Web Audio lifecycle: `AudioContext` state transitions (suspended/resumed)
  must be handled asynchronously; simplifying AudioNode creation patterns
  can leak nodes or break scheduling
- SQLite query hazards: sqlite-wasm calls are synchronous on the backend
  worker's single connection; long scans must stay batched in transactions
  that yield between batches. Refactoring query builders can accidentally
  drop parameterized bindings or FTS5 match syntax

Delete dead code only when you can prove it is off the active path
(`dead-code-audit` owns the full sweep).

Add a focused regression test before risky structural changes. If the
cleanup changes a durable seam, follow with `add-feature`.

## Completion Criterion

The refactor is done when all of the following are true:

- **Behavior preserved** — all existing tests pass. No regression uncovered
  by the change.
- **Complexity reduced** — the refactored code is simpler, smaller, or more
  readable than before. Not a lateral move.
- **No new dead code** — no paths left orphaned by the change. (If you
  suspect dead code remains, run `dead-code-audit`.)
- **No drive-by edits** — every changed line serves the refactoring goal.
  No scope-creep fixes or features mixed in.
