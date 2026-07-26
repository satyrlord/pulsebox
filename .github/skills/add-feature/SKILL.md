---
name: add-feature
description: >
  Creates or updates repository specs, acceptance criteria, durable decisions,
  and documentation for new work. Use when adding a feature or defining an
  ambiguous slice, when making architectural decisions or changing contracts
  (API, persistence, import, playback), or when recording durable context
  (glossary, conventions, trade-offs) for future engineers and agents.
---

# Add Feature

## Goal

Write or update the smallest durable document that makes the next slice
unambiguous and records decisions future maintainers would otherwise have to
rediscover. Document decisions, not just code — the context and trade-offs
that explain *why it was built this way*. Skip obvious code and throwaway
prototypes under `tmp/`.

Use `grill-me` instead when the user wants interactive design grilling,
pressure-testing, or branch-by-branch questioning before documentation.

## First Rule

Do not create a duplicate spec or summary when an existing doc already owns the
behavior. Update the owning document instead.

## Read First

1. `AGENTS.md` - Agent behavior rules and guardrails
2. Relevant docs in `docs/` for the domain:
   - `docs/architecture.md` - Stack, process model, non-goals
   - `docs/data-model.md` - SQLite schema, FTS5, indexes
   - `docs/query-schema.md` - `rule_json` predicate-tree format
   - `docs/indexing.md` - First-run scan + incremental re-scan
   - `docs/audio-engine.md` - Web Audio scheduler + native-addon trigger
3. The owning file under `docs/specs/`, when one exists
4. Existing implementation that may already satisfy the request

## Choose The Right Home

For **canonical docs** (durable reference documents):

- feature behavior and acceptance criteria -> the owning
  `docs/specs/spec-NNN-name.md`
- architecture and process model -> `docs/architecture.md`
- data model and schema -> `docs/data-model.md`
- query format and compilation -> `docs/query-schema.md`
- indexing and scanning -> `docs/indexing.md`
- audio engine decisions -> `docs/audio-engine.md`
- cross-cutting terminology -> `docs/glossary.md`
- durable trade-off decisions -> the owning spec or canonical domain doc

Create a new numbered file under `docs/specs/` only when no existing spec owns
the behavior. This project does not use standalone ADRs.

Create a doc for anything expensive to reverse: framework or dependency
choices, data models and serialization formats, import/playback contracts,
service API contracts.

## Spec Content

When clarifying a slice before implementation, include:

- objective and user value
- explicit assumptions
- commands for build, test, and validation
- the behavior or contract being defined
- success criteria that are specific and testable
- non-goals or out-of-scope items
- open questions that still need a human answer

## Inline Documentation (TypeScript)

The highest-value comments record format gotchas at the point where a reader
would otherwise fall in. Every time an agent produces a wrong result from a
missing fact (endianness, pan precedence, scheduler timing constraints),
record the fact where it matters. No commented-out code, no lingering TODOs.

## Spec Workflow

1. Surface assumptions before drafting.
2. Pick the owning canonical doc in `docs/`.
3. Draft the smallest spec change that closes the ambiguity.
4. Surface unresolved choices that materially change the slice; continue when
   the documented context resolves them.
5. Hand off the unambiguous slice to implementation.

## Completion Criterion

The spec or documentation work is done when all of the following are true:

- **Slice is unambiguous** — the smallest change that closes the ambiguity
  has been drafted. No scope bloat.
- **No duplicates** — no existing doc already owned this behavior (checked
  against the canonical doc map in "Choose The Right Home").
- **Decisions recorded** — any trade-off or surprise-averse decision made
  during the work is captured in the owning doc.
- **Validation passes** — `markdownlint-cli2` passes on all edited Markdown
  files.

## Deep Reference

Use [REFERENCE.md](REFERENCE.md) for durable decision rules and the
decision-record threshold. Use [EXAMPLES.md](EXAMPLES.md) for concrete
spec, glossary, and decision-record updates.
