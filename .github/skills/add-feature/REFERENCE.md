# Feature decision reference

Record a durable decision when it changes one of these items:

- approved behavior or acceptance text
- a public, plugin, message, command, project, import, or export contract
- engine, state, UI, persistence, or worklet ownership
- a browser, audio, accessibility, layout, theme, naming, or originality boundary
- a choice that is costly to reverse or likely to recur

Keep local implementation detail in code and tests. Do not add it to a product
contract when it does not change durable behavior.

For each durable decision, record the chosen behavior and its reason. Record
material rejected choices and the exact acceptance effect. Keep one owner for
each fact.
