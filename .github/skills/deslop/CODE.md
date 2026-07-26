# Code Slop

Use the surrounding file and one sibling as the style and architecture
baseline. Flag a candidate only when it departs from that baseline without a
documented need.

## Comments and errors

- Narrative comments that restate self-documenting code
- Obvious internal JSDoc where siblings rely on types and names
- Swallowed exceptions that collapse distinct failures without policy
- Debug logging left in production paths
- Commented-out implementations and expired migration notes

Keep comments that preserve a non-obvious format, lifecycle, compatibility,
or architectural constraint.

## Types and control flow

- `any` or assertions used only to bypass an available precise type
- Defensive guards already guaranteed by the caller's documented contract
- Broad catch blocks that hide actionable failures
- Half-renamed symbols, unused imports, and artifacts from abandoned attempts
- Ad-hoc flags or branches that duplicate an existing state model

Do not remove a guard until its upstream invariant and error policy are proven.

## Structure and dependencies

- A helper that duplicates a live canonical utility
- An import whose package or export does not exist
- A pass-through abstraction that hides no policy or complexity
- Re-declared types that duplicate an owned contract
- Environment-specific values embedded where the repository already has a
  configuration seam

Hardcoded values are not slop when they express an intentional local constant
and no configuration requirement exists.

## Style

Match imports, module extensions, quotes, indentation, semicolons, and blank
line rhythm to the file family. Use an existing formatter when one owns the
style; do not hand-normalize against a personal preference.
