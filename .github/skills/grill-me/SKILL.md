---
name: grill-me
description:
  Stress-test a Pulsebox plan or design interactively, resolve consequential
  decision branches, and expose hidden assumptions before implementation.
---

# Grill a Pulsebox decision

## Prepare

Read AGENTS.md, the full approved specification, future canonical domain
documents when they exist, and any implementation that the plan says already
exists. Do not ask a question the repository or current primary documentation
can answer.

Inventory decision branches. Start with the highest-risk or least-reversible
parent branch. Do not jump to a child before its parent is resolved.

## Ask

- Ask one question at a time.
- Give a recommended answer with clear trade-offs before asking.
- Incorporate the answer immediately and do not reopen it without new evidence.
- Add a branch only when an answer exposes a material dependency.
- Probe scope, engine/state/UI ownership, plugin and worklet contracts,
  persistence and migration, undo, accessibility, playback continuity, browser
  support, responsive layout, originality, verification, and delivery risk when
  relevant.

Update the owning specification or domain document after each accepted product
decision. Use SPEC.md as the single product specification. Do not create a
parallel decision document.

## Conclude

Route resolved work to add-feature for contract implementation, refactor for
behavior-preserving structure, or diagnose for an unproven runtime fact.

Finish when every inventoried branch is resolved or explicitly deferred with an
owner, reason, and verification step, and a fresh agent can continue without
reopening decisions.
