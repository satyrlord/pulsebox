---
name: skills-router
description: Find the right user-invoked skill. Use when you know there is a skill for the job but cannot remember its name.
disable-model-invocation: true
---

# Skill Router

User-invoked skills spend no context load, but that only helps if you can
remember which one to type. This skill is the index.

## Type these yourself (user-invoked)

- `deslop` — Remove AI slop from the repository while preserving behavior.
- `full-code-review` — Run a strict, read-only code-judo review.
- `generate-mix` — Generate or revise the saved mixer test song.
- `handoff` — Transfer session state to a fresh agent.
- `improve-codebase-architecture` — Surface architectural friction and propose
  deepening opportunities.
- `design-router` — pick a bundled design theme  

## Describe the task and let the agent pick (model-invoked)

If the task matches one of these triggers, just describe it; the agent will fire
the skill:

- `add-feature` — spec, decisions, and durable docs for new work
- `dead-code-audit` — find and optionally remove dead code
- `diagnose` — controlled bug or regression diagnosis
- `grill-me` — decision-tree design grilling
- `refactor` — behavior-preserving cleanup
- `run-quality-gate` — run or repair the repository quality gate
- `verify` — verify renderer changes against real Chromium

See [README.md](../README.md) for the categorized skill list.

## Completion Criterion

Routing is complete when one skill is named and the reason it fits the request
is stated.
