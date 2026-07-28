---
name: full-code-review
description: Use when the user wants a Pulsebox change set, diff, branch, or pending work reviewed before it lands.
---

# Review Pulsebox code

Review read-only. Edit only when the user explicitly requests fixes.

## Establish scope

1. Inspect the current diff, untracked files, and recent history.
2. Read every changed file and the owning specification sections.
3. Read enough callers, plugins, commands, migrations, components, and tests to
   judge the change in context.
4. Preserve unrelated dirty work.

## Review standards

Most defects here are a **seam** crossed — code that migrated across an
ownership boundary it should have respected. Check:

- approved behavior and every affected acceptance criterion;
- strict engine, state, and UI ownership;
- plugin and parameter contracts, stable IDs, and registry-driven extension;
- typed commands, complete undo data, and gesture coalescing;
- AudioWorklet frame-size independence, bounded memory, smoothing, lifecycle,
  message ordering, and offline parity;
- versioned project data, migrations, validation, assets, and preference
  boundaries;
- component registration, style encapsulation, cleanup, input, focus,
  accessibility, and supported-size layout;
- the five-theme token contract and absence of theme-specific markup or logic;
- MIDI, main-thread DSP, ScriptProcessorNode, server, native wrapper, PWA, and
  service-worker code;
- naming, originality, shipping boundaries, and research isolation;
- direct code, cohesive modules, explicit invariants, and removal of duplicated
  policy or unnecessary concepts;
- objective unit, component, browser, visual, and audio regression evidence.

Do not enforce an arbitrary file-size number. The specification requires
separate cohesive modules and rejects enormous catch-all files; judge ownership
and cognitive load with evidence.

## Output

Order findings by severity. For each finding, give the file and location,
broken contract or concrete risk, evidence, user impact, and smallest actionable
remedy. Treat comments as hypotheses until verified. State when no blocking
findings remain.

If fixes are requested, implement only confirmed in-scope findings and run the
applicable quality gate.

Use [REFERENCE.md](REFERENCE.md) for Pulsebox-specific review remedies.
