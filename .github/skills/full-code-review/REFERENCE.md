# Pulsebox review remedies

- Move DOM access from engine or state into a Web Component or UI adapter.
- Move audio-graph work from UI into the engine controller or plugin adapter.
- Replace product-specific branching with a plugin manifest or registry entry.
- Replace positional durable references with stable typed IDs.
- Route committed edits through a reversible command and coalesce gestures.
- Keep live AudioNodes and transient meter or playhead state out of persistence.
- Validate imported data before constructing state or decoding assets.
- Replace theme-specific logic with documented CSS tokens.
- Isolate high-frequency visual patching from structural component rendering.
- Add disconnect cleanup for listeners, observers, worklet ports, timers, and
  animation frames.
- Add deterministic rendered-audio checks when ordinary state assertions cannot
  prove an audible contract.
