# AGENTS.md

Imperative rules for AI coding agents working on Pulsebox.

Use simple English. Prefer short sentences and a plain structure. Do not use
emoji in code, comments, tests, specifications, documentation, or skills.

Pulsebox is a fully client-side, desktop-first modular groove workstation for
Chrome, Edge, and Firefox. It is built with strict TypeScript, Web Audio, and
AudioWorklet. No server product component, no MIDI.

## Source of truth

- Start with [the product specification index](docs/specs/spec-000-index.md)
  before planning or changing product code. Follow its build order and read each
  applicable owning specification and dependency in full.
- Treat the indexed specification set as the approved MVP contract and
  acceptance source.
- Do not create a competing product specification or restore a duplicated
  unified specification.
- A direct product-owner decision overrides the specification. Update the owning
  specification, implementation, tests, and user documentation together.
- Do not silently remove a requirement to resolve a contradiction. Report the
  conflict and obtain a product decision when the current repository cannot
  resolve it.
- Files under docs/design/ are prototypes and visual evidence. They are not
  normative unless the specification or user explicitly makes them so. This
  includes `docs/design/claude-mock-up.html`, which spec-003 section 8.2 makes
  the single approved composition target. Do not reintroduce a second design
  target in another medium; it drifts from the HTML and contradicts it.

Owning contract documents:

- [The specification index](docs/specs/spec-000-index.md) owns build order and
  requirement routing. Its child specifications own approved product behavior,
  decisions, and acceptance criteria.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) owns layers, plugin manifests, the command
  model, the worklet protocol, ID families, test seams, and audio verification
  tolerances.
- [PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md) owns the project schema, IndexedDB
  storage, migrations, import validation, and portable `.pulsebox` archives.
- [THEMING.md](docs/THEMING.md) owns the theme token vocabulary and the user-theme
  import contract.

## Current repository state

- Phase 0 contracts and the Phase 1 foundation are complete. Narrow foundation
  slices from later phases are runnable without marking those phases complete.
- The repository has a strict TypeScript product source tree, package manifest,
  unit tests, and production-browser tests.
- Claim checks only when their current scripts have been run successfully.
- Later MVP phases remain governed by the indexed specification set under
  `docs/specs/`. Claim only the narrow later-phase slices listed in README.md;
  do not describe their incomplete parent phases as implemented.

## Roles and workflow

- Keep planning, implementation, integration, and critical review distinct.
- The root coordinator owns the plan, shared-worktree integration, conflicts,
  and final review.
- Use exploration workers for independent, read-heavy work. Use execution
  workers for narrow work with an objective verifier.
- Give delegated work a bounded scope, expected output, and verification method.
  Avoid overlapping edits.
- `.github/skills/` holds the repository workflows, including add-feature,
  design-pulsebox-ui, run-quality-gate, full-code-review, verify, refactor,
  dead-code-audit, and handoff. Use skills-router when the right one is unclear.
- Use higher reasoning for architecture, audio, persistence, security,
  concurrency, and ambiguous product contracts.
- Before material work, inspect all applicable current documentation and code.
- Verify unstable browser and Web Audio behavior with current primary sources.
  Do not rely on memory for material API facts.
- Separate verified facts, evidence-supported inferences, assumptions, and
  unresolved questions.

## Product boundary

- Build a fully client-side, desktop-first browser application that runs locally
  in a browser.
- Use `http://127.0.0.1:4173` as the canonical development and production-build
  origin. Fail when that port is unavailable instead of selecting another one.
- A repository-owned static-file launcher is delivery tooling, not a product
  server component. It serves only the built client and exposes no API.
- Do not add a server, accounts, cloud sync, collaboration, a native wrapper, a
  PWA, a service worker, or an install flow.
- Support current stable Chrome, Edge, and Firefox. Safari is outside MVP
  support.
- Keep the editable workspace usable from 1280 x 720 CSS pixels upward. Below
  either minimum dimension, use the specified unsupported-size behavior.
- Keep the MVP at eight rack slots, eight visible instrument mixer strips, and
  one master strip. Preserve slot-count-agnostic internals for the post-MVP
  sixteen-slot target without enabling it.

## Naming and originality

- Render PULSEBOX in uppercase only in the centered app mark and browser title.
  Use Pulsebox in normal prose.
- Use the .pulsebox extension for portable projects.
- Keep manufacturer names, historical product names and model numbers, copied
  layouts, copied artwork, copied presets, and extracted samples out of all
  shipping files.
- Named historical research may exist only under non-shipping research/.
- Keep factory sounds, generated buffers, patterns, presets, graphics, icons,
  control ranges, defaults, layouts, and sound targets original.
- Re-run a case-insensitive naming and dependency audit after naming, asset,
  sample, research, or legal-boundary changes.

## Technology

Use:

- strict TypeScript;
- one UI framework or component model for the whole UI layer, applied
  consistently;
