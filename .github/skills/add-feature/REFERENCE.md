# Add Feature Reference

## Durable Decision Workflow

Code explains what exists. Documentation explains why the repo chose this
shape instead of a nearby alternative.

Write durable documentation for:

- architecture or layering changes
- documented project format or version changes
- persistence contract changes
- import or playback behavior changes that affect future compatibility
- resolved terminology conflicts that should stay consistent across docs

Use `docs/glossary.md` only for shared language that spans multiple specs or
workflows. Pick one preferred term, keep definitions tight, and record
relationships or flagged ambiguities only when future readers would otherwise
reuse the wrong term.

## Decision-Record Threshold

Record a decision durably only when all three are true:

- hard to reverse
- surprising without context
- the result of a real trade-off

Use the lightest structure that still records the trade-off clearly: one
small block stating context, decision, and why this path won. Add `Status`,
`Considered Options`, or `Consequences` sections only when they add genuine
value for the decision at hand.
