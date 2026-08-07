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

If a file mixes concerns, read more than one reference. A listed smell requires
investigation. It does not authorize an edit.

## 2. Inventory the scope

1. List every tracked, non-generated file in the requested scope.
   Completion criterion: Each file has a family and a representative sibling.
2. List generated, vendored, binary, and excluded paths separately.
   Completion criterion: Every excluded path has a reason.
3. Read each scoped file and its sibling completely.
   Completion criterion: You know the local style, behavior, and ownership.

If the user does not set a smaller scope, use the complete repository.

## 3. Prove each candidate

1. Compare the candidate with its contract, siblings, and consumers.
   Completion criterion: The difference has or lacks a valid reason.
2. For a test, establish the unchanged baseline required by [TEST.md](TEST.md).
   Completion criterion: You record the runner and pre-edit result.
3. Classify the candidate as valid, slop, or unresolved.
   Completion criterion: Evidence excludes the other classifications.

Do not use syntax, file size, test count, coverage, or tone alone as proof.

## 4. Remove proven slop

1. Edit only enough to remove the proven problem.
   Completion criterion: True behavior, information, constraints, and intentional voice remain.
2. After each coherent edit group, run the narrowest applicable repository check.
   Completion criterion: The check passes or you record the exact pre-existing failure.
3. For tests, run every changed test and its owning test project.
   Completion criterion: No changed test remains unverified.

If reachability is the question, use `dead-code-audit`. Do not remove generated
output, vendored code, lockfiles, or binary assets without an explicit request.

## 5. Re-read and report

1. After all edits, re-read every scoped file.
   Completion criterion: A second complete pass finds no evidence-backed slop.
2. Account for every scoped file as edited or unchanged.
   Completion criterion: The report includes both counts and all exclusions.
3. Report each unresolved candidate and its required proof.
   Completion criterion: Every uncertainty has a concrete verification step.

## Completion criterion

The pass is complete after you account for every scoped file. Every edit must
have a repository or sibling justification. All affected checks must pass, or
you report a pre-existing blocker.
