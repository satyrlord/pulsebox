---
name: dead-code-audit
description: >
  Audits the MixJam Electron (MJE) codebase for dead TypeScript code, orphan
  files, and unused symbols across main and renderer processes.
---

# Dead Code Audit

## Goal

Gather deterministic **evidence** of dead code in the TypeScript codebase
(main + renderer processes) — hard proof, not suspicion. Inspect only the
reported findings and either:

- report live findings and validated false positives, or
- remove provably dead code when the user explicitly asked for cleanup.

Use this skill for dead-code work only. Ordinary review, security review,
performance review, and merge-readiness review are out of scope here — that
is `full-code-review`'s domain.

## Read First

1. `AGENTS.md`

## Run Fallow Static Analysis First

Before gathering other evidence, run Fallow from the repository root:

```PowerShell
npm run fallow
```

Treat its output as findings, not permission to edit. In audit-only mode,
record and triage findings without changing files. In cleanup mode, edit only
findings covered by the user's request and the Deletion Standard.

If Fallow fails to run, report the exact failure and stop.

## Gather Evidence

Run from the repository root and collect findings from:

```PowerShell
# TypeScript compiler diagnostics (unused variables, unreachable code, unused parameters)
npm run typecheck

# ESLint diagnostics (unused imports, unused variables, dead code patterns)
npm run lint
```

For symbols the compiler cannot judge (unused exports, orphan files,
unreferenced CSS or assets), search for references with `rg`
across the project.

If typecheck or lint fails, preserve the diagnostics as evidence. Do not delete
anything until the relevant failure is understood and the deletion can be
validated independently.

## Weigh the Evidence

For each finding, gather the smallest local proof before editing:

- direct usages and references
- entrypoint wiring (main process, preload, renderer), React component
  tree, or IPC glue
- reflection, serialization, CSS class references, or dynamic imports
- contextBridge API surface — symbols exposed to the renderer may appear
  unused in the main process but are consumed over IPC
- tests or fixtures that rely on the symbol or file

If the evidence shows the finding is a false positive (still alive through
one of these paths), report the concrete reason rather than deleting.

## Act on the Evidence

1. If the request is audit-only, report findings and their evidence without
   editing.
2. If the request includes cleanup and the evidence meets the Deletion
   Standard in [REFERENCE.md](REFERENCE.md), delete the smallest slice that
   removes it.
3. After each deletion, run Audit Validation before widening scope.
4. For false positives, suggest the narrowest suppression or config
   refinement only when the same false positive is likely to recur.

## Completion Criterion

The audit is complete when:

- the requested audit or cleanup scope is explicit,
- every reported finding has been triaged as live, false positive, or removed,
- the evidence for each decision is explicit,
- no cleanup was performed without proof,
- and Audit Validation passes after every edit, or the exact blocker is
  reported without claiming completion.

## Deep Reference

Use [REFERENCE.md](REFERENCE.md) for the Deletion Standard, False Positive
Checklist, Reporting contract, and Audit Validation steps. Use
[EXAMPLES.md](EXAMPLES.md) for concrete audit and cleanup scenarios.
