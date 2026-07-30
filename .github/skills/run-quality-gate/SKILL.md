---
name: run-quality-gate
description: >
  Run or repair the Pulsebox quality gate. Use for repository checks, CI failures,
  merge readiness, or a gate requested by another skill.
---

# Run the Pulsebox quality gate

## 1. Select the branch

1. If the user requests results only, use verify mode.
   Completion criterion: You do not change source, tests, or configuration.
2. If the user requests fixes, use repair mode.
   Completion criterion: The authorized repair scope is explicit.

Do not add suppressions, exclusions, disabled rules, or lower thresholds without
explicit approval.

## 2. Discover the current gate

1. Read `AGENTS.md`, the specification index, each applicable owner, and each dependency.
   Completion criterion: You know the required phase and acceptance checks.
2. Read `package.json` and each active tool configuration.
   Completion criterion: You know every configured command and project.
3. Use `package.json` as the only source for repository commands.
   Completion criterion: Every planned command comes from current package scripts.
4. Mark each required check as configured, blocked, or not available.
   Completion criterion: Every requirement has one current status.

Read [REFERENCE.md](REFERENCE.md) for applicability and stop conditions.

## 3. Run applicable checks

If the repository defines each check, use this order:

1. Markdown and documentation links.
2. Naming, originality, and prohibited-technology checks.
3. Dependency and dead-code checks.
4. Lint.
5. Typecheck.
6. Unit and component tests.
7. Production build.
8. Playwright in Chrome.
9. Configured coverage, visual, export, or audio checks.

In verify mode, after a failure, run independent safe checks.

In repair mode, before you edit, capture the exact diagnostic. Fix the smallest
root cause. Before you continue, re-run the same check.

Completion criterion: Every applicable check has a current result.

## 4. Report the gate

1. Report each command or documented procedure, status, and concise evidence.
   Completion criterion: Each check is `pass`, `fail`, `blocked`, or `not available`.
2. Separate pre-existing failures from failures caused by the scoped change.
   Completion criterion: Attribution has repository evidence.
3. If every required applicable check passes, claim an overall pass.
   Completion criterion: The overall status follows the individual results.

## Completion criterion

Verify mode is complete after all safe applicable checks have a current status.
Repair mode is complete after you fix and recheck each in-scope root cause.
State every unavailable gate, blocker, and unverified runtime area.
