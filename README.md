# Pulsebox

Pulsebox is a desktop-first modular groove workstation for current Chrome. It
is a fully client-side browser application. The Phase 1 foundation is runnable.
The specification 003 application shell and shared controls are also runnable.
The shell has four fixed rows and the approved rack, studio, and lower-editor
columns. It includes five named Patterns, basic Playlist transport, channel
mixing, appearance Settings, and browser project persistence.

Narrow later-phase foundations include six instrument modules and the
AudioWorklet Silver Serpent and Tin Soldier paths. The specification 004 transport
and timing slice is also runnable. It covers tap tempo, tempo drag, the
transport start marker, bar-quantized Pattern launches, deterministic Pattern
Humanize with stored seeds, the metronome click, the audio-engine power control,
the default master limiter, and post-limiter `L/R` and `M/S` header metering.
These slices do not mark their parent phases complete. The rack exposes all
eight slots. The Mixer exposes all eight instrument strips and one master strip.

The specification 005 rack and instrument slice is also runnable. The module
browser has a filter, compact identity cards, type tooltips, double-click Add,
and whole-card pointer drag into a specific empty slot. The rack
reorders by pointer drag from the ear handles with an insertion marker,
Escape cancel, and keyboard reorder. Each loaded module has a context menu
with Duplicate, Swap, and `Delete module`, reachable by right-click, the Menu
key, and Shift+F10. A swap keeps sequence data and reports unmapped events in
a non-blocking result panel. Faceplates keep Sound, Voice, and Output groups on
one horizontal row. Output stays at the right edge. Each group can collapse
independently. Faceplates carry mute, solo, audition, and selected-voice fast
controls.
The built-in `Neon Basement` template creates a fresh copy of the default
project. The project selector contains New, Open, Import, and Export. A New
action saves the active project before it loads the template.

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

Phase 0 contracts and the Phase 1 foundation are complete. The specification
003 shell and shared-control slice is present. Later-phase foundation slices
are present only where this README names them. Run `npm run lint`, `npm run
typecheck`, `npm run dead-code`, `npm test`, and `npm run test:e2e` for current
check results. The later product phases and final release acceptance remain
incomplete.

Current owners:

- [Specification index](docs/specs/spec-000-index.md): ordered product behavior,
  decision, and acceptance owners.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, commands, plugins, protocols,
  runtime, audio ownership, and verification seams.
- [PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md): projects, packs, validation, storage,
  migrations, and portable archives.
- [THEMING.md](docs/THEMING.md): theme tokens, safe import, high contrast, and theme
  verification.
- [docs/instruments/silver-serpent.md](docs/instruments/silver-serpent.md): Silver Serpent
  identity, parameters, behavior, and verification boundary.
