---
name: add-feature
description: Use when the user wants a Pulsebox feature added or changed, or a product contract, acceptance criterion, or durable decision recorded; or when another skill finds an approved contract must change.
---

# Add or change a Pulsebox feature

## Read first

1. Read repository root `AGENTS.md` and
   [docs/SPEC.md](../../../docs/SPEC.md) in full.
2. Find every existing requirement and acceptance criterion that owns the
   requested behavior.
3. Inspect the current implementation and tests when they exist.
4. Verify unstable browser or Web Audio facts with current primary sources.

The authoritative file is `docs/SPEC.md`. Do not create a second competing
specification.

## Define the change

Write down:

- the user value and exact behavior;
- affected engine, state, UI, persistence, plugin, and project-format contracts;
- assumptions and explicit non-goals;
- failure and recovery behavior;
- accessibility, undo, playback-continuity, and browser implications;
- specific acceptance criteria and an objective verification method.

Resolve contradictions with a product decision. Never make a feature fit by
silently dropping existing scope.

## Update the owning documents

- Update `docs/SPEC.md` for every accepted product or bug change.
- Update `docs/ARCHITECTURE.md` for durable layer or dependency decisions.
- Update `docs/THEMING.md` for token or theme-contract changes.
- Update `docs/PROJECT-FORMAT.md` for serialization, import, migration, asset,
  or export changes.
- Update the relevant instrument or effect plugin document for plugin behavior.
- Add a new document only when no existing owner can hold the information.

## Implement and verify

1. Make the smallest complete change that satisfies the updated contract.
2. Keep engine, state, and UI ownership intact.
3. Add or update unit, component, browser, visual, and audio evidence as the
   change requires.
4. Run the quality gate for the affected checks.
5. Check every affected acceptance criterion before close-out.

## Completion

Complete the work only when the specification, implementation, tests, and
user-facing documentation agree and every affected acceptance criterion has
objective evidence. Use [REFERENCE.md](REFERENCE.md) for decision thresholds and
[EXAMPLES.md](EXAMPLES.md) for Pulsebox examples.
