---
name: add-feature
description: >
  Add or change Pulsebox features and product contracts. Use for product behavior,
  acceptance criteria, durable decisions, or approved contract changes from another skill.
---

# Add or change a Pulsebox feature

## 1. Select the branch

1. Use the definition branch when the user requests only a contract or decision.
   Finish when the requested artifact and edit authority are clear.
2. Use the implementation branch when the user requests working product behavior.
   Finish when the implementation scope and product outcome are clear.
3. Use the repair branch when a confirmed defect changes or clarifies the contract.
   Finish when the defect, owner, and expected behavior are clear.

Do not implement product code in the definition branch. Do not stop after a
contract edit in the implementation or repair branch.

## 2. Read the contract

1. Read repository root `AGENTS.md` and the
   [specification index](../../../docs/specs/spec-000-index.md).
   Finish when you know the build order and owning specification.
2. Read the owning specification and each listed dependency in full.
   Finish when you know every applicable requirement and acceptance criterion.
3. Inspect the current implementation and tests when they exist.
   Finish when you know the present behavior and test seams.
4. Verify unstable browser or Web Audio facts with current primary sources.
   Finish when each material API claim has current evidence.

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

Finish this stage when every changed fact has one owner and one objective
acceptance method.

## 4. Update the owners

1. Update the smallest owning specification for each accepted product change.
   Finish when each changed requirement has one specification owner.
2. Update the index only if ownership or build order changes.
   Finish when the index and child specifications agree.
3. Update the applicable domain document when its contract changes.
   Finish when architecture, theme, or project-format facts have one owner.
4. Add a document only if no current owner can contain the fact.
   Finish when the new document has a unique scope and an index pointer.

Use [REFERENCE.md](REFERENCE.md) for durable-decision thresholds. Read
[EXAMPLES.md](EXAMPLES.md) when the change branch or owning document is unclear.

## 5. Implement and verify

Skip this stage in the definition branch.

1. Make the smallest complete implementation that satisfies the contract.
   Finish when all changed behavior exists at the correct layer.
2. Add the narrowest tests that can fail for each changed contract.
   Finish when every acceptance change has direct regression evidence.
3. Run each affected repository check from `package.json`.
   Finish when all applicable checks pass or have a reported blocker.
4. Verify user-visible behavior in the production build when applicable.
   Finish when each browser-facing contract has direct evidence.

## Completion criterion

In the definition branch, complete the work when all requested contracts and
acceptance criteria agree. Report that the user did not request implementation.

In the implementation or repair branch, complete the work when contracts,
source, tests, and user documentation agree. Every affected acceptance criterion
must have objective evidence.
