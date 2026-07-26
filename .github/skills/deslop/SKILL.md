---
name: deslop
description: Remove AI slop, including low-value and misleading test code, from every file in the repository while preserving behavior and genuine information.
disable-model-invocation: true
---

# Deslop

Strip **slop**: content that clashes with the evidence supplied by the file,
its siblings, or the repository's established conventions. This is a
full-repository pass, not a diff review.

Slop categories include code, prose, data/config, and tests. Treat test slop as
low-value or misleading test code, not as a list of forbidden syntax and not as
proof that AI wrote a test.

## Branch References

Load the rule set that matches each file before judging it:

- Code: [CODE.md](CODE.md)
- Prose and documentation: [PROSE.md](PROSE.md)
- Data and configuration: [DATA.md](DATA.md)
- Tests: [TEST.md](TEST.md)

Apply more than one rule set when a file mixes concerns. A listed smell is a
prompt to compare context, not automatic permission to delete.

## Process

1. Inventory every tracked, non-generated file in scope and identify a
   representative sibling for each file family.
2. Read one file and its sibling completely, then load the applicable branch
   reference.
3. For a test candidate, run it unchanged and record its baseline as required
   by `TEST.md` before judging or editing it.
4. Mark only differences that lack a behavioral, informational, or local-style
   reason.
5. Remove the smallest proven slop. Preserve behavior, contracts, historical
   constraints that remain active, and intentional voice.
6. Run the narrowest relevant validation after each coherent edit group. For
   test files, follow `TEST.md`: establish a baseline, run every changed test,
   then run its owning Vitest or Playwright project. Do not finish test cleanup
   with a new failure or an unverified changed test.
7. Re-read every scoped file after the pass and account for it in the final
   report.

## Boundaries

- Do not turn stylistic preferences into universal bans. Adverbs, passive
  voice, comments, guards, hardcoded values, and abstraction can all be valid
  in context.
- Do not delete an artifact merely because static search finds no reference;
  use `dead-code-audit` when reachability is the question.
- Do not rewrite user-authored prose into a uniform voice without evidence
  from sibling documents.
- Do not modify generated output, vendored code, lockfiles, or binary assets
  unless the request includes them and their source-of-truth path is known.
- Do not delete a test because it is "too simple." A trivial test that
  verifies a real behavioral invariant is valuable. Require the evidence in
  `TEST.md` before changing it.
- Do not add mocks, assertions, or test cases without understanding the
  production code they exercise. An oracle that cannot fail for the relevant
  defect is slop.
- Do not merge or split test files without confirming the test runner
  discovers them the same way after the change.

## Completion Criterion

The pass is complete when every scoped file is recorded as unchanged or
edited, every edit has a sibling or repository-convention justification,
behavioral validation passes for affected code, config, and tests, a second
complete read yields no further evidence-backed slop, and the report names
edited file counts plus any excluded generated or binary paths.
