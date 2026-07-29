---
name: full-code-review
description: >
  Review Pulsebox changes before they land. Use for a diff, branch, change set,
  pending work, or requested repair of confirmed review findings.
---

# Review Pulsebox code

Review without edits first. Edit only when the user requests repairs.

## 1. Establish the review surface

1. Inspect status, the complete diff, untracked files, and recent history.
   Finish when every changed path and unrelated dirty path is classified.
2. Read every changed file and its owning specification sections.
   Finish when each changed behavior has an identified contract owner.
3. Read relevant callers, registries, commands, migrations, components, and tests.
   Finish when each changed seam can be judged in context.
4. Map each changed contract to its current evidence.
   Finish when every affected acceptance criterion has a pass, gap, or blocker.

## 2. Review each seam

Most defects cross a **seam** that should have one owner. Check every applicable
item in this list:

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

Read [REFERENCE.md](REFERENCE.md) when a confirmed seam defect needs a standard
Pulsebox remedy.

## 3. Report findings

1. Order findings by user impact and release risk.
   Finish when blocking findings appear before non-blocking findings.
2. Give a path, location, broken contract, evidence, impact, and remedy.
   Finish when another agent can reproduce and repair each finding.
3. State when no blocking finding remains.
   Finish when every changed path and affected criterion is accounted for.

Treat existing review comments as hypotheses until current evidence confirms
them.

## 4. Repair when requested

1. Implement only confirmed findings inside the authorized scope.
   Finish when every accepted finding has a complete repair.
2. Add or update the narrowest regression evidence.
   Finish when each repair has a test that can detect its defect.
3. Run the applicable repository quality gate.
   Finish when all affected checks pass or have a reported blocker.
4. Re-review the final diff from a clean context for high-risk work.
   Finish when no acceptance-blocking finding remains.

## Completion criterion

The review is complete when every changed path, contract, and acceptance
criterion is accounted for. Each finding must have reproducible evidence and an
actionable remedy. Authorized repairs must pass their direct regression checks.
