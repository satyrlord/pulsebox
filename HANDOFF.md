# Phase 0 handoff

**Date:** 2026-07-26  
**Repository revision inspected:** `7d166c5` plus the current working-tree
documentation repair  
**Phase state:** Phase 0 contract work complete pending independent review

## Outcome

The repository now has one authoritative product specification and explicit
owners for architecture, themes, project and pack formats, sample policy, and
naming/originality evidence. It remains intentionally documentation-only. No
product source, package manifest, scripts, or tests exist.

The normative document set is:

- [SPEC.md](SPEC.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [PROJECT-FORMAT.md](PROJECT-FORMAT.md)
- [THEMING.md](THEMING.md)
- [docs/user-sample-policy.md](docs/user-sample-policy.md)

## Decisions closed

- Development and production-build launch use the exact origin
  `http://127.0.0.1:4173` and fail on a port conflict.
- The local launcher is static delivery tooling, not a product server.
- WAV, AIFF, and FLAC imports use bundled deterministic decoders.
- Portable projects and sample packs have bounded schemas, archive limits,
  validation order, atomic writes, compatibility rules, and recovery behavior.
- Every referenced instrument and effect is required. Missing recognized packs
  use a reference-preserving degraded mode.
- Monitor is exclusive physical-output pre-fader listen. It does not double the
  program path and is excluded from saved and exported project state.
- Time signatures are undoable structural Song events, not parameter automation.
- Rack-module collapse is a local preference, not project state or undo state.
- User themes use an allowlisted token grammar with numeric contrast and target
  checks.
- Asset and pack blobs stay pinned while current, recovery, pending-operation,
  or Undo/Redo references exist.

## Repository repairs

- Renamed the old unified specification to `SPEC.md` and updated repository
  links.
- Added the architecture, project-format, theming, README, handoff, sample
  policy, and naming/originality documents required for Phase 0.
- Removed stale Electron/JSX dead-code configuration and ignore entries.
- Removed the empty lockfile because no package manifest or dependency tree
  exists yet.
- Normalized the product name to `Pulsebox` in prose.

## Verification

Completed against the current working tree:

- Prettier formatting for every changed Markdown file.
- `npx --yes markdownlint-cli2 "**/*.md" "#node_modules"`: zero issues.
- Local Markdown link scan: pending final rerun after this handoff was created.
- Stale-path and stale-name scan: zero findings.
- Prohibited manufacturer and historical model-name scan: zero findings in the
  current repository scope.
- `git diff --check`: no whitespace errors before the final handoff edit.

Product build, typecheck, lint, unit, browser, visual, persistence, and audio
checks are not available. Phase 1 must create their scripts before any such
result can be claimed.

## Next action

Start Phase 1 only after the independent Phase 0 review has no unresolved
acceptance blocker. Phase 1 should create the strict TypeScript and Vite
toolchain, the required command surface, architectural import guards, and the
smallest application shell at the canonical strict-port origin. It must not
begin instrument or effect implementation before the shared typed contracts are
executable and tested.

## Close-out risks and limits

- Least confident: the fixed Monitor safety gain, limiter ceiling, and
  fade-through-silence transition are contract decisions only. Verify them with
  rendered null tests and physical-output browser checks when the engine exists.
- Least confident: built-in theme palettes passed contract-level contrast
  calculations, but real component adjacency, focus, and target geometry need
  production-browser evidence at every supported viewport.
- Deferred: choosing and auditing the bundled decoder implementations belongs to
  Phase 1. Verify licensing, dependency contents, deterministic fixtures, and
  worker integration before acceptance.
- Deferred: the unfamiliar-user one-minute task and three-second first-sound
  metric require a runnable production build and recorded environments.
- Assumption: no product behavior or compatibility obligation exists outside the
  current documents and non-normative prototypes.
- Largest blind spot: no executable artifact exists, so the architecture,
  persistence, accessibility, and audio contracts have not yet faced browser or
  implementation constraints.

## Independent review

Pending. The final review result and any resulting repairs will replace this
paragraph before close-out.
