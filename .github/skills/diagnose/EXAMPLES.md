# Diagnose Examples

## Example 1: AudioWorklet dropout with unclear root cause

- Prompt shape: "Playback clicks after I add the eighth rack module."
- Good behavior: reproduce in a production browser build with deterministic
  project state, record browser and sample rate, and instrument one engine or
  worklet seam at a time.
- Good result: a validated scheduling, allocation, graph, or message-protocol
  cause with a rendered-audio regression procedure.

## Example 2: Flaky project reload failure

- Prompt shape: "A saved project sometimes reopens with an empty rack."
- Good behavior: capture the project document and IndexedDB state, then isolate
  serialization, validation, migration, asset lookup, and UI hydration in that
  order.
- Good result: one proven owning seam and a deterministic save-reload regression
  test that preserves the original failing fixture.

## Example 3: Sample-import performance regression

- Prompt shape: "Importing a large sample pack got slower after this refactor."
- Good behavior: use one representative pack, record browser, asset sizes,
  codecs, workload, and timings, then compare decode, hashing, validation, and
  IndexedDB write paths before changing code.
- Good result: a quantified Pulsebox regression source and a repeatable
  benchmark, not a speculative optimization.
