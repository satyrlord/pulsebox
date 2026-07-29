---
name: refactor
description: >
  Refactor Pulsebox without changing behavior. Use for an authorized restructure,
  simplification, reorganization, or behavior-preserving change from another skill.
---

# Refactor Pulsebox

## 1. Establish the invariant

1. Read `AGENTS.md`, each owning specification, the source, and its tests.
   Completion criterion: The preserved behavior and affected seams are explicit.
2. Exclude feature work and unrelated cleanup from the scope.
   Completion criterion: Every planned line serves the stated refactor.
3. Select one before-and-after complexity measure.
   Completion criterion: Imports, branches, duplicate owners, or changed file count can show improvement.
4. Before you change a critical seam, add a focused regression test.
   Completion criterion: The test can fail for the behavior at risk.

## 2. Protect the seams

Preserve each applicable contract:

- engine, state, UI, persistence, and composition ownership
- typed commands, inverse data, and gesture coalescing
- plugin descriptors, registries, and stable IDs
- React lifecycle, focus, style, events, and cleanup
- worklet frame counts, memory, message order, smoothing, and offline parity
- schema versions, migrations, import validation, assets, and preferences
- theme tokens without theme-specific TypeScript or markup

Completion criterion: Every applicable seam has a direct test or inspection
method.

## 3. Refactor in coherent steps

1. Change the structure only as much as the refactor requires.
   Completion criterion: The code compiles and the preserved behavior remains testable.
2. Run the narrowest affected checks.
   Completion criterion: The step passes or you record the exact pre-existing failure.
3. If the next step serves the same refactor, repeat the process.
   Completion criterion: No planned step adds product behavior.
4. Compare the selected complexity measure with its baseline.
   Completion criterion: The result is lower and no new owner or branch offsets the gain.

Use `dead-code-audit` for broad reachability cleanup. If an approved product
contract must change, use `add-feature`.

## Completion criterion

The refactor is complete after you confirm that behavior and contracts did not
change. Every affected check must pass. Report the before-and-after complexity
measure and account for every changed line.
