# Pulsebox

Pulsebox is a desktop-first modular groove workstation for current Chrome,
Edge, and Firefox. It is a fully client-side browser application. The Phase 1
foundation is runnable with narrow, tested foundations from later phases: a
React interface, AudioWorklet Acid Bass and Drumline Six paths, transport, a
four-Pattern bank, basic Playlist transport and channel mixing, appearance
Settings, and browser project persistence. These slices do not mark their
parent phases complete. Three rack slots are currently exposed.

The authoritative product contract starts at the
[specification index](docs/specs/spec-000-index.md). Its child specifications
are arranged in normative build order.

## Product boundary

- Eight rack slots, eight visible instrument mixer strips, and one master strip
  in the MVP.
- React, Zustand, CSS Modules, Web Audio, AudioWorklet, IndexedDB, strict
  TypeScript, Vite, Vitest, React Testing Library, and Playwright.
- No server product component, native wrapper, PWA, service worker, accounts,
  cloud sync, collaboration, or MIDI.
- The canonical local origin is `http://127.0.0.1:4173`. Development and
  production-build launch must fail rather than move to another port.

## Current status

Phase 0 contracts and the Phase 1 foundation are complete. Later-phase
foundation slices are present only where this README names them. Run `npm run
lint`, `npm run typecheck`, `npm run dead-code`, `npm test`, and `npm run
test:e2e` for current check results. Phases 2 through 7 and their final
acceptance criteria remain incomplete.

Current owners:

- [Specification index](docs/specs/spec-000-index.md): ordered product behavior,
  decision, and acceptance owners.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, commands, plugins, protocols,
  runtime, audio ownership, and verification seams.
- [PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md): projects, packs, validation, storage,
  migrations, and portable archives.
- [THEMING.md](docs/THEMING.md): theme tokens, safe import, high contrast, and theme
  verification.
- [docs/instruments/acid-bass.md](docs/instruments/acid-bass.md): Acid Bass
  identity, parameters, behavior, and verification boundary.
- [docs/user-sample-policy.md](docs/user-sample-policy.md): accepted samples,
  ownership, privacy, and user-facing failure behavior.
- [docs/audits/naming-originality-audit.md](docs/audits/naming-originality-audit.md):
  current naming, dependency, and originality evidence.

## Commands

The command surface is:

```text
npm install
npm run dev
npm run build
npm run start
npm run test
npm run test:e2e
npm run lint
npm run typecheck
npm run dead-code
npm run format
npm run lint:md
npm run ci
```

`npm run typecheck` runs the compiler from the pinned `@typescript/native`
TypeScript 7 package. ESLint and the
architecture policy read the TypeScript 6 API through the `typescript` alias,
because typescript-eslint does not support TypeScript 7 yet; that package
installs its compiler as `tsc6`, so the two never contend for one binary name.
Dependency versions are pinned exactly, so a fresh install cannot pull a
compiler or lint-tool change that fails `npm run ci` without a source edit.
`npm run format` remains available as an optional tool and is not part of the
quality gate.

`npm run dev` and `npm run start` both use the canonical origin with strict-port
behavior. `npm run start` serves only the built static client and exposes no
product API. Run `npm run build` before `npm run start`.

## Architecture

Pulsebox has strict engine, state, persistence, and UI layers. The engine owns
the audio clock, the lookahead scheduler, and every voice adapter, and has no
DOM dependency. State owns serializable data, reversible commands, and the
project document, and holds no DOM or browser object. Persistence adapts
IndexedDB behind a state-owned port. UI owns the React components and a Zustand
store, and dispatches typed commands without editing the audio graph.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the normative contracts.

## State and undo

Committed edits use typed commands. Continuous gestures create one history
entry. The product contract requires destructive actions to happen immediately,
retain full recovery data, and produce a non-blocking Undo notice. Meter frames,
playheads, focus, hover, audio power, and rack-collapse preferences are not
project data.

## Audio

Custom synthesis runs in AudioWorklet processors. Suitable
native Web Audio nodes remain behind engine-owned adapters. The processor
accepts the host frame count and never assumes a 128-frame quantum. The bundled
WAV, AIFF, and FLAC decoder foundation is present; sample-import UI and
cross-browser format fixtures remain later work.

## Persistence

Projects serialize to the versioned manifest defined by
`docs/PROJECT-FORMAT.md`. Edits autosave into the `pulsebox-v1` IndexedDB
database and restore on load. Explicit Save and Open use the same validated
repository path. Portable `.pulsebox` export wraps the canonical manifest in a
ZIP archive, and import validates the archive and manifest before state changes.
Assets, packs, collision resolution, recovery history, and the complete Phase 7
transaction surface remain later work.

See [PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md).

## Accessibility

Every interactive feature must work by keyboard. Supported desktop viewports use
WCAG 2.2 Level AA criteria as measurable guidance for contrast, focus, target
size, semantics, and status messages. Pulsebox does not claim full WCAG
conformance below its documented 1280 × 720 editing boundary.

## Keyboard shortcuts

The specification owns the approved shortcuts. Phase 1 implements Space for
play or pause, Escape for Stop, and platform-standard undo and redo. The future
shortcut reference will expand with the Phase 3 editor commands so it does not
claim unimplemented behavior.

## Known limitations

- Asset packs, the full eight-slot rack, the four remaining instruments,
  effects, advanced editors, and rendered-audio export belong to later roadmap
  phases.
- The Pattern bank holds four named Patterns. The module-aware Piano Roll and
  complete note, trigger, and automation editing surface remain planned.
- The mixer covers level, pan, mute, solo, and master level. Sends, inserts, and
  the master chain remain planned.
- Acid Bass and Drumline Six implement their Phase 1 sound and compact-rack
  foundation; their expanded editors remain planned.
- Browser tests prove AudioWorklet activation. Final release still requires the
  specified rendered-audio, startup, and physical listening procedures.
- Files under `design/` are normally non-normative prototypes, not production
  evidence. `docs/design/claude-mock-up.html` is the specification-approved
  visual composition target; behavioral and release evidence still comes from
  the owning specifications and production checks.
- Named historical research remains isolated under non-shipping `research/`.

## Adding an instrument

Define one plugin folder and registry entry that implement the base and
instrument contracts in `docs/ARCHITECTURE.md`. Use stable IDs, add schema and
migration coverage, keep product-specific branches out of shared layers, write
the sanitized instrument design document, and update affected acceptance
criteria and verification evidence.

## Adding an effect

Define one effect plugin folder and registry entry. Declare channel layout,
latency, tail, bypass, wet/dry, safety clamps, automation, offline support, and
compact and detailed UI manifests. Update schema, routing, rendered-audio tests,
documentation, and acceptance evidence together.

## Adding a theme

Add one built-in token set conforming to [THEMING.md](docs/THEMING.md). Do not add
theme-specific TypeScript or markup. Verify every component, supported viewport,
focus state, meter, and high-contrast overlay before accepting it.
