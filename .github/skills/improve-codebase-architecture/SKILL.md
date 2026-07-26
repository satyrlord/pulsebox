---
name: improve-codebase-architecture
description: Surface architectural friction across the entire project and propose deepening opportunities — refactors that turn shallow modules into deep ones.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

Use this shared design vocabulary — stay on these terms, don't drift into
"component," "service," "API," or "boundary":

- **module** — a unit of code with a single responsibility
- **interface** — what a module exposes; the surface callers depend on
- **depth** — how much complexity a module hides behind its interface;
  a **deep** module has a small interface hiding a large implementation
- **seam** — the place where two modules meet; their shared contract
- **adapter** — a module whose sole job is to translate between two seams
- **leverage** — how much work a module does relative to what a caller
  must understand to use it
- **locality** — how close related code lives; code that changes together
  should live together

Principles:

- **Deletion test** — would deleting this module concentrate complexity
  (good, it's deep), or just move it (bad, it's shallow)?
- **The interface is the test surface** — if a module is hard to test,
  its interface is wrong
- **One adapter = hypothetical seam, two = real** — the first adapter on a
  seam is scaffolding; the second proves the seam is right

The domain language in `docs/architecture.md`, `docs/data-model.md`, and
`docs/glossary.md` names good seams.

## Process

### 1. Explore

Read the project's architecture docs (`docs/architecture.md`,
`docs/data-model.md`) and `docs/glossary.md` first.

Then delegate independent, read-heavy areas to exploration subagents and walk
the **entire codebase** — not just recently changed files or the current branch diff.
Don't follow rigid heuristics — explore organically and note where you
experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates

For each candidate found during exploration, present a structured summary:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve
- **Recommendation strength** — one of `Strong`, `Worth exploring`, `Speculative`

End with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use the domain vocabulary from `docs/architecture.md`,
`docs/data-model.md`, and the terms defined above.** If `docs/glossary.md`
exists, use its terms — don't drift into "component," "service," "API," or
"boundary."

**Existing decision conflicts**: if a candidate contradicts a decision recorded in an existing doc, only surface it when the friction is
real enough to warrant revisiting that decision. Mark it clearly. Don't list every theoretical refactor a past decision forbids.

Do NOT propose interfaces yet. After presenting the candidates, ask the user: "Which of these would you like to explore?"

### 3. Deepen the chosen candidate

Once the user picks a candidate, use `add-feature` to record durable decisions as you work through the design with them:

- **Naming a deepened module after a concept not yet documented?** Add the
  term to the relevant doc under `docs/`; use `docs/glossary.md` for
  cross-cutting terminology.
- **Sharpening a fuzzy term during the conversation?** Update the relevant
  doc right there.
- **User rejects the candidate with a load-bearing reason?** Offer to record
  it as a durable decision in the relevant doc, framed as: _"Want me to
  record this so future architecture reviews don't re-suggest it?"_ Only
  offer when the reason would actually be needed by a future explorer to
  avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it
  right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** Design
  two competing interfaces in parallel, compare them against the deletion
  test and leverage, and record the winner.

## Completion Criterion

The architecture review is complete when:

- the exploration covers the full codebase (not just recent changes),
- the candidates and their trade-offs are clearly communicated,
- the top recommendation is explicit,
- and any durable architecture decisions that emerge are recorded in the
  relevant docs.
