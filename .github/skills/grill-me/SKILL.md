---
name: grill-me
description: >
  Before implementation, challenge a Pulsebox plan or design. Use to resolve open
  product, architecture, persistence, audio, UI, verification, or delivery decisions.
---

# Challenge a Pulsebox decision

If the user does not authorize workspace edits, remain read-only.

## 1. Prepare the decision tree

1. Read `AGENTS.md`, the specification index, each owner, and each dependency.
   Completion criterion: You know the approved contract and open questions.
2. Inspect implementation that the plan claims already exists.
   Completion criterion: Each implementation claim has direct evidence.
3. Resolve facts that current repository files or primary sources can answer.
   Completion criterion: Only genuine product choices remain.
4. List the decision branches from parent to child.
   Completion criterion: The highest-risk and least-reversible branch is first.

Do not ask a question that available evidence can answer.

## 2. Resolve one branch at a time

1. State the current branch and its material trade-offs.
   Completion criterion: The user can compare the valid choices.
2. Recommend one evidence-based choice.
   Completion criterion: The recommendation has a clear reason and verifier.
3. Ask one question.
   Completion criterion: The user gives an answer or explicitly defers the branch.
4. Record the answer and its downstream effects.
   Completion criterion: No child branch depends on an unstated parent choice.
5. If the answer exposes a material dependency, add a branch.
   Completion criterion: The tree contains no speculative branch.

Probe relevant product and delivery risks. Include ownership, persistence,
audio, accessibility, browser, layout, originality, and verification risks.

If a concrete question sequence is useful, read [EXAMPLES.md](EXAMPLES.md).

## 3. Record authorized decisions

1. Identify the owning specification or domain document for each decision.
   Completion criterion: Every durable fact has one owner.
2. If the user authorizes edits, update only the owning document.
   Completion criterion: No parallel decision document exists.
3. If the user does not authorize edits, report the exact future document change.
   Completion criterion: Another agent can apply it without reopening the decision.

## Completion criterion

The session is complete after you resolve or defer every inventoried branch.
Each deferral must name an owner, reason, and verification step. Route authorized
implementation to `add-feature`, `refactor`, or `diagnose` as applicable.
