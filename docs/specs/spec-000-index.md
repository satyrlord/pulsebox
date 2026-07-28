# Pulsebox Product Specification Index

**Status:** Approved normative entry point  
**Version:** 1.0  
**Approval date:** 2026-07-26  
**Purpose:** Define the authoritative specification set, its build order, and
the single owner of every product requirement.

The files linked from this index together form the Pulsebox MVP product
specification. No individual child file is a competing or secondary product
specification.

This approved version 1.0 set is final for the MVP scope and contains no
unresolved product decisions. Older superseded source documents are historical
references only.

## 0. Specification governance

1. This index and its listed child specifications are the single living
   Pulsebox product contract.
2. Each requirement has one owning child specification. Other documents may
   refine it but must not redefine it.
3. Direct product-owner decisions override the current text. Record each
   accepted decision in its owning child specification, affected acceptance
   criteria, and the decision record in the same change.
4. Never resolve a contradiction by dropping functionality. Report any
   conflict that the current repository cannot resolve.
5. Keep global section numbers, decision IDs `D01` through `D63`, and release
   acceptance numbers stable. These identifiers provide cross-file
   traceability. An unqualified numbered-section reference resolves through the
   section ownership in the build-order table below.
6. Files under `design/` are prototypes and visual evidence. They are not
   normative unless a product specification or direct product-owner decision
   makes them so.

### 0.1 Reading and implementation workflow

For a new implementation phase, read the build-order specifications through the
target phase. For a change to existing behavior, read this index, the owning
specification, every listed dependency, the affected acceptance criteria, and
the applicable domain contracts.

Before product code:

- Write a build plan in specification order.
- Map the work to exact acceptance criteria.
- Define shared contracts before dependent modules or features.
- Begin material research with independent parallel investigations when the
  available agent environment supports them.
- Verify unstable browser and Web Audio facts with current primary sources.
- Keep code, tests, specifications, and user documentation consistent.
- Keep code, comments, tests, and documentation in simple English. Do not use
  emoji in those artifacts.
- Request independent review before implementing a material plugin-contract or
  architecture change.
- Re-run the relevant repository audit after naming, asset, sample, or
  legal-boundary changes.
- Keep named historical research only in the non-shipping `research/`
  directory.

## Build order and ownership

The order is normative. A later specification may depend on an earlier one. An
earlier specification must not depend on a later feature implementation.

<!-- markdownlint-disable MD013 -->

| Order | Specification | Depends on | Owns | Primary acceptance criteria |
| ----- | ------------- | ---------- | ---- | --------------------------- |
| 1 | [Product and design foundations](spec-001-product-and-design-foundations.md) | This index | Sections 1-3, 11, and 27: product goal, naming, originality, principles, visual language, themes, and scope boundary | `AC-006`, `AC-039`-`AC-041`, `AC-058`, `AC-067` |
| 2 | [Technical foundations](spec-002-technical-foundations.md) | `spec-001` | Sections 4-7: technology, layers, plugin contracts, state, commands, and Undo foundations | `AC-001`-`AC-003`, `AC-033`, `AC-043`, `AC-071`, `AC-078`, `AC-084` |
| 3 | [Application shell and controls](spec-003-application-shell-and-controls.md) | `spec-002` | Sections 8, 10, and 22: application composition, UI components, navigation, responsive behavior, and shared controls | `AC-004`-`AC-005`, `AC-042`, `AC-059`, `AC-064`-`AC-066` |
| 4 | [Audio engine and transport](spec-004-audio-engine-and-transport.md) | `spec-003` | Sections 12, 17, and 21: transport, timing, AudioWorklet, scheduling, sample boundaries, and live audio | `AC-031`, `AC-044`-`AC-050`, `AC-063`, `AC-073` |
| 5 | [Rack and instruments](spec-005-rack-and-instruments.md) | `spec-004` | Sections 9 and 13-15: default projects, unified module browser, rack behavior, and instrument modules | `AC-007`-`AC-010`, `AC-021`, `AC-077`, `AC-080` |
| 6 | [Pattern editing](spec-006-pattern-editing.md) | `spec-005` | Section 16: named project Patterns, one module-aware Piano Roll as the single pattern and automation editing surface, live input, generators, and transforms | `AC-011`-`AC-017`, `AC-069`, `AC-072`, `AC-079`, `AC-086` |
| 7 | [Mixer and effects](spec-007-mixer-and-effects.md) | `spec-006` | Sections 19-20: mixer, routing, Monitor, inserts, send chains, master chain, and effects | `AC-018`-`AC-020`, `AC-022`-`AC-028`, `AC-062`, `AC-068`, `AC-074`-`AC-076`, `AC-085` |
| 8 | [Song and automation](spec-008-song-and-automation.md) | `spec-007` | Section 18: ordered named-Pattern Playlist and Pattern step automation | `AC-029`-`AC-030`, `AC-032`, `AC-070` |
| 9 | [Persistence and export](spec-009-persistence-and-export.md) | `spec-008` | Section 23: samples, browser storage, project documents, recovery, import, portable archives, WAV, and stems | `AC-034`-`AC-038`, `AC-051`-`AC-054`, `AC-081`-`AC-083` |
| 10 | [Quality and delivery](spec-010-quality-and-delivery.md) | `spec-009` | Section 24: accessibility, evidence, browser support, documentation, build phases, and close-out | `AC-055`-`AC-057`, `AC-060`-`AC-061` |

<!-- markdownlint-enable MD013 -->

Supporting traceability records:

- [Approved decision record](spec-011-decision-record.md) preserves decision IDs
  and their rationale. Behavior remains owned by specifications 001 through
  010.
- [Release acceptance](spec-012-release-acceptance.md) is the complete MVP gate.
  Every criterion has one primary owner in the table above, even when
  verification crosses several domains.

## Domain contract relationship

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) owns durable interfaces, dependency
  directions, protocols, IDs, and technical verification seams.
- [`PROJECT-FORMAT.md`](../PROJECT-FORMAT.md) owns the project schema, IndexedDB
  storage, migrations, validation, and portable archives.
- [`THEMING.md`](../THEMING.md) owns theme tokens and user-theme validation.

When a domain contract and its owning product specification disagree, stop and
reconcile both documents before implementation. A release acceptance statement
tests product behavior; it does not create a second behavior owner.

## Specification maintenance

- Update the smallest owning specification that fully contains the change.
- Update dependencies only when their contracts also change.
- Add a new child specification only when no current owner can hold the new
  domain without mixing unrelated responsibilities.
- Add the new file to this ordered table and to the structure test.
- Keep requirements testable with exact acceptance criteria and objective
  evidence.
- Do not restore a full duplicated unified specification.
