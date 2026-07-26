---
name: skills-router
description: Select the right Pulsebox repository skill when the user asks what workflow or skill should handle a task.
---

# Select a Pulsebox skill

Read [the catalog](../README.md). Choose the smallest skill that owns the
request:

- add-feature for specification or contract changes;
- dead-code-audit for reachability and safe deletion;
- design-pulsebox-ui for layout, styling, theme, control, or accessibility work;
- deslop for repository-wide evidence-backed cleanup;
- diagnose for an unproven failure or performance regression;
- full-code-review for a read-only change-set review;
- grill-me for unresolved product or architecture decisions;
- handoff for durable state transfer;
- improve-codebase-architecture for broad architecture opportunities;
- refactor for narrow behavior-preserving cleanup;
- run-quality-gate for phase-applicable repository checks;
- verify for built-browser and rendered-audio evidence.

Use one primary skill. Add another only when the task truly crosses workflows.
State the selected skill and why. Do not invoke a deleted or nonexistent skill.
