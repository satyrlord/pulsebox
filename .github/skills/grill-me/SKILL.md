---
name: grill-me
description: Use when the user wants a Pulsebox plan or design grilled, stress-tested, or challenged, or wants open decisions resolved before implementation.
---

# Grill a Pulsebox decision

## Prepare

Read repository root `AGENTS.md`, the
[product specification index](../../../docs/specs/spec-000-index.md), every
applicable owning specification and dependency, the canonical domain documents
under `docs/`, and any implementation
that the plan says already exists. Do not ask a question the repository or
current primary documentation can answer.

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

Remain read-only unless the user explicitly authorizes workspace edits. After
each accepted product decision, record the owning-document change that would be
needed. If edits are authorized, update the owning file under `docs/specs/` or
the applicable canonical domain document. Do not create a parallel decision
document.

## Conclude

Route resolved work to add-feature for contract implementation, refactor for
behavior-preserving structure, or diagnose for an unproven runtime fact.

Finish when every inventoried branch is resolved or explicitly deferred with an
owner, reason, and verification step, and a fresh agent can continue without
reopening decisions.

Read [EXAMPLES.md](EXAMPLES.md) when a concrete question sequence would help.
