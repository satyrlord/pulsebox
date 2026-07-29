---
name: refactor
description: >
  Refactor Pulsebox without changing behavior. Use for an authorized restructure,
  simplification, reorganization, or behavior-preserving change from another skill.
---

# Refactor Pulsebox

## 1. Establish the invariant

1. Read `AGENTS.md`, each owning specification, the source, and its tests.
   Finish when the preserved behavior and affected seams are explicit.
2. Exclude feature work and unrelated cleanup from the scope.
   Finish when every planned line serves the stated refactor.
3. Select one before-and-after complexity measure.
   Finish when imports, branches, duplicate owners, or edit surface can show improvement.
4. Add a focused regression test before changing a critical seam.
   Finish when the test can fail for the behavior at risk.

## 2. Protect the seams

Preserve each applicable contract:

- engine, state, UI, persistence, and composition ownership
- typed commands, inverse data, and gesture coalescing
- plugin descriptors, registries, and stable IDs
- React lifecycle, focus, style, events, and cleanup
- worklet frame counts, memory, message order, smoothing, and offline parity
- schema versions, migrations, import validation, assets, and preferences
- theme tokens without theme-specific TypeScript or markup

Finish this stage when every applicable seam has a direct test or inspection
method.

## 3. Refactor in coherent steps

1. Make the smallest structural change.
   Finish when the code compiles and the preserved behavior remains testable.
2. Run the narrowest affected checks.
   Finish when the step passes or you record the exact pre-existing failure.
3. Repeat only while the next step serves the same refactor.
   Finish when no planned step adds product behavior.
4. Compare the selected complexity measure with its baseline.
   Finish when the result is lower and no new owner or branch offsets the gain.

Use `dead-code-audit` for broad reachability cleanup. Use `add-feature` when an
approved product contract must change.

## Completion criterion

Complete the refactor when behavior and contracts stay unchanged. Every affected
check must pass. Report the before-and-after complexity measure and account for
every changed line.
