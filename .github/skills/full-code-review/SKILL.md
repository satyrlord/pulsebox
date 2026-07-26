---
name: full-code-review
description: Reviews a change set against an unusually strict maintainability bar, emphasizing code-judo simplification, abstraction quality, the 1k-line rule, and spaghetti growth.
disable-model-invocation: true
---

# Full Code Review

Run a read-only **code-judo review** by default: look for restructurings that
preserve behavior while deleting concepts, branches, wrappers, or layers.
Do not edit files unless the user explicitly asks to apply the findings.

## Review

1. Establish the review surface from the user's scope, current diff, and
   relevant canonical docs. Preserve unrelated dirty work.
2. Read every changed file and enough callers, tests, and contracts to judge
   the change in context.
3. Apply every standard below. Record evidence before assigning severity.
4. Prefer a small number of high-conviction structural findings over cosmetic
   notes.
5. If the user requested fixes, implement only findings within the requested
   scope and invoke `run-quality-gate` afterward. Otherwise, remain read-only.

## Standards

### Code judo

- **Smell:** complexity moves without reducing what a reader must hold.
- **Remedy:** reframe ownership or state so branches, modes, or layers vanish.

### 1k-line crossing

- **Smell:** a change pushes a file from below 1000 lines to above it.
- **Remedy:** decompose before landing unless the file remains compellingly
  cohesive and the exception is justified.

### Spaghetti growth

- **Smell:** ad-hoc conditionals, nullable modes, or special cases spread
  through unrelated flows.
- **Remedy:** move the policy to the module that owns the concept or replace
  flags with an explicit state model.

### Direct over magical

- **Smell:** identity wrappers, generic machinery hiding a simple shape, or
  copy-pasted logic.
- **Remedy:** inline, extract one pure function, or collapse duplicate paths.

### Clean contracts

- **Smell:** casts, unnecessary optionality, silent fallback, or ad-hoc object
  shapes obscure an invariant.
- **Remedy:** make the type and process boundary explicit.

### Canonical ownership

- **Smell:** feature logic leaks into shared code or duplicates an existing
  helper.
- **Remedy:** place logic in the layer that owns the documented concept and
  reuse its canonical contract.

### Atomic orchestration

- **Smell:** independent work is serialized or related updates can remain
  half-applied.
- **Remedy:** simplify orchestration through parallel independence or one
  atomic state transition.

Use [REFERENCE.md](REFERENCE.md) only when a smell needs a concrete remedy
pattern.

## Output

Order findings by severity. For each finding, provide the path and location,
the structural risk, the evidence, and one actionable remedy. State explicitly
when no blocking findings remain.

## Completion Criterion

The read-only review is complete when every changed file is accounted for,
every standard has been applied, each finding carries concrete evidence and an
actionable remedy, and no file was edited. The fix branch is complete only
when the requested findings are implemented and `run-quality-gate` outcomes
are reported without concealing blockers.
