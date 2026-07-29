---
name: full-code-review
description: >
  Before Pulsebox changes merge, review them. Use for a diff, branch, change set,
  pending work, or requested repair of confirmed review findings.
---

# Review Pulsebox code

Review without edits first. If the user requests repairs, edit the files.

## 1. Establish the review scope

1. Inspect status, the complete diff, untracked files, and recent history.
   Completion criterion: You classify every changed path and unrelated dirty path.
2. Read every changed file and its owning specification sections.
   Completion criterion: You identify a contract owner for each changed behavior.
3. Read relevant callers, registries, commands, migrations, components, and tests.
   Completion criterion: You can judge each changed seam in context.
4. Map each changed contract to its current evidence.
   Completion criterion: Every affected acceptance criterion has a pass, gap, or blocker.

## 2. Review each seam

A **seam** must have one owner. Check every applicable item in this list:

- approved behavior and affected acceptance criteria
- engine, state, UI, persistence, and composition ownership
- plugin descriptors, stable IDs, and registry-driven extension
- typed commands, complete inverse data, and gesture coalescing
- worklet frame-size independence, memory, smoothing, lifecycle, and message order
- project schema, migration, import validation, assets, and preferences
- React composition, effect cleanup, input, focus, accessibility, and layout
- the `rack` theme, high contrast, user themes, and token-only styling
- prohibited server, native, PWA, service-worker, MIDI, and main-thread DSP code
- naming, originality, shipping boundaries, and research isolation
- cohesive modules, explicit invariants, and single ownership of policy
- direct unit, browser, visual, persistence, export, and audio evidence

Do not use an arbitrary file-size limit. Judge ownership, cohesion, and
attention cost from the actual change.

If a confirmed seam defect needs a standard Pulsebox remedy, read
[REFERENCE.md](REFERENCE.md).

## 3. Report findings

1. Order findings by user impact and release risk.
   Completion criterion: Blocking findings appear before non-blocking findings.
2. Give a path, location, broken contract, evidence, impact, and remedy.
   Completion criterion: Another agent can reproduce and repair each finding.
3. State when no blocking finding remains.
   Completion criterion: You account for every changed path and affected criterion.

Treat existing review comments as hypotheses until current evidence confirms
them.

## 4. Repair authorized findings

1. In the authorized scope, implement confirmed findings.
   Completion criterion: Every accepted finding has a complete repair.
2. Add or update the narrowest regression evidence.
   Completion criterion: Each repair has a test that can detect its defect.
3. Run the applicable repository quality gate.
   Completion criterion: All affected checks pass, or you report a blocker.
4. For high-risk work, re-review the final diff from a clean context.
   Completion criterion: No acceptance-blocking finding remains.

## Completion criterion

The review is complete when you account for every changed path, contract, and
acceptance criterion. Each finding must have reproducible evidence and an
actionable remedy. Authorized repairs must pass their direct regression checks.
