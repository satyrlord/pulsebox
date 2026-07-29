# Quality-gate reference

## Applicability

The current contract marks each required check. The repository must define its
command or procedure. Report a missing required command as blocked.
Do not substitute a hand-written command.

Use these phase rules:

- For specification work, run Markdown, link, consistency, and policy checks.
- For contract work, run schema, type, serialization, migration, and architecture tests.
- For feature work, run affected unit, browser, visual, export, and audio checks.
- For final work, run all required commands and acceptance procedures.
- For theme work, verify `rack`, high contrast, and the affected user-theme path.

## Stop conditions

If the next action needs a product decision, stop repair work. Also stop if the
action changes quality policy, expands scope materially, or lacks a verifier.

Report the exact blocker. Do not invent a coverage percentage or reinterpret a
configured threshold.
