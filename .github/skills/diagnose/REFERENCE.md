# Diagnose reference

Skip a phase only with a stated reason.

## Build a feedback loop

Prefer the fastest deterministic signal that reaches the real failure:

1. a unit or component test for pure state, commands, validation, migration, or
   Custom Element behavior;
2. a worklet or OfflineAudioContext harness for DSP, scheduling, or export;
3. a Playwright flow against the production browser build;
4. an IndexedDB round trip with a minimal .pulsebox fixture;
5. a deterministic trace of typed commands, engine messages, worklet messages,
   or transport events;
6. a focused performance measurement with a representative project;
7. the human-in-the-loop PowerShell template as a last resort.

For browser and audio failures, record the browser, sample rate, audio-context
state, viewport, theme, project state, and exact unlock gesture when relevant.
Raise a flaky reproduction rate through controlled repetition, seeded state,
and narrower timing before investigating.

If no loop can be built, list the attempts and request the missing artifact or
environment. Do not claim a cause.

## Reproduce

Confirm that the loop shows the user's exact symptom more than once. Capture
the error, wrong state, rendered output, timing, geometry, or persisted data
that distinguishes the bug.

## Rank hypotheses

Write three to five falsifiable hypotheses. Each one must predict a specific
probe result. Show the ranking to the user without blocking progress.

Pulsebox boundaries worth probing include:

- engine, state, and UI ownership;
- command dispatch, inverse data, and gesture coalescing;
- Custom Element connection, disconnection, Shadow DOM, and focus;
- audio unlock, AudioWorklet registration, message ordering, frame counts,
  smoothing, channel layout, and sample rate;
- IndexedDB transactions, schema migration, import validation, and asset
  identity;
- plugin registration and stable IDs;
- theme tokens, supported viewport geometry, and animation state.

## Instrument

Change one variable at a time. Prefer a debugger or narrow assertion. Tag
temporary logs with one unique prefix so a final repository search proves
their removal.

For performance work, establish a representative baseline before changing
code. Record environment, workload, method, and result.

## Fix when authorized

Turn the minimized reproduction into a failing regression test at the correct
seam. Watch it fail, apply the smallest root-cause fix, watch it pass, then run
the original reproduction. If no correct test seam exists, report that
architecture gap rather than adding a shallow test.

## Clean up

Remove temporary instrumentation and harness artifacts. Re-run the original
loop and affected quality checks. State the proven cause, evidence, fix or
proposed fix, regression coverage, and any remaining manual audio check.
