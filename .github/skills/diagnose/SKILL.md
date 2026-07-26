---
name: diagnose
description: >
  Diagnoses hard bugs and performance regressions with a controlled feedback
  loop, and implements the fix only when requested. Use when the failure is
  flaky, not yet reproducible, still lacks a root cause, or needs measurement.
---

# Diagnose

A discipline for hard bugs. When the failure mode and repro are already
narrow, use the smallest feedback loop that can still falsify the suspected
cause.

## Phases

Work through these in order:

1. **Build a feedback loop** — the highest-leverage step; do not skip.
2. **Reproduce** — confirm the loop matches the user's reported symptom.
3. **Hypothesise** — 3–5 ranked, falsifiable hypotheses; show the user.
4. **Instrument** — one variable at a time; tagged debug logs or perf baseline.
5. **Conclude or fix** — report the proven cause; implement and regression-test
   only when the request authorizes a fix.
6. **Cleanup + post-mortem** — remove instrumentation; hand off architecture
   findings to `improve-codebase-architecture` when warranted.

## Completion Criterion

The successful diagnosis branch is complete when:

- the bug or regression is reproduced with a feedback loop,
- the root cause is supported by evidence that distinguishes it from the other
  ranked hypotheses,
- the requested output is delivered: either a diagnosis with a concrete fix
  and regression-test plan, or an implemented fix with a passing regression
  test,
- and the instrumentation is removed unless it remains necessary.

The blocked branch is complete when the feedback loop cannot be built after
the documented attempts, the missing artifact or access is named, and no root
cause or fix is claimed.

## Deep Reference

Use [REFERENCE.md](REFERENCE.md) for full phase instructions, loop construction
patterns, and the HITL script at
[scripts/hitl-loop.template.ps1](scripts/hitl-loop.template.ps1). Use
[EXAMPLES.md](EXAMPLES.md) for concrete diagnosis loops.
