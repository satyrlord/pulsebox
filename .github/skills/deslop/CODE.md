# Code slop

Use the complete file and one sibling as the local baseline. If no contract or
behavior needs a difference, flag it.

## Comments and errors

Inspect these candidates:

- comments that only restate clear code
- internal JSDoc that duplicates types and names
- swallowed errors that hide distinct failures
- debug logs in production paths
- commented implementations and expired migration notes

Keep comments that preserve a non-obvious format, lifecycle, browser, audio, or
architecture constraint.

## Types and control flow

Inspect these candidates:

- `any` or assertions that bypass an available precise type
- guards already guaranteed by a documented caller contract
- broad catches that hide actionable failures
- half-renamed symbols and abandoned imports
- local flags that duplicate an owned state model

Before you remove a guard, prove its upstream invariant and error policy.

## Structure and dependencies

Inspect these candidates:

- helpers that duplicate a current utility
- imports with no current package or export
- wrappers that hide no policy or complexity
- types that duplicate an owned contract
- environment values outside an existing configuration seam

A local constant is not slop when it expresses an intentional invariant.

## Style

Match the file family for imports, extensions, quotes, indentation, punctuation,
and blank lines. If the repository formatter owns those rules, use it.
