# Run Quality Gate Reference

## Discovery

Read `package.json` scripts once. Prefer a repository script over a direct
tool invocation.

| Gate | Command order |
| --- | --- |
| Problems | whole-workspace diagnostics API; otherwise `N-A` |
| Markdown | `npm run lint:md`; `npm run markdownlint`; `npx markdownlint-cli2 "**/*.md"` |
| ESLint | `npm run lint`; `npm run eslint`; `npx eslint .` |
| Fallow | `npm run fallow`; `npx fallow dead-code` |
| Unit | `npm run test:unit`; `npm test`; `npx vitest run` |
| E2E | `npm run test:e2e`; `npm run e2e`; `npx playwright test` |
| Unit coverage | `npm run test:coverage` |
| E2E coverage | `npm run test:e2e:coverage` |
| Combined report | `npm run coverage:report`; `node scripts/merge-coverage.mjs` |

Use ESLint auto-fix only in repair mode and inspect its diff before continuing.

## Coverage Interpretation

- Apply the unit threshold defined in `SKILL.md` to every reported Statements,
  Branches, Functions, and Lines cell, globally and per file or module.
- Treat E2E coverage as supplementary integration evidence. Do not apply the
  70% threshold to bundled E2E coverage or combine its statement identifiers
  numerically with unit coverage.
- Add targeted tests or improve testability to close gaps. Follow the
  authorization rule in `SKILL.md` for exclusions, ignores, or threshold
  changes.
- Record exact cells and values for every coverage blocker.

## Stop Conditions

Stop the repair sequence when a command requires secrets, manual login,
unavailable interactive access, out-of-scope changes, or a suppression the
user has not approved. Include the smallest next action that would close the
gate.

## Report Contract

Report:

1. Problems, Markdown, ESLint, Fallow, Unit, E2E, and Coverage status as
   `PASS`, `FAIL`, `BLOCKED`, or `N-A`.
2. Commands in execution order with exit outcomes.
3. Files changed, or `none` in verify mode.
4. Exact remaining blockers and the smallest next action.
