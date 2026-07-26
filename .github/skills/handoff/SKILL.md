---
name: handoff
description: Transfer session state to a fresh agent as a minimal, lossless state-transfer document.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

# Handoff

Produce a **state-transfer .md file** — the minimum payload a fresh agent
needs to resume this session without re-litigating decisions already made.
Save to the tmp folder of the current workspace.

## Self-Critique Phase (Before Writing)

Before composing the handoff, run a brief self-critique to surface gaps and
unstated assumptions. Log the results; do not start fixing them — that turns
two minutes into another hour. The handoff carries them forward.

1. **What are you least confident about?** List what you did not properly
   investigate. For each item, name a concrete command or test that would
   verify or disprove it. If you cannot name a cheap check, the uncertainty
   is likely filler.
2. **What did you skip, defer, or not investigate?** Be explicit — not "the
   tests pass" but "edge case X was never tested; error path Y was not
   exercised."
3. **What assumptions went unstated?** Surface reasoning shortcuts you took
   for granted. Overconfident errors are harder to spot than uncertain ones.
4. **What is the biggest thing the user might be missing?** Surface blind
   spots you see but they have not considered.

Capture these findings under the "Open questions" section (below) or as a
short appendix at the end of the handoff.

## Completion Criterion

The handoff is done when a fresh agent, given only this document and the
repo, can state the current task, the last concrete action taken, and the
exact next step — without asking a single clarifying question.

## Required Sections

1. **Current task** — one sentence. What we are building or fixing.
2. **State snapshot** — the last concrete action taken, and the immediate
   next step. Be specific: file paths, line numbers, command to run.
3. **Decisions made** — what was ruled in, what was ruled out, and why. This
   is the highest-value section; it prevents re-litigation.
4. **Open questions** — only the ones that block the next step. Skip
   resolved questions and future-phase unknowns.
5. **Files touched** — paths, not contents. Reference diffs or commits when
   available.
6. **Suggested skills** — the repo skills the next agent should invoke, in
   order.

## What to Exclude

- Content already captured in artifacts (PRDs, plans, ADRs, issues, commits,
  diffs). Reference them by path or URL.
- Conversation history, dead ends, or discarded approaches — unless the
  *reason* for discarding is a durable decision.
- Sensitive information: API keys, passwords, PII.

## Format

Plain Markdown. No boilerplate headers beyond the sections above. Prefer
bullet lists over prose paragraphs.

## Tailoring

If the user passed arguments, treat them as a description of the next
session's focus. Weight the state snapshot and suggested skills toward that
focus.
