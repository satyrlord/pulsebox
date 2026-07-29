---
name: handoff
description: >
  Create a Pulsebox session or phase handoff. Use when a fresh agent must resume,
  close, or verify the work without relying on conversation history.
---

# Create a Pulsebox handoff

## 1. Select the handoff location

1. Use the reply or an ignored temporary path for the handoff.
   Finish when no handoff file will enter the repository tree.
2. Link each recorded durable fact to its owning document.
   Finish when the temporary narrative owns no product contract.
3. Link to current owners instead of copying their full contents.
   Finish when no fact has a second owner in the handoff.

Do not create `HANDOFF.md`, a verification folder, or a dated repository report.
If a durable fact has no owner update, list that update as the next action. Do
not edit an owning document without explicit authority.

## 2. Verify the current state

1. Inspect HEAD, status, the complete diff, and the last concrete action.
   Finish when the handoff distinguishes current work from unrelated dirty work.
2. Inspect the latest relevant check results.
   Finish when each reported pass or failure has current command evidence.
3. List the least-confident work with a verification procedure.
   Finish when every uncertainty has one concrete check.
4. List skipped, incomplete, and deferred work.
   Finish when no completion claim hides a known gap.
5. State previously unstated assumptions and the largest remaining blind spot.
   Finish when the next agent can test each material assumption.

Do not repair a gap without explicit authority. If a gap blocks the underlying
task, report that task as incomplete. Label each blocker and next action.

## 3. Write the required sections

Write these sections in this order:

1. Current task.
2. Verified state and last completed action.
3. Decisions and owning documents.
4. Verification commands and results.
5. Exact next step, or `No next action`.
6. Blocking questions only.
7. Files touched.
8. Suggested repository skills.
9. Self-critique and remaining blind spot.

Use concise Markdown. Exclude obsolete attempts, copied source, credentials,
personal data, conversation history, and unsupported claims.

## Completion criterion

Complete the handoff when a fresh agent can identify the task, verified state,
owners, blockers, and exact next action. For finished work, the agent must be
able to verify that no action remains.
