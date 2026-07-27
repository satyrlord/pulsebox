# Pulsebox

Pulsebox is a desktop-first modular groove workstation for current Chrome,
Edge, and Firefox. It is a fully client-side browser application. The Phase 1
foundation is runnable: it includes the strict TypeScript toolchain, native Web
Components, typed state and plugin contracts, an AudioWorklet Acid Bass path,
transport, and three exposed rack slots.

The authoritative product contract starts at the
[specification index](docs/specs/spec-000-index.md). Its child specifications
are arranged in normative build order.

## Product boundary

- Eight rack slots, eight visible instrument mixer strips, and one master strip
  in the MVP.
- Native DOM, Custom Elements, Shadow DOM, Web Audio, AudioWorklet, IndexedDB,
  strict TypeScript, Vite, Vitest, and Playwright.
- No UI framework, virtual DOM, server product component, native wrapper, PWA,
  service worker, accounts, cloud sync, collaboration, or MIDI.
- The canonical local origin is `http://127.0.0.1:4173`. Development and
  production-build launch must fail rather than move to another port.

## Current status

Phase 0 contracts are complete. Phase 1 foundation work is implemented. Run
`npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e` for
current check results. The final MVP features in later roadmap phases are not
implemented yet.

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
```

`npm run dev` and `npm run start` both use the canonical origin with strict-port
behavior. `npm run start` serves only the built static client and exposes no
product API. Run `npm run build` before `npm run start`.

## Architecture

Pulsebox has strict engine, state, and UI layers. The engine owns audio and has
no DOM dependency. State owns serializable data and reversible commands and has
no DOM or live audio objects. UI owns Web Components and dispatches typed
commands without editing the audio graph.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the normative contracts.

## State and undo

Committed edits use typed commands. Continuous gestures create one history
entry. The product contract requires destructive actions to happen immediately,
retain full recovery data, and produce a non-blocking Undo notice. Meter frames,
playheads, focus, hover, audio power, and rack-collapse preferences are not
project data.

## Audio

The Phase 1 custom synthesis path runs in an AudioWorklet processor. Suitable
native Web Audio nodes remain behind engine-owned adapters. The processor
accepts the host frame count and never assumes a 128-frame quantum. The bundled
WAV, AIFF, and FLAC decoder foundation is present; sample-import UI and
cross-browser format fixtures remain later work.

## Persistence

`docs/PROJECT-FORMAT.md` defines the future IndexedDB, atomic save, import,
migration, recovery, and portable `.pulsebox` behavior. Persistence and portable
project operations are not implemented in the Phase 1 foundation.

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

- Persistence, portable projects, the full eight-slot rack, remaining
  instruments, mixer, effects, advanced editors, and export belong to later
  roadmap phases.
- Acid Bass currently implements its Phase 1 sound and compact-rack foundation;
  its expanded editor remains planned.
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
