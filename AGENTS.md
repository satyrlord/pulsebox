# AGENTS.md

Imperative rules for AI coding agents working on Pulsebox.

Use simple English. Prefer short sentences and a plain structure. Do not use
emoji in code, comments, tests, specifications, documentation, or skills.

## Source of truth

- Read [the unified product specification](docs/pulsebox-unified-spec-v1.0.md)
  in full before planning or changing product code.
- Treat that file as the approved MVP contract and acceptance source.
- The specification calls the future living document SPEC.md. The repository
  has not made that rename yet. Do not create a second product specification.
- A direct product-owner decision overrides the specification. Update the
  owning specification, implementation, tests, and user documentation together.
- Do not silently remove a requirement to resolve a contradiction. Report the
  conflict and obtain a product decision when the current repository cannot
  resolve it.
- Files under design/ are prototypes and visual evidence. They are not
  normative unless the specification or user explicitly makes them so.

## Current repository state

- The repository is at the specification and prototype stage.
- There is no product source tree, package manifest, or test configuration yet.
- Do not claim that build, lint, typecheck, test, or browser checks pass until
  their scripts exist and have been run.
- Phase 0 must establish contracts, architecture, project schema, theme tokens,
  legal boundaries, and review evidence before feature implementation.

## Roles and workflow

- Keep planning, implementation, integration, and critical review distinct.
- The root coordinator owns the plan, shared-worktree integration, conflicts,
  and final review.
- Use exploration workers for independent, read-heavy work. Use execution
  workers for narrow work with an objective verifier.
- Give delegated work a bounded scope, expected output, and verification
  method. Avoid overlapping edits.
- Use higher reasoning for architecture, audio, persistence, security,
  concurrency, and ambiguous product contracts.
- Before material work, inspect all applicable current documentation and code.
- Verify unstable browser and Web Audio behavior with current primary sources.
  Do not rely on memory for material API facts.
- Separate verified facts, evidence-supported inferences, assumptions, and
  unresolved questions.

## Product boundary

- Build a fully client-side, desktop-first browser application that runs on
  localhost.
- Do not add a server, accounts, cloud sync, collaboration, a native wrapper,
  a PWA, a service worker, or an install flow.
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
- native DOM APIs, Custom Elements, and Web Components;
- Shadow DOM for reusable controls and isolated leaf components;
- CSS Grid, Flexbox, custom properties, and original inline SVG;
- Canvas only where high-frequency rendering benefits from it;
- Web Audio and AudioWorklet;
- IndexedDB for projects and project assets;
- local storage only for lightweight global UI preferences;
- Vite or an equivalent lightweight TypeScript build tool;
- Vitest and Playwright.

Do not use:

- React, Vue, Angular, Svelte, Solid, Preact, Lit, JSX, or a virtual DOM;
- UI or CSS frameworks;
- third-party sequencer, mixer, piano-roll, knob, or fader components;
- raster control artwork;
- ScriptProcessorNode or main-thread custom DSP;
- MIDI APIs, MIDI files, MIDI learn, or MIDI placeholders.

Inspect the dependency tree before close-out. Remove unused and prohibited
framework dependencies.

## Architecture

- Keep engine, state, and UI as strict layers.
- The engine owns the audio graph, plugins, transport, scheduling, meters,
  sample decoding, offline rendering, export, and worklet messaging. It has no
  DOM dependency.
- The state layer owns plain project data, commands, undo and redo,
  serialization, migrations, validation, selectors, editor state, automation,
  and persistence state. It has no DOM and stores no live AudioNode objects.
- The UI owns Web Components, layout, input, accessibility, themes, and visual
  patching. It dispatches typed commands and never edits the audio graph.
- Define the base plugin manifest, instrument and effect contracts, parameter
  descriptors, command model, message protocol, project schema, and theme
  tokens before implementing instruments or effects.
- Add an instrument or effect through its plugin folder and registry entry.
  Do not spread product-specific branches through shared engine, state,
  persistence, mixer, automation, or UI code.
- Use stable typed IDs and parameter IDs. Do not use array positions as durable
  references.

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
- Use immediate destructive actions with full undo, a non-blocking Undo
  notice, and an ARIA live announcement. Do not add confirmation dialogs.
- Store projects and assets in IndexedDB. Store only lightweight global UI
  preferences in local storage.
- Keep project documents versioned, validated, and migration-aware.
- Treat imported project data as untrusted. Reject executable content,
  unsafe paths, invalid structures, unknown required plugins, and projects
  exceeding eight rack slots as specified.
- Keep live audio objects, meter frames, hover, focus, playheads, and temporary
  previews out of serialized state.
- Preserve project migration paths that remain part of the current format
  contract. Do not confuse required migrations with dead legacy code.

## UI and accessibility

- Prefix custom elements with pulse-.
- Render component structure once and patch changed state. Avoid rebuilding
  large subtrees during high-frequency updates.
- Never insert project data through unsanitized innerHTML.
- Clean up event listeners, observers, worklet ports, timers, and animation
  frames when components disconnect.
- Follow the fixed rack, studio, mixer, effects, editor, and bottom-bar
  hierarchy in the specification.
- Use the approved tactile studio visual language and the five themes: rack,
  mono, cosmic, analog, and rust. The rack theme is the default.
- Do not add glassmorphism, floating translucent cards, excessive glow,
  generic dashboard styling, mobile-style pills, or decorative fake controls.
- Every visible operational control must change state, sound, navigation, or a
  documented preference.
- Make every interactive feature keyboard-operable. Prefer native semantics,
  use ARIA only when needed, preserve visible focus, restore modal focus, and
  never rely on color alone.
- Pause nonessential visual animation when hidden.

## Commands and verification

- When package.json exists, treat its scripts as the executable command source.
- The required command surface is npm install, npm run dev, npm run build,
  npm run test, npm run test:e2e, npm run lint, and npm run typecheck.
- Do not invent a command or quality threshold that the repository has not
  defined.
- Every implementation task needs an objective verification method.
- Add and run the smallest relevant unit, component, Playwright, or visual
  regression check for each changed contract.
- Verify the production build in real browser contexts, not only a DOM shim.
- Cover current stable Chrome, Edge, and Firefox where practical.
- Verify supported layouts at 1536 x 1024, 1440 x 900, 1366 x 768, and
  1280 x 720, plus the below-minimum notice.
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
- Update the unified specification in the same change as every accepted
  product change or bug fix.
- Add the planned ARCHITECTURE.md, THEMING.md, PROJECT-FORMAT.md, README.md,
  HANDOFF.md, and domain documentation when their owning implementation phase
  begins. Do not create placeholder documents that claim unimplemented facts.

## Close-out

- Inspect the current workspace state and recent history before summarizing.
- Run a self-critique and fix every acceptance-blocking gap before declaring
  the requested work complete.
- Re-run affected checks after each fix.
- For large, high-risk, or difficult changes, request an independent review
  from a clean context. Ask: "Evaluate this work. What may have been missed?"
- In the final handoff, record:
  1. least-confident changes and a concrete verification procedure for each;
  2. skipped, incomplete, or deferred work;
  3. previously unstated assumptions;
  4. the largest remaining blind spot;
  5. independent review findings when one was required.
- Record only verified non-blocking limitations, future work, and known issues
  in HANDOFF.md.
