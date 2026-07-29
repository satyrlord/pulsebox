---
name: run-quality-gate
description: >
  Run or repair the Pulsebox quality gate. Use for repository checks, CI failures,
  landing readiness, or a gate requested by another skill.
---

# Run the Pulsebox quality gate

## 1. Select the branch

1. Use verify mode when the user requests results only.
   Finish when source, tests, and configuration will remain unchanged.
2. Use repair mode when the user requests fixes.
   Finish when the authorized repair scope is explicit.

Do not add suppressions, exclusions, disabled rules, or lower thresholds without
explicit approval.

## 2. Discover the current gate

1. Read `AGENTS.md`, the specification index, each applicable owner, and each dependency.
   Finish when the required phase and acceptance checks are known.
2. Read `package.json` and each active tool configuration.
   Finish when every configured command and project is known.
3. Use `package.json` as the only source for repository commands.
   Finish when no planned command was invented or copied from an old run.
4. Mark each required check as configured, blocked, or not available.
   Finish when every requirement has one current status.

Do not treat Prettier or `format:check` as gate checks. Run formatting only when
the user requests it separately.

Read [REFERENCE.md](REFERENCE.md) for applicability and stop conditions.

## 3. Run applicable checks

Use this order when the repository defines each check:

1. Markdown and documentation links.
2. Naming, originality, and prohibited-technology checks.
3. Dependency and dead-code checks.
4. Lint.
5. Typecheck.
6. Unit and component tests.
7. Production build.
8. Playwright in Chrome, Edge, and Firefox.
9. Configured coverage, visual, export, or audio checks.

Run independent safe checks after a failure in verify mode.

In repair mode, capture the exact diagnostic before editing. Fix the smallest
root cause. Re-run the same check before you continue.

Finish this stage when every applicable check has a current result.

## 4. Report the gate

1. Report each command or documented procedure, status, and concise evidence.
   Finish when each check is `pass`, `fail`, `blocked`, or `not available`.
2. Separate pre-existing failures from failures caused by the scoped change.
   Finish when attribution has repository evidence.
3. Claim an overall pass only when every required applicable check passes.
   Finish when the overall status follows the individual results.

## Completion criterion

Complete verify mode when all safe applicable checks have a current status.
Complete repair mode when each in-scope root cause is fixed and rechecked. State
every unavailable gate, blocker, and unverified runtime surface.
