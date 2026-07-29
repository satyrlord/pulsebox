---
name: grill-me
description: >
  Challenge a Pulsebox plan or design before implementation. Use to resolve open
  product, architecture, persistence, audio, UI, verification, or delivery decisions.
---

# Challenge a Pulsebox decision

Remain read-only unless the user authorizes workspace edits.

## 1. Prepare the decision tree

1. Read `AGENTS.md`, the specification index, each owner, and each dependency.
   Finish when you know the approved contract and open questions.
2. Inspect implementation that the plan claims already exists.
   Finish when each implementation claim has direct evidence.
3. Resolve facts that current repository files or primary sources can answer.
   Finish when only genuine product choices remain.
4. List the decision branches from parent to child.
   Finish when the highest-risk and least-reversible branch is first.

Do not ask a question that available evidence can answer.

## 2. Resolve one branch at a time

1. State the current branch and its material trade-offs.
   Finish when the user can compare the valid choices.
2. Recommend one choice and give the evidence for it.
   Finish when the recommendation has a clear reason and verifier.
3. Ask one question.
   Finish when the user gives an answer or explicitly defers the branch.
4. Record the answer and its downstream effects.
   Finish when no child branch depends on an unstated parent choice.
5. Add a branch only when the answer exposes a material dependency.
   Finish when the tree contains no speculative branch.

Probe relevant product and delivery risks. Include ownership, persistence,
audio, accessibility, browser, layout, originality, and verification risks.

Read [EXAMPLES.md](EXAMPLES.md) when a concrete question sequence is useful.

## 3. Record authorized decisions

1. Identify the owning specification or domain document for each decision.
   Finish when every durable fact has one owner.
2. If the user authorizes edits, update only the owning document.
   Finish when no parallel decision document exists.
3. If the user does not authorize edits, report the exact future document change.
   Finish when another agent can apply it without reopening the decision.

## Completion criterion

Complete the session when you resolve or defer every inventoried branch.
Each deferral must name an owner, reason, and verification step. Route authorized
implementation to `add-feature`, `refactor`, or `diagnose` as applicable.
