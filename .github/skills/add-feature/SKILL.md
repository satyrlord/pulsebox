---
name: add-feature
description: >
  Add or change Pulsebox features and product contracts. Use for product behavior,
  acceptance criteria, durable decisions, or approved contract changes from another skill.
---

# Add or change a Pulsebox feature

## 1. Select the branch

1. If the user requests only a contract or decision, use the definition branch.
   Completion criterion: The requested artifact and edit authority are clear.
2. If the user requests working product behavior, use the implementation branch.
   Completion criterion: The implementation scope and product outcome are clear.
3. If a confirmed defect changes or clarifies the contract, use the repair branch.
   Completion criterion: The defect, owner, and expected behavior are clear.

Do not implement product code in the definition branch. After a contract edit
in the implementation or repair branch, do not stop.

## 2. Read the contract

1. Read the repository root `AGENTS.md` and the
   [specification index](../../../docs/specs/spec-000-index.md).
   Completion criterion: You know the build order and owning specification.
2. Read the owning specification and each listed dependency in full.
   Completion criterion: You know every applicable requirement and acceptance criterion.
3. If the current implementation and tests exist, inspect them.
   Completion criterion: You know the current behavior and test seams.
4. Verify unstable browser or Web Audio facts with current primary sources.
   Completion criterion: Each material API claim has current evidence.

The indexed specification set is the approved product contract. Do not create
a second product specification.

## 3. Define the change

Record these items in the owning document:

- the user value and exact behavior
- the affected layer, plugin, message, command, and project contracts
- the assumptions and explicit exclusions
- the failure and recovery behavior
- the accessibility, undo, playback, browser, and layout effects
- each acceptance criterion and its objective verifier

Resolve each contradiction through a product decision. Do not remove approved
scope without that decision.

Completion criterion: Every changed fact has one owner and one objective
acceptance method.

## 4. Update the owners

1. Update the smallest owning specification for each accepted product change.
   Completion criterion: Each changed requirement has one specification owner.
2. If ownership or build order changes, update the index.
   Completion criterion: The index and child specifications agree.
3. If a domain contract changes, update its document.
   Completion criterion: Architecture, theme, or project-format facts have one owner.
4. If no current owner can contain the fact, add a document.
   Completion criterion: The new document has a unique scope and an index pointer.

Use [REFERENCE.md](REFERENCE.md) for durable-decision thresholds. If the change
branch or owning document is unclear, read [EXAMPLES.md](EXAMPLES.md).

## 5. Implement and verify

In the definition branch, skip this stage.

1. Implement the contract with the smallest complete change.
   Completion criterion: All changed behavior exists at the correct layer.
2. Add the narrowest tests that can fail for each changed contract.
   Completion criterion: Every acceptance change has direct regression evidence.
3. Run each affected repository check from `package.json`.
   Completion criterion: All applicable checks pass, or you report a blocker.
4. If user-visible behavior changes, verify it in the production build.
   Completion criterion: Each browser-facing contract has direct evidence.

## Completion criterion

In the definition branch, the work is complete after all requested contracts
and acceptance criteria agree. Report that the user did not request implementation.

In the implementation or repair branch, the work is complete after contracts,
source, tests, and user documentation agree. Every affected acceptance criterion
must have objective evidence.
