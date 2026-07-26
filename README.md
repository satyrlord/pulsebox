# Pulsebox

Pulsebox is a planned desktop-first modular groove workstation for current
Chrome, Edge, and Firefox. It is a fully client-side browser application. The
repository is in Phase 0: product and architecture contracts exist, but product
source, package scripts, and tests do not exist yet.

The authoritative product contract is [SPEC.md](SPEC.md).

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

Phase 0 owns contracts and review evidence. It does not claim a runnable
application. Start Phase 1 only after the Phase 0 documents and checks pass.

Current owners:

- [SPEC.md](SPEC.md): approved product behavior and acceptance criteria.
- [ARCHITECTURE.md](ARCHITECTURE.md): layers, commands, plugins, protocols,
  runtime, audio ownership, and verification seams.
- [PROJECT-FORMAT.md](PROJECT-FORMAT.md): projects, packs, validation, storage,
  migrations, and portable archives.
- [THEMING.md](THEMING.md): theme tokens, safe import, high contrast, and theme
  verification.
- [HANDOFF.md](HANDOFF.md): verified phase state and next action.
- [docs/user-sample-policy.md](docs/user-sample-policy.md): accepted samples,
  ownership, privacy, and user-facing failure behavior.
- [docs/audits/naming-originality-audit.md](docs/audits/naming-originality-audit.md):
  current naming, dependency, and originality evidence.

## Commands

The required future command surface is:

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

These commands are not available until Phase 1 creates `package.json` and the
product toolchain. `npm run dev` and `npm run start` must both use the canonical
origin with strict-port behavior. `npm run start` will serve only the built
static client and expose no product API.

## Architecture

Pulsebox has strict engine, state, and UI layers. The engine owns audio and has
no DOM dependency. State owns serializable data and reversible commands and has
no DOM or live audio objects. UI owns Web Components and dispatches typed
commands without editing the audio graph.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the normative contracts.

## State and undo

Committed edits use typed commands. Continuous gestures create one history
entry. Destructive actions happen immediately, retain full recovery data, and
produce a non-blocking Undo notice. Meter frames, playheads, focus, hover, audio
power, and rack-collapse preferences are not project data.

## Audio

Custom synthesis and DSP run in AudioWorklet processors. Suitable native Web
Audio nodes remain behind engine-owned adapters. Processors accept the host
frame count and never assume a 128-frame quantum. WAV, AIFF, and FLAC use the
Pulsebox-owned bundled decoder path so supported formats do not vary by browser.

## Persistence

Projects and assets live in IndexedDB at the canonical origin. Saves, imports,
and migrations are atomic. Portable `.pulsebox` files are bounded ZIP-compatible
archives. Browser quota failure preserves the last committed project and keeps
portable Export available.

See [PROJECT-FORMAT.md](PROJECT-FORMAT.md).

## Accessibility

Every interactive feature must work by keyboard. Supported desktop viewports use
WCAG 2.2 Level AA criteria as measurable guidance for contrast, focus, target
size, semantics, and status messages. Pulsebox does not claim full WCAG
conformance below its documented 1280 × 720 editing boundary.

## Keyboard shortcuts

The specification currently owns the approved shortcuts, including Space for
play or pause, Escape for Stop, platform-standard undo and redo, and the editor
selection and clipboard commands. A user-facing shortcut reference is created
with the owning Phase 1 and Phase 3 UI work so it cannot claim unimplemented
behavior.

## Known limitations

- There is no product source or package manifest.
- No build, typecheck, product lint, unit, browser, visual, persistence, or
  rendered-audio result can be claimed yet.
- Files under `design/` are non-normative prototypes, not production evidence.
- Named historical research is allowed only under non-shipping `research/` and
  does not yet exist.

## Adding an instrument

Define one plugin folder and registry entry that implement the base and
instrument contracts in `ARCHITECTURE.md`. Use stable IDs, add schema and
migration coverage, keep product-specific branches out of shared layers, write
the sanitized instrument design document, and update affected acceptance
criteria and verification evidence.

## Adding an effect

Define one effect plugin folder and registry entry. Declare channel layout,
latency, tail, bypass, wet/dry, safety clamps, automation, offline support, and
compact and detailed UI manifests. Update schema, routing, rendered-audio tests,
documentation, and acceptance evidence together.

## Adding a theme

Add one built-in token set conforming to [THEMING.md](THEMING.md). Do not add
theme-specific TypeScript or markup. Verify every component, supported viewport,
focus state, meter, and high-contrast overlay before accepting it.
