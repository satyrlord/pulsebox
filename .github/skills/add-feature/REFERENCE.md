# Feature decision reference

If a durable decision changes one of these items, record it:

- approved behavior or acceptance text
- a public, plugin, message, command, project, import, or export contract
- engine, state, UI, persistence, or worklet ownership
- a browser, audio, accessibility, layout, theme, naming, or originality boundary
- a choice that is costly to reverse or likely to recur

Keep local implementation detail that does not change durable behavior in code
and tests, not in a product contract.

For each durable decision, record the chosen behavior and its reason. Record
material rejected choices and the exact acceptance effect. Keep one owner for
each fact.
