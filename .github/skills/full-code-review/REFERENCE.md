# Pulsebox review remedies

- Move DOM access from engine or state to the React UI layer.
- Move audio-graph work from UI to an engine controller or plugin adapter.
- Replace plugin-specific branches with a manifest or registry entry.
- Replace positional durable references with stable typed IDs.
- Route committed edits through reversible commands.
- Coalesce each continuous gesture into one history entry.
- Keep audio nodes and transient visual state out of persistence.
- Validate imported data before state construction or asset activation.
- Replace theme-specific logic with documented CSS tokens.
- Isolate frequent visual updates from structural React rendering.
- Clean up listeners, observers, ports, timers, and animation frames.
- Add deterministic rendered-audio checks for audible contracts.
