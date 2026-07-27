---
name: handoff
description: Use when the user wants to hand off, wrap up, or write up a Pulsebox session or phase so a fresh agent can resume.
---

# Create a Pulsebox handoff

## Choose the artifact

- Write the handoff to an ignored temporary path, or report it directly to the
  user. That is the default for every handoff, session or phase.
- Never add a handoff, session report, or evidence file to the repository tree.
  Do not create `HANDOFF.md`, a `docs/verification/` entry, or any dated report.
  A handoff describes a moment in time; the repository records what is required
  and its implementation status.
- When a handoff contains a durable requirement, decision, or verified
  limitation, write that fact into its owning specification and leave the rest of
  the narrative out of the repository.
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
5. Exact next step, or `No next action` when the work is complete.
6. Blocking questions only.
7. Files touched.
8. Suggested repository skills.
9. Self-critique and remaining blind spot.

Use plain Markdown and concise bullets. Exclude conversation history, obsolete
dead ends, copied source contents, credentials, personal data, and unsupported
claims.

Finish when a fresh agent can identify the current task, verified state, and
next action using only the handoff and repository, or can tell that no action
remains after completed work.
