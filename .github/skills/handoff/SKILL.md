---
name: handoff
description: Create a concise Pulsebox session or phase handoff that lets a fresh agent resume from verified repository state without reopening settled decisions.
---

# Create a Pulsebox handoff

## Choose the artifact

- For a temporary session transfer, write to an ignored temporary path chosen
  by the user or current workflow.
- For a durable phase or project handoff, update HANDOFF.md when it exists.
- Do not duplicate facts already owned by the specification, architecture,
  project-format, theme, instrument, effect, commit, issue, or test report.
  Link to them.

## Verify before writing

Inspect current HEAD, status, diff, relevant test results, and the last concrete
action. Run a self-critique:

1. List least-confident work with a concrete verification command or procedure.
2. List skipped, incomplete, or deferred work.
3. Surface previously unstated assumptions.
4. Name the largest remaining blind spot.

For a completion handoff, fix acceptance-blocking gaps before writing. For an
intentional mid-task transfer, label blockers and next actions without claiming
completion.

## Required sections

1. Current task.
2. Verified state and last completed action.
3. Decisions made and their owning documents.
4. Verification commands and results.
5. Exact next step.
6. Blocking questions only.
7. Files touched.
8. Suggested repository skills.
9. Self-critique and remaining blind spot.

Use plain Markdown and concise bullets. Exclude conversation history, obsolete
dead ends, copied source contents, credentials, personal data, and unsupported
claims.

Finish when a fresh agent can identify the current task, verified state, and
exact next action using only the handoff and repository.
