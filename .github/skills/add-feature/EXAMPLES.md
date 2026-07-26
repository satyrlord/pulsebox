# Add Feature Examples

## Example 1: Clarify Playback Contract

- Prompt shape: "Update the playback spec for this new event-span behavior."
- Good behavior: edit the owning playback contract doc, define success
  criteria, and keep non-goals explicit.
- Good result: the next implementation slice becomes unambiguous.

## Example 2: Record A Durable Trade-Off

- Prompt shape: "Record why we are not versioning `.mixjam` files."
- Good behavior: capture the decision, rationale, and consequences in the
  owning numbered spec under `specs/` instead of scattering the answer across
  chat history.
- Good result: future architecture or format work stops re-litigating the same
  question.

## Example 3: Add A Glossary Term

- Prompt shape: "Define 'output library root' so the docs stop drifting."
- Good behavior: add the smallest durable glossary entry in the owning doc.
- Good result: later prompts and specs use one canonical term.
