---
name: improve-codebase-architecture
description: >
  Improve Pulsebox architecture and ownership boundaries. Use for structural
  friction, leaking seams, broad edit cost, or an architecture gap from another skill.
---

# Improve Pulsebox architecture

## 1. Select the branch

1. Use analysis mode unless the user requests implementation.
   Finish when the work is read-only and the expected proposal is clear.
2. Use implementation mode only with explicit edit authority.
   Finish when the approved proposal and change scope are clear.

## 2. Establish the system map

1. Read `AGENTS.md`, the specification index, and each applicable owner.
   Finish when you know the approved architecture and product boundary.
2. Read [spec-002](../../../docs/specs/spec-002-technical-foundations.md) and
   [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
   Finish when you know each layer, port, protocol, and registry owner.
3. Inspect the source tree, dependency graph, and relevant tests.
   Finish when each suspected seam has direct file and dependency evidence.

## 3. Find leverage at seams

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

Prefer a change that removes knowledge from callers and makes one owner absorb
the complexity.

Finish this stage when every proposed problem has a concrete path, dependency,
or contract check.

## 4. Rank proposals

1. State the current friction and direct evidence.
   Finish when another agent can reproduce the structural cost.
2. Name the target owner and required contract change.
   Finish when the new boundary has one accountable owner.
3. Define a before-and-after measure.
   Finish when the selected measure shows fewer imports, branches, owners, or changed files.
4. State migration effects, risks, and the objective verifier.
   Finish when the proposal includes all required transition work.
5. Rank the proposal by leverage, risk, and prerequisite order.
   Finish when the order has no hidden dependency.

## 5. Implement when requested

1. Update the owning contract before behavior changes.
   Finish when the approved boundary is explicit.
2. Make the smallest complete structural change.
   Finish when the target owner absorbs the intended responsibility.
3. Add tests for each changed seam.
   Finish when a boundary regression can fail a focused test.
4. Run the applicable repository checks.
   Finish when all affected checks pass or have a reported blocker.

## Completion criterion

In analysis mode, complete the work when the system map has evidence and each
ranked proposal has a measurable result. In implementation mode, also require
contracts, source, tests, and verification to agree.
