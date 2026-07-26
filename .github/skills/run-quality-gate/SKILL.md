---
name: run-quality-gate
description: Run or repair the Pulsebox checks that exist for the current phase, including documentation, lint, typecheck, unit, component, browser, visual, build, naming, dependency, and audio evidence.
---

# Run the Pulsebox quality gate

## Select a mode

- In verify mode, run safe applicable checks and report failures without
  editing source, tests, or configuration.
- In repair mode, fix only root causes within the requested scope and re-run
  each affected check.

Never add suppressions, exclusions, disabled rules, or lower thresholds without
explicit approval.

## Discover the gate

1. Read AGENTS.md and the current specification phase.
2. Read package.json and test or tool configuration when they exist.
3. Use repository scripts as the command source.
4. Mark a planned but absent check as not available. Do not invent its command,
   coverage threshold, or pass result.

At the current specification-only stage, product build, lint, typecheck, and
test gates are unavailable because package.json and product code do not exist.
Markdown and repository-consistency checks may still apply.

## Run applicable checks

Use this order when each check exists:

1. Markdown and document links.
2. Case-insensitive naming and originality audit.
3. Prohibited and unused dependency audit.
4. Lint.
5. Typecheck.
6. Unit and component tests.
7. Production build.
8. Playwright tests in supported browsers.
9. Visual regression at required sizes, themes, and high contrast.
10. Stage-specific rendered-audio, persistence, import/export, or performance
    checks.
11. Dead-code and coverage tools only when configured and documented.

Continue independent safe checks after a failure in verify mode. In repair
mode, capture the exact diagnostic, fix the smallest root cause, and re-run the
same check before moving on.

## Report

For every check, report the command or procedure, status, and concise evidence.
Use pass, fail, blocked, or not available. Claim an overall pass only when every
required and applicable check passes.

Read [REFERENCE.md](REFERENCE.md) for discovery and stop conditions.
