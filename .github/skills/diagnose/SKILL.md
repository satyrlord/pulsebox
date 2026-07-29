---
name: diagnose
description: >
  Diagnose difficult Pulsebox bugs and performance regressions. Use for flaky,
  unreproduced, unmeasured, or root-cause-unknown failures. If the user requests a fix, implement it.
---

# Diagnose a Pulsebox failure

Use the smallest feedback loop that can disprove a suspected cause.

## 1. Build the feedback loop

1. Read the reported symptom, relevant contract, source, tests, and environment.
   Completion criterion: You know the exact expected and observed outcomes.
2. Select the fastest signal that reaches the real failure.
   Completion criterion: One repeatable command or procedure can show the symptom.
3. Record the environment and controlled input.
   Completion criterion: Another agent can run the same loop.

Read [REFERENCE.md](REFERENCE.md) for loop choices and environment fields. As a
last resort, use the [PowerShell template](scripts/hitl-loop.template.ps1).

## 2. Reproduce and rank causes

1. Run the loop enough times to confirm the reported symptom.
   Completion criterion: The signal distinguishes the failure from correct behavior.
2. Write three to five ranked, disprovable hypotheses.
   Completion criterion: Each hypothesis predicts one specific probe result.
3. Show the ranking without stopping the investigation.
   Completion criterion: The user can see the current evidence and direction.

If a concrete loop pattern is useful, read [EXAMPLES.md](EXAMPLES.md).

## 3. Measure one variable

1. Use the narrowest non-mutating debugger probe or current measurement.
   Completion criterion: The probe separates at least two ranked hypotheses.
2. If a new assertion, trace, or log needs an edit, request explicit authority.
   Completion criterion: The user authorizes the edit or a non-mutating probe replaces it.
3. Change one controlled variable at a time.
   Completion criterion: Each result has one clear cause.
4. Repeat until one cause explains all observed evidence.
   Completion criterion: The evidence excludes the material alternatives.

## 4. Conclude or fix

1. If the user requested diagnosis only, report the proven cause and proposed repair.
   Completion criterion: The report includes evidence and a regression-test plan.
2. If the user requested a fix, first make a focused regression test fail.
   Completion criterion: The test fails for the proven cause.
3. Apply the smallest root-cause fix.
   Completion criterion: The regression test and original loop pass.
4. Remove temporary probes and artifacts.
   Completion criterion: A unique repository search finds no temporary instrumentation.

If the user requests architecture work, route a proven structural gap to
`improve-codebase-architecture`.

## Completion criterion

The diagnosis is successful after evidence distinguishes the root cause from
the ranked alternatives. Deliver the requested diagnosis or verified fix.
Remove all temporary instrumentation that is not part of the final verifier.

If no loop can be built, list each attempt and the missing artifact or access.
Do not claim a cause or fix in that branch.
