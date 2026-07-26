---
name: add-feature
description:
  Define or change a Pulsebox feature, product contract, acceptance criterion,
  architecture boundary, project format, plugin contract, or durable product
  decision before or alongside implementation.
---

# Add or change a Pulsebox feature

## Read first

1. Read AGENTS.md and the full approved product specification.
2. Find every existing requirement and acceptance criterion that owns the
   requested behavior.
3. Inspect the current implementation and tests when they exist.
4. Verify unstable browser or Web Audio facts with current primary sources.

The authoritative file is SPEC.md. Do not create a second competing
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

- Update the unified specification for every accepted product or bug change.
- Update ARCHITECTURE.md for durable layer or dependency decisions when it
  exists.
- Update THEMING.md for token or theme-contract changes when it exists.
- Update PROJECT-FORMAT.md for serialization, import, migration, asset, or
  export changes when it exists.
- Update the relevant instrument or effect plugin document for plugin behavior.
- Add a new document only when no existing owner can hold the information.

Do not write placeholder documents that describe code as implemented before it
exists.

## Implement and verify

1. Make the smallest complete change that satisfies the updated contract.
2. Keep engine, state, and UI ownership intact.
3. Add or update unit, component, browser, visual, and audio evidence as the
   change requires.
4. Run only discovered repository commands. If the package scripts do not exist
   yet, state that clearly.
5. Check every affected acceptance criterion before close-out.

## Completion

Complete the work only when the specification, implementation, tests, and
user-facing documentation agree and every affected acceptance criterion has
objective evidence. Use [REFERENCE.md](REFERENCE.md) for decision thresholds and
[EXAMPLES.md](EXAMPLES.md) for Pulsebox examples.
