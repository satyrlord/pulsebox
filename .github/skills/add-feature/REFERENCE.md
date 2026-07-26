# Feature decision reference

Record a decision in the owning specification or domain document when it:

- changes approved behavior or acceptance wording;
- changes a public, plugin, message, command, project, import, or export
  contract;
- changes engine, state, UI, persistence, or worklet ownership;
- changes the browser, audio, accessibility, responsive, theme, naming, or
  originality boundary;
- is costly to reverse or likely to be rediscovered.

Keep local implementation detail in code and tests when it does not change a
durable contract.

For each durable decision, record the chosen behavior, why it is needed,
rejected alternatives that materially affect later work, and the exact
acceptance or verification consequence. Keep one owner for each fact.
