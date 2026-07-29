---
name: run-quality-gate
description: Use when the user wants the Pulsebox quality gate run, checks or CI repaired, or asks whether a change is ready to land; or when another skill needs the gate after a change.
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

1. Read repository root `AGENTS.md`, the
   [product specification index](../../../docs/specs/spec-000-index.md), each
   applicable owning specification and dependency, and the current
   implementation status in
   [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
2. Read `package.json` and the current test and tool configuration.
3. Use the scripts in `package.json` as the only command source. Never run a
   command you did not read there this session.
4. Treat Prettier and `format:check` as optional formatting tools, not quality
   gate checks. Run them only when the user separately requests formatting.
5. Mark a planned but absent check as not available. Do not invent its command,
   coverage threshold, or pass result.

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
9. Dead-code and coverage tools only when configured and documented.

Continue independent safe checks after a failure in verify mode. In repair
mode, capture the exact diagnostic, fix the smallest root cause, and re-run the
same check before moving on.

## Report

For every check, report the command or procedure, status, and concise evidence.
Use pass, fail, blocked, or not available. Claim an overall pass only when every
required and applicable check passes.

Read [REFERENCE.md](REFERENCE.md) for discovery and stop conditions.
