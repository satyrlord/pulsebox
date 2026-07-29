---
name: improve-codebase-architecture
description: >
  Improve Pulsebox architecture and ownership boundaries. Use for structural
  friction, leaking seams, broad edit cost, or an architecture gap from another skill.
---

# Improve Pulsebox architecture

## 1. Select the branch

1. If the user does not request implementation, use analysis mode.
   Completion criterion: The work is read-only and the expected proposal is clear.
2. If the user gives explicit edit authority, use implementation mode.
   Completion criterion: The approved proposal and change scope are clear.

## 2. Establish the system map

1. Read `AGENTS.md`, the specification index, and each applicable owner.
   Completion criterion: You know the approved architecture and product boundary.
2. Read [spec-002](../../../docs/specs/spec-002-technical-foundations.md) and
   [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
   Completion criterion: You know each layer, port, protocol, and registry owner.
3. Inspect the source tree, dependency graph, and relevant tests.
   Completion criterion: Each suspected seam has direct file and dependency evidence.

## 3. Reduce friction at seams

Check for these conditions:

- engine, state, UI, persistence, or composition responsibilities have leaked
- a wrapper hides no policy or complexity
- plugin-specific branches bypass registries or adapters
- command, undo, validation, or migration policy has more than one owner
- audio nodes or temporary visual state enter persistence
- worklet order, frame count, latency, or allocation assumptions stay implicit
- React components rebuild broad trees or leave resources active
- schemas, assets, or theme rules span unrelated modules
- a local feature requires broad unrelated edits
- tests do not isolate one owner

Prefer a change that reduces caller dependencies and gives the complexity to
one owner.

Completion criterion: Every proposed problem has a concrete path, dependency,
or contract check.

## 4. Rank proposals

1. State the current friction and direct evidence.
   Completion criterion: Another agent can reproduce the structural cost.
2. Name the target owner and required contract change.
   Completion criterion: The new boundary has one accountable owner.
3. Define a before-and-after measure.
   Completion criterion: The measure shows fewer imports, branches, owners, or changed files.
4. State migration effects, risks, and the objective verifier.
   Completion criterion: The proposal includes all required transition work.
5. Rank the proposal by benefit, risk, and prerequisite order.
   Completion criterion: The order has no hidden dependency.

## 5. Implement authorized changes

1. Before behavior changes, update the owning contract.
   Completion criterion: The approved boundary is explicit.
2. Change the structure only as much as the contract requires.
   Completion criterion: The target owner has the intended responsibility.
3. Add tests for each changed seam.
   Completion criterion: A boundary regression can fail a focused test.
4. Run the applicable repository checks.
   Completion criterion: All affected checks pass, or you report a blocker.

## Completion criterion

In analysis mode, the work is complete after the system map has evidence. Each
ranked proposal must also have a measurable result. In implementation mode,
also require contracts, source, tests, and verification to agree.
