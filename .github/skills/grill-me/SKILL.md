---
name: grill-me
description: >
  Stress-tests a plan or design interactively, resolves decision-tree
  branches, and exposes hidden assumptions before implementation. Use when the
  user says "grill me", asks to pressure-test a plan, wants interactive design
  questioning, or needs open decisions driven to closure one branch at a time.
---

# Grill Me

## Goal

Challenge the current plan until the important assumptions, dependencies, and
trade-offs are explicit enough that the next implementation or documentation
step is obvious.

## First Rule

Do not ask the user a question that the codebase, docs, or nearby tests can
answer locally. Explore first when the repository can disconfirm a branch.

## Read First

Load the smallest context that makes the plan testable:

1. `AGENTS.md`
2. the relevant functional or architecture docs under `docs/`
3. `docs/glossary.md` when shared project language already has a home
4. the current implementation surface when the plan claims something already
   exists

## Design Tree

Walk down each branch of the design tree, highest-risk or least-reversible
branch first. A **branch** is a decision point: an architectural choice, a UX
trade-off, an integration seam, a sequencing question. Resolve dependencies
between branches one-by-one — don't jump ahead to child branches until the
parent decision is made.

Before questioning, inventory the branches visible in the plan. Add a newly
discovered branch only when an answer exposes a consequential dependency. For
each question, provide your recommended answer before asking for the user's.

## Rhythm

- Ask questions **one at a time**. Asking multiple at once breaks the tree walk.
- Summarize advantages and disadvantages for each option.
- If a question can be answered by exploring the repo, explore the repo instead of asking.
- When the user answers with a constraint or preference, incorporate it
  immediately — don't ask the same branch again later.
- Update the relevant repository doc after each answer. Write the decision
  into the doc that owns it before moving to the next question — don't batch
  doc updates to the end of the session.

## Challenge Areas

Probe these areas when they are relevant to the plan:

- scope drift and non-goals
- architecture boundaries and ownership
- data contracts, persistence, and migration impact
- trust boundaries, path safety, and untrusted input
- performance, responsiveness, and failure handling
- validation, rollback, and release risk
- naming, terminology, and user-facing behaviour

## Repo Cross-Check

Treat the repository docs as the source of truth unless the user explicitly
wants to reopen a prior decision. Call out terminology conflicts against
`docs/glossary.md` immediately and propose one canonical term when the user
uses vague or overloaded language.

Stay inside the documented scope and host constraints unless the user
explicitly changes them.

## Outcomes

When the questioning converges:

- route to `add-feature` if the outcome needs durable documentation
- route to `refactor` if the main unresolved issue is seam or contract design
- route to `diagnose` if the open question is a performance or behaviour unknown

## Completion Criterion

The grill is done when every inventoried branch is resolved or explicitly
deferred with an owner and reason, all dependencies between resolved decisions
are consistent, and the decision ledger is specific enough for a fresh agent
to continue without re-litigating them.

## Validation

If grilling produces document edits, run `markdownlint-cli2` on the edited
Markdown files. If the outcome includes code edits, apply
`run-quality-gate` to the touched code slice.