- style encapsulation for reusable controls and isolated leaf components;
- CSS Grid, Flexbox, custom properties, and original inline SVG;
- Canvas only where high-frequency rendering benefits from it;
- Web Audio and AudioWorklet;
- IndexedDB for projects and project assets;
- local storage only for lightweight global UI preferences;
- Vite or an equivalent lightweight TypeScript build tool;
- Vitest and Playwright.

Do not use:

- third-party sequencer, mixer, piano-roll, knob, or fader components;
- raster control artwork;
- ScriptProcessorNode or main-thread custom DSP;
- MIDI APIs, MIDI files, MIDI learn, or MIDI placeholders.

Inspect the dependency tree before close-out. Remove unused dependencies.

## Architecture

- Keep engine, state, and UI as strict layers.
- The engine owns the audio graph, plugins, transport, scheduling, meters,
  sample decoding, offline rendering, export, and worklet messaging. It has no
  DOM dependency.
- The state layer owns plain project data, commands, undo and redo,
  serialization, migrations, validation, selectors, editor state, automation,
  and persistence state. It has no DOM and stores no live AudioNode objects.
- The UI owns components, layout, input, accessibility, themes, and visual
  patching. It dispatches typed commands and never edits the audio graph.
- Define the base plugin manifest, instrument and effect contracts, parameter
  descriptors, command model, message protocol, project schema, and theme tokens
  before implementing instruments or effects.
- Add an instrument or effect through its plugin folder and registry entry. Do
  not spread product-specific branches through shared engine, state,
  persistence, mixer, automation, or UI code.
- Use stable typed IDs and parameter IDs. Do not use array positions as durable
  references.

## Repository map

The three domain layers and the wiring-only composition boundary live here:

| Path                | Layer       | Owns                                                                                      |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `src/main.tsx`      | composition | Object creation, port injection, command routing, startup and shutdown                    |
| `src/engine/`       | engine      | AudioContext, AudioNodes, worklets, transport clock, scheduling, decoding, offline render |
| `src/state/`        | state       | Project data, typed commands, undo and redo, selectors, serialization, persistence ports  |
| `src/persistence/`  | persistence | Browser-storage adapters behind state-owned ports. The only layer that names IndexedDB    |
| `src/ui/`           | UI          | Components, layout, input, focus, accessibility, themes, DOM patching                     |
| `src/contracts/`    | contracts   | Data-only shared types with no singleton, browser handle, or algorithm                    |

Cross-layer imports go through the owning layer's `public.ts`
(`src/engine/public.ts`, `src/state/public.ts`, `src/persistence/public.ts`,
`src/ui/public.ts`). Two guards enforce this:

- `no-restricted-imports` per layer in `eslint.config.mjs`. Its patterns match a
  layer directory at any nesting depth, so a deeply nested component cannot
  reach across a boundary by adding another `../`.
- The AST policy in `tests/unit/architecture/source-policy.ts`, which also fails
  on `ScriptProcessorNode`, any identifier or string matching `midi`,
  service-worker code, and product-specific plugin-ID branching outside a plugin
  folder or the registry.

Read that policy file before adding a source directory or a shared branch.

An instrument or effect folder follows the current module shape under
`src/engine/modules/<plugin-id>/`:

- `manifest.ts` declares the base manifest, parameter descriptors, meters,
  defaults, and the UI manifest including its `moduleAccent` tokens.
- `dsp-core.ts` holds pure, testable DSP.
- `<name>.worklet.ts` is the AudioWorkletProcessor.
- `adapter.ts` loads the worklet module and owns its nodes. It imports the
  worklet through a Vite `?worker&url` import, not a hand-written path.
- `runtime.ts` implements the lifecycle the engine drives.

`PulseStore` in `src/state/pulse-store.ts` is the only mutation path. Its history
limits are 100 entries, 64 MiB combined, and 17 MiB per entry, enforced by
evicting the oldest entries rather than rejecting a valid new action.

## Audio

- Run custom synthesis and DSP in AudioWorklet processors.
- Hide suitable native Web Audio nodes behind engine-owned plugin adapters.
- Process the frame count supplied by the audio host. Never hard-code a
  128-frame render quantum.
- Document latency for bounded fixed-block adapters.
- Smooth audible parameter changes and apply the specified sample micro-fades.
- Keep playback continuous during compatible editing, theme changes, saving,
  loading, module changes, and effect changes.
- Keep the UI editable when audio is blocked or unavailable.
- Test live behavior at 44.1 kHz and 48 kHz. Verify offline export separately
  from live monitoring.

## State, persistence, and undo

- Route committed user edits through typed commands.
- Coalesce a continuous gesture into one undo entry.
- Use immediate destructive actions with complete Undo while their bounded
  active-history entry is retained, a non-blocking Undo notice, and an ARIA live
  announcement. Evict older history rather than reject a valid new action. Do
  not add confirmation dialogs.
- Store projects and assets in IndexedDB. Store only lightweight global UI
  preferences in local storage.
