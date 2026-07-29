---
name: deslop
description: >
  Remove evidence-backed slop from code, prose, data, configuration, and tests.
  Use for full-scope cleanup or clear, plain, controlled technical writing.
---

# Remove slop

**Slop** conflicts with file evidence, sibling patterns, or repository contracts.
Judge the artifact. Do not infer who wrote it.

## 1. Select the reference branch

Read each reference that matches a scoped file:

- [CODE.md](CODE.md) for source code
- [PROSE.md](PROSE.md) for documentation and technical prose
- [DATA.md](DATA.md) for data and configuration
- [TEST.md](TEST.md) for tests

Read more than one reference when a file mixes concerns. A listed smell requires
investigation. It does not authorize an edit.

## 2. Inventory the scope

1. List every tracked, non-generated file in the requested scope.
   Finish when each file has a family and a representative sibling.
2. List generated, vendored, binary, and excluded paths separately.
   Finish when every excluded path has a reason.
3. Read each scoped file and its sibling completely.
   Finish when you know the local style, behavior, and ownership.

Use the complete repository as the default scope unless the user sets a smaller
scope.

## 3. Prove each candidate

1. Compare the candidate with its contract, siblings, and consumers.
   Finish when the difference has or lacks a valid reason.
2. For a test, establish the unchanged baseline required by [TEST.md](TEST.md).
   Finish when you record the runner and pre-edit result.
3. Classify the candidate as valid, slop, or unresolved.
   Finish when evidence excludes the other classifications.

Do not use syntax, file size, test count, coverage, or tone alone as proof.

## 4. Remove proven slop

1. Make the smallest edit that removes the proven problem.
   Finish when true behavior, information, constraints, and intentional voice remain.
2. Run the narrowest applicable repository check after each coherent edit group.
   Finish when the check passes or you record the exact pre-existing failure.
3. For tests, run every changed test and its owning test project.
   Finish when no changed test remains unverified.

Use `dead-code-audit` when reachability is the question. Do not remove generated
output, vendored code, lockfiles, or binary assets without an explicit request.

## 5. Re-read and report

1. Re-read every scoped file after all edits.
   Finish when a second complete pass finds no evidence-backed slop.
2. Account for every scoped file as edited or unchanged.
   Finish when the report includes both counts and all exclusions.
3. Report each unresolved candidate and its required proof.
   Finish when every uncertainty has a concrete verification step.

## Completion criterion

Complete the pass when you account for every scoped file. Every edit must have
a repository or sibling justification. All affected checks must pass or have a
reported pre-existing blocker.
