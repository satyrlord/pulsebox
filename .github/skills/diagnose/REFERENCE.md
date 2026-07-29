# Diagnose reference

## Feedback-loop order

Use the first loop that reaches the real failure:

1. Use a unit or component test for pure state, commands, validation, migration, or React behavior.
2. Use a worklet or `OfflineAudioContext` harness for DSP, scheduling, or export.
3. Use Playwright against the production build for browser behavior.
4. Use an IndexedDB round trip with a minimal `.pulsebox` fixture.
5. Use a deterministic command, engine, worklet, or transport trace.
6. Use a focused performance measurement with a representative project.
7. As a last resort, use the human-in-the-loop PowerShell template.

For browser and audio failures, record these fields:

- exact browser version
- sample rate and audio-context state
- viewport and theme state
- project state and input fixture
- audio unlock gesture
- reproduction count and result

If no loop works, list the attempts and request the missing item. Do not claim a
cause.

## Reproduction evidence

If the failure is intermittent, confirm the exact symptom more than once.
Capture the error, wrong state, output, timing, geometry, or persisted data.

## Useful seams

If these Pulsebox seams match the symptom, probe them:

- engine, state, and UI ownership
- command dispatch, inverse data, and gesture coalescing
- React lifecycle, effects, DOM ownership, and focus
- audio unlock, worklet registration, message order, frame count, and sample rate
- IndexedDB transactions, migration, import validation, and asset identity
- plugin registration and stable IDs
- theme tokens, viewport geometry, and animation state

## Instrumentation

Use a non-mutating debugger or current measurement first. If a probe needs a
workspace edit, get explicit authority before the edit.

Change one variable at a time. Give temporary logs one unique prefix.

For performance work, before you change code, record the environment,
representative workload, method, baseline, and result.

## Authorized repair

Turn the minimized reproduction into a failing test at the owning seam. Apply
the smallest fix. Then run the test and the original reproduction.

If no correct test seam exists, report the architecture gap. Do not add a test
that cannot fail for the defect.
