---
name: run-quality-gate
description: Runs the repository quality gate in verification or repair mode. Use to assess release readiness, clear diagnostics, fix lint or test failures, or enforce the unit-coverage policy.
---

# Run Quality Gate

Run a fixed **gate** sequence with objective command evidence.

## Select Mode

- **Verify mode:** use when the user asks whether the branch passes. Run every
  applicable gate and report failures without editing source, tests, or config.
- **Repair mode:** use when the user asks to clean or fix the branch. Close each
  gate before moving to the next; edit only causes within the requested
  repository scope.

Never introduce suppressions, exclusions, disabled rules, or lower thresholds
without explicit user approval.

Read [REFERENCE.md](REFERENCE.md) once before execution for command discovery,
coverage interpretation, stop conditions, and the report contract.

## Gates

Run in this order:

1. **Problems:** use a whole-workspace diagnostics API when one is available.
   Otherwise mark this gate `N-A` with the missing capability; do not claim the
   Problems panel is empty.
2. **Markdown:** run the discovered repository Markdown command or the
   documented fallback. Pass only on zero findings.
3. **ESLint:** run the discovered lint command. Pass only on a clean exit.
4. **Fallow:** run the dead-code command. Pass only on zero findings.
5. **Unit:** run the discovered unit suite. Pass when all tests pass; use `N-A`
   only when no suite exists.
6. **E2E:** run the discovered Electron E2E suite. Pass when all tests pass; use
   `N-A` only when no suite exists.
7. **Coverage:** run unit coverage, supplementary E2E coverage when available,
   and the combined report. Pass only when every reported unit Statements,
   Branches, Functions, and Lines cell is at least 70%.

In verify mode, continue after a failed gate when later commands remain safe
and independent. In repair mode, stop at a condition defined in
[REFERENCE.md](REFERENCE.md).

## Repair Loop

For each open gate in repair mode:

1. Capture the exact failing command and diagnostic.
2. Identify the smallest root cause.
3. Apply the smallest in-scope repair.
4. Re-run that gate until it passes or reaches a stop condition.
5. Record every changed file before advancing.

## Completion Criterion

The gate run is complete when every applicable gate has an objective status,
commands and outcomes are recorded in order, no unauthorized suppression or
edit occurred, and the final output satisfies the report contract in
[REFERENCE.md](REFERENCE.md). Claim an overall pass only when every applicable
gate passes.
