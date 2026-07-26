# Grill Me Examples

## Example 1: Pressure-Test an Architecture Change

- Prompt shape: "Grill me on this tracker-dropout architecture change."
- Good behaviour: ask one high-risk question at a time and force resolution
  of release risk, rollback, and ownership assumptions.
- Good result: a smaller decision tree and one clear next owning skill.

## Example 2: Branch Reduction Before Spec Work

- Prompt shape: "I have two ways to store debug artifacts. Grill me."
- Good behaviour: challenge scope, persistence, safety, and doc ownership
  before any spec text is written.
- Good result: a stable choice or a clearly human-only unresolved decision.

## Example 3: Naming and Terminology Check

- Prompt shape: "Help me choose the right term for this new import seam."
- Good behaviour: cross-check `docs/glossary.md` before asking the user to
  coin a new term.
- Good result: one canonical term ready for `add-feature`.