- [docs/instruments/voice-behavior.md](docs/instruments/voice-behavior.md):
  per-instrument voice limits, steal priority, release, choke, and retrigger.
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
npm run lint:md
npm run ci
```

`npm run typecheck` runs the compiler from the pinned `@typescript/native`
TypeScript 7 package. ESLint and the
architecture policy read the TypeScript 6 API through the `typescript` alias.
typescript-eslint does not support TypeScript 7 yet. The alias installs its
compiler as `tsc6`, so the two compilers use different binary names.
Dependency versions are pinned exactly, so a fresh install cannot pull a
compiler or lint-tool change that fails `npm run ci` without a source edit.

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
playheads, focus, hover, audio power, and faceplate-group disclosure are not
project data.

## Audio

Custom synthesis runs in AudioWorklet processors. Suitable
native Web Audio nodes remain behind engine-owned adapters. The processor
accepts the host frame count and never assumes a 128-frame quantum. The master
chain runs through a limiter that is enabled by default. The header meters read
a non-audible post-limiter analysis branch in `L/R` or `M/S` mode. Playback
applies the global Swing and the Pattern-owned deterministic Humanize with its
stored seed. The bundled WAV, AIFF, and FLAC decoder foundation is present.
Sample-import UI and format fixtures remain later work.

## Persistence

Projects serialize to the versioned manifest defined by
`docs/PROJECT-FORMAT.md`. Edits autosave into the `pulsebox-v1` IndexedDB
database and restore on load. Explicit Save and Open use the same validated
repository path. Portable `.pulsebox` export wraps the canonical manifest in a
ZIP archive, and import validates the archive and manifest before state changes.
The bottom bar contains the explicit Save control at supported sizes.
Assets, packs, collision resolution, recovery history, and the complete Phase 7
transaction surface remain later work.

See [PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md).

## Accessibility

Every interactive feature must work by keyboard. Supported desktop viewports use
WCAG 2.2 Level AA criteria as measurable guidance for contrast, focus, target
size, semantics, and status messages. Pulsebox does not claim full WCAG
conformance below its documented 1280 × 720 editing boundary.

## Keyboard shortcuts

The specification owns the approved shortcuts. The current shell implements
Space for play or pause and Escape for Stop. It also implements platform-standard
undo, redo, and Save shortcuts. Ctrl+Alt+E collapses or expands the lower editor.
The Piano Roll supports Delete and Backspace for selected events. Arrow keys move
the selection. Shift plus Left or Right resizes a selected note. Control or
Command plus A selects all events. Control or Command plus D duplicates them.

## Known limitations

- Asset packs, advanced editors, rendered-audio export, and user-facing effect
  editing belong to later roadmap phases. The drum-voice Distortion engine and
  state foundation is present.
- The Pattern bank holds five named Patterns and selects Verse by default. The
  lower editor creates, selects, moves, resizes, duplicates, and deletes notes.
  It also paints fixed drum triggers and edits event velocity. Swing and
  Humanize controls remain in the shared header. Automation editing remains
  planned.
- Record arms and disarms only. Live recording and its count-in settings belong
  to the specification 006 phase.
- The mixer covers level, pan, mute, solo, and master level. Send buttons open
  the applicable empty send-chain summary. Send routing, module and master
  inserts, master-effects bypass, and the master chain remain planned.
- Silver Serpent and Tin Soldier implement their Phase 1 sound and compact-rack
  foundation. Expanded per-module editors remain planned for all six
  instruments: manifests declare editor sections, but no UI reads them yet.
- Silver Serpent does not yet implement the sub-oscillator level, second-oscillator
  detune, clean or dirty filter model, or the compact filter-response
  visualization from specification 005 section 15.1. Twin Engine does not yet
  draw its waveform preview.
- Per-slot enable or bypass and per-slot output routing are not yet
  implemented. Drum voices have one saved Distortion insert slot, but its
  control waits for the expanded instrument editor. Generated sample layers use
  click-safe playback boundaries where the drum module uses them. User
  choke-group assignment and per-voice metering remain planned.
  Per-step probability, micro-timing, flam, and roll wait for the specification
  006 editing surface.
- The default project stores sixteen-step Patterns. The specification 005
  named-Pattern bar lengths, the time-signature field, and a stored
  quantize-strength value remain planned. Default send effects and the master
  chain wait for the specification 007 effect plugins.
- Browser tests prove AudioWorklet activation. Final release still requires the
  specified rendered-audio, startup, and physical listening procedures.
- Files under `design/` are normally non-normative prototypes, not production
  evidence. Behavioral and release evidence comes from the owning
  specifications and production checks.
- Named historical research remains isolated under non-shipping `research/`.

## Adding an instrument

1. Create one plugin folder.
2. Add one registry entry.
3. Implement the base and instrument contracts in `docs/ARCHITECTURE.md`.
4. Use stable IDs.
5. Add schema and migration coverage.
6. Keep product-specific branches out of shared layers.
7. Write the sanitized instrument design document.
8. Update the affected acceptance criteria and verification evidence.

## Adding an effect

1. Create one effect plugin folder.
2. Add one registry entry.
3. Declare channel layout, latency, tail, bypass, wet/dry, safety clamps,
   automation, offline support, and UI manifests.
4. Update the schema and routing.
5. Add rendered-audio tests.
6. Update the documentation and acceptance evidence.

## Adding a theme

1. Add one built-in token set that conforms to [THEMING.md](docs/THEMING.md).
2. Do not add theme-specific TypeScript or markup.
3. Before acceptance, verify each component, viewport, focus state, meter, and
   high-contrast overlay.