- Keep project documents versioned, validated, and migration-aware.
- Treat imported project data as untrusted. Reject executable content, unsafe
  paths, invalid structures, unknown or incompatible referenced plugins, and
  projects exceeding eight rack slots as specified in docs/PROJECT-FORMAT.md.
- Keep live audio objects, meter frames, hover, focus, playheads, and temporary
  previews out of serialized state.
- Preserve project migration paths that remain part of the current format
  contract. Do not confuse required migrations with dead legacy code.

## UI and accessibility

- Name UI components in PascalCase and give each rendered root a kebab-case
  data-component hook for tests. The pulse- prefix stays reserved for CSS custom
  properties and storage keys, not component names.
- Render component structure once and patch changed state. Avoid rebuilding
  large subtrees during high-frequency updates.
- Never insert project data through unsanitized innerHTML.
- Clean up event listeners, observers, worklet ports, timers, and animation
  frames when components disconnect.
- Follow the fixed rack, studio, mixer, effects, editor, and bottom-bar
  hierarchy in the specification.
- Use the approved tactile studio visual language and the single built-in
  `rack` theme (decision `D79`). High contrast is an overlay, and user themes
  follow docs/THEMING.md.
- Do not add glassmorphism, floating translucent cards, excessive glow, generic
  dashboard styling, mobile-style pills, or decorative fake controls.
- Every visible operational control must change state, sound, navigation, or a
  documented preference.
- Make every interactive feature keyboard-operable. Prefer native semantics, use
  ARIA only when needed, preserve visible focus, restore modal focus, and never
  rely on color alone.
- Pause nonessential visual animation when hidden.

## Commands and verification

- When package.json exists, treat its scripts as the executable command source.
- The required command surface is npm install, npm run dev, npm run build, npm
  run start, npm run test, npm run test:e2e, npm run lint, and npm run
  typecheck.
- Do not invent a command or quality threshold that the repository has not
  defined.
- To narrow a run: `npx vitest run tests/unit/state/pulse-store.test.ts` for one
  unit file, `npx vitest run -t "name"` for one test, and
  `npx playwright test tests/e2e/app-shell.spec.ts --project=chrome` for one
  browser spec. `npm run test:e2e` builds and serves before running.
- Every implementation task needs an objective verification method.
- Add and run the smallest relevant unit, component, Playwright, or visual
  regression check for each changed contract.
- Verify the production build in real browser contexts, not only a DOM shim.
- Cover current stable Chrome, Edge, and Firefox. Automate every deterministic
  path and record the required manual audio checks for each browser.
- Verify supported layouts at 1536 x 1024, 1440 x 900, 1366 x 768, and 1280 x
  720, plus the below-minimum notice.
- Use deterministic state, meters, animation, and audio fixtures for visual or
  rendered-audio assertions.
- For performance claims, record the browser, sample rate, exposed buffer
  setting, active modules and effects, workload, method, result, observed
  glitches, and known hotspots. Do not invent a fixed CPU release threshold.

## Documentation and changes

- Preserve unrelated dirty-worktree changes.
- Re-read a file immediately before editing when another worker or commit may
  have changed it.
- Batch independent inspections. Keep dependent investigation and conflicting
  mutations sequential.
- Do not add temporary compatibility scaffolding unless it serves a real
  deployment, review, rollback, migration, or risk-control need.
- Keep comments focused on non-obvious contracts and browser or audio hazards.
- Update the owning product specification in the same change as every accepted
  product change or bug fix.
- Keep docs/ARCHITECTURE.md, docs/THEMING.md, docs/PROJECT-FORMAT.md, README.md,
  and domain documentation current when their owning contracts change. Do not
  claim that planned implementation exists.

## Close-out

- Inspect the current workspace state and recent history before summarizing.
- Run a self-critique and fix every acceptance-blocking gap before declaring the
  requested work complete.
- Re-run affected checks after each fix.
- For large, high-risk, or difficult changes, request an independent review from
  a clean context. Ask: "Evaluate this work. What may have been missed?"
- In the final handoff, record:
  1. least-confident changes and a concrete verification procedure for each;
  2. skipped, incomplete, or deferred work;
  3. previously unstated assumptions;
  4. the largest remaining blind spot;
  5. independent review findings when one was required.
- Record verified non-blocking limitations, future work, and known issues in
  their owning specification or issue.

## Verification output is not repository content

- The repository records what is required and its implementation status. It does
  not record how a past run went.
- Write verification runs, evidence, check results, audit narratives, and
  handoffs to an ignored temporary path. Never add them to the repository tree.
- Do not create a `docs/verification/` folder, a phase or session report, or any
  dated evidence file.
- Report run results in the reply to the user. Anyone who needs current results
  re-runs the command.
- When a run reveals a durable requirement or a real limitation, put that fact in
  its owning specification and discard the run narrative.
- Do not write repository prose describing what a previous agent found, repaired,
  removed, or superseded. Change the affected file and let the diff carry it.
