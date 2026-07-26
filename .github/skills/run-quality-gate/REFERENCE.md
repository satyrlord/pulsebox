# Quality-gate reference

## Command discovery

Prefer package.json scripts. The approved future command surface includes:

- npm run build
- npm run test
- npm run test:e2e
- npm run lint
- npm run typecheck

Do not assume those scripts exist. Optional Markdown, dead-code, coverage,
visual, audio, or audit scripts become gates only after the repository defines
them.

## Phase applicability

- Specification stage: Markdown, links, consistency, and forbidden-name checks.
- Contract stage: schema, type, serialization, migration, and architecture
  contract tests.
- Feature stages: affected unit, component, browser, visual, and audio checks.
- Final stage: all required commands, supported browsers and layouts, five
  themes, high contrast, naming, dependencies, persistence, export, and
  acceptance criteria.

## Stop conditions

Stop repair work when the next action requires a product decision, expands
scope materially, would change a quality policy, or cannot be verified with
available evidence. Report the exact blocker.

Do not use an invented coverage percentage. Report measured coverage only when
the repository defines how it is collected and interpreted.
