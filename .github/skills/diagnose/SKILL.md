---
name: diagnose
description: >
  Diagnose difficult Pulsebox bugs and performance regressions. Use for flaky,
  unreproduced, unmeasured, or root-cause-unknown failures. Implement fixes only when requested.
---

# Diagnose a Pulsebox failure

Use the smallest feedback loop that can disprove a suspected cause.

## 1. Build the feedback loop

1. Read the reported symptom, relevant contract, source, tests, and environment.
   Finish when you know the exact expected and observed outcomes.
2. Select the fastest signal that reaches the real failure.
   Finish when one repeatable command or procedure can show the symptom.
3. Record the environment and controlled input.
   Finish when another agent can run the same loop.

Read [REFERENCE.md](REFERENCE.md) for loop choices and environment fields. Use
the [PowerShell template](scripts/hitl-loop.template.ps1) only as a last resort.

## 2. Reproduce and rank causes

1. Run the loop enough times to confirm the reported symptom.
   Finish when the signal distinguishes the failure from correct behavior.
2. Write three to five ranked, disprovable hypotheses.
   Finish when each hypothesis predicts one specific probe result.
3. Show the ranking without stopping the investigation.
   Finish when the user can see the current evidence and direction.

Read [EXAMPLES.md](EXAMPLES.md) when a concrete loop pattern is useful.

## 3. Measure one variable

1. Use the narrowest non-mutating debugger probe or current measurement.
   Finish when the probe separates at least two ranked hypotheses.
2. If a new assertion, trace, or log needs an edit, request explicit authority.
   Finish when the user authorizes the edit or a non-mutating probe replaces it.
3. Change one controlled variable at a time.
   Finish when each result has one clear cause.
4. Repeat until one cause explains all observed evidence.
   Finish when the evidence excludes the material alternatives.

## 4. Conclude or fix

1. If the user requested diagnosis only, report the proven cause and proposed repair.
   Finish when the report includes evidence and a regression-test plan.
2. If the user requested a fix, first make a focused regression test fail.
   Finish when the test fails for the proven cause.
3. Apply the smallest root-cause fix.
   Finish when the regression test and original loop pass.
4. Remove temporary probes and artifacts.
   Finish when a unique repository search finds no temporary instrumentation.

Route a proven structural gap to `improve-codebase-architecture` when the user
requests architecture work.

## Completion criterion

Complete a successful diagnosis only when evidence distinguishes the root cause
from the ranked alternatives. Deliver the requested diagnosis or verified fix.
Remove all temporary instrumentation that is not part of the final verifier.

If no loop can be built, list each attempt and the missing artifact or access.
Do not claim a cause or fix in that branch.
