# Diagnose examples

## AudioWorklet dropout

Prompt: "Playback clicks after I add the eighth rack module."

Use a deterministic project in the production build. Record the browser and
sample rate. Probe one engine or worklet seam at a time.

The result must identify a graph, scheduling, allocation, or message cause. It
must also include a rendered-audio regression method.

## Flaky project reload

Prompt: "A saved project sometimes reopens with an empty rack."

Capture the project document and IndexedDB state. Test serialization,
validation, migration, asset lookup, and UI hydration in that order.

The result must identify one owning seam. Preserve the failing fixture for the
deterministic save and reload test.

## Sample-import performance

Prompt: "A large sample pack imports more slowly after this refactor."

Use one representative pack. Record browser, asset sizes, codecs, workload,
and timings. Compare decode, hash, validation, and IndexedDB write stages.

The result must quantify the regression source and supply a repeatable benchmark.
