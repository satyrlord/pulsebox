---
name: improve-codebase-architecture
description: Use when the user asks what Pulsebox architecture should change, where boundaries are eroding, or how to reduce structural friction; or when another skill surfaces an architecture gap.
---

# Improve Pulsebox architecture

Remain read-only unless implementation is explicitly requested.

## Establish the system

Read repository root `AGENTS.md`, [docs/SPEC.md](../../../docs/SPEC.md),
[docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md), the current source tree,
tests, and dependency graph.

## Find leverage

Leverage lives where a **seam** is missing, misplaced, or leaking. Look for:

- engine, state, and UI responsibilities leaking across boundaries;
- shallow wrappers that do not hide complexity;
- plugin-specific branches outside registries and adapters;
- command or undo policy duplicated across features;
- live audio objects or transient visual state entering persistence;
- worklet protocols with implicit ordering, frame-size, latency, or allocation
  assumptions;
- Custom Elements that rebuild too much DOM or fail to clean up;
- project schema, validation, migration, or asset ownership spread across
  unrelated modules;
- theme-specific markup or TypeScript instead of stable tokens;
- modules that force broad edits for a local feature;
- planned interfaces that cannot be tested independently.

Prefer changes that remove knowledge from callers, make invariants explicit,
and let one owner absorb complexity.

## Propose

For each proposal, state the current friction, evidence, target owner, contract
change, migration or compatibility consequence, expected simplification,
risks, and objective verifier. Separate prerequisite contract work from later
implementation.

Rank proposals by leverage and risk. Do not turn broad discomfort into a
proposal without a concrete file, dependency, or contract check.

Complete when the architecture map is evidence-backed, proposals are ranked,
and no code was changed unless the user authorized it.
