# AGENTS.md

Imperative rules for AI coding agents working on Pulsebox.

## Writing

Use ASD-STE100 Simplified Technical English (STE) for technical prose.
This rule covers documentation, READMEs, pull request text, error messages,
release notes, and comments. It does not cover code, identifiers, command
syntax, marketing copy, essays, or text that needs a distinct voice.

Use strict mode for procedures, runbooks, safety text, and error messages.
Apply all rules in strict mode. Use STE-flavored mode for general technical
prose. Keep the sentence, paragraph, active-voice, and verb rules in that mode.
Use technical words outside the STE dictionary when they improve clarity.

- Use one name for one item.
- Use short common words. For example, use start, use, help, make sure, before,
  after, about, get, show, and also.
- Give each word one meaning. Use a literal meaning when possible.
- Do not use marketing adjectives such as seamless, robust, powerful,
  cutting-edge, effortless, world-class, next-generation, or revolutionary.
- Use American spelling.
- Use active voice when you know the actor.
- Use a verb for an action. Do not replace the verb with a noun phrase.
- Use a plain verb when it can replace a phrasal verb.
- Remove stacked auxiliary verbs and empty framing.
- Use a simple tense when it can replace an `-ing` main verb.
- Put one instruction in each sentence. Limit an instruction to 20 words.
- Limit a descriptive sentence to 25 words.
- Do not use contractions. Use articles such as a, an, the, this, and these.
- Do not use semicolons. Use two sentences.
- Put one topic in each paragraph. Limit a paragraph to six sentences.
- Use a numbered vertical list for steps. Put one imperative action in each
  step.
- Put a condition before its command.
- Do not use emoji in code, comments, tests, specifications, documentation, or
  skills.

Run this self-lint before you finish technical prose:

1. Split each instruction longer than 20 words.
2. Split each descriptive sentence longer than 25 words.
3. Replace each semicolon with a period.
4. Expand each contraction.
5. Change passive voice when you know the actor.
6. Replace an `-ing` main verb, a nominalization, or a phrasal verb when a plain
   verb works.
7. Use one name for each item.

For a prose-only request, return only the requested text. Do not add a
preamble, summary, or closing.

Pulsebox is a fully client-side, desktop-first modular groove workstation for
Chrome. It is built with strict TypeScript, Web Audio, and
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
  normative unless the specification or user explicitly makes them so.

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
  `docs/specs/`. Claim only the narrow later-phase slices listed in README.md.
  Do not describe their incomplete parent phases as implemented.

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
  dead-code-audit, and handoff. If the correct workflow is unclear, read
  `.github/skills/SKILLS.md`.
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
  origin. If that port is unavailable, fail instead of selecting another port.
- A repository-owned static-file launcher is delivery tooling, not a product
  server component. It serves only the built client and exposes no API.
- Do not add a server, accounts, cloud sync, collaboration, a native wrapper,
  or a PWA.
- Do not add a service worker or an install flow.
- Support current stable Chrome. Other browsers are outside MVP support.
- Keep the editable workspace usable from 1280 x 720 CSS pixels upward. Below
  either minimum dimension, use the specified unsupported-size behavior.
- Keep the MVP at eight rack slots, eight visible instrument mixer strips, and
  one master strip. Preserve slot-count-agnostic internals for the post-MVP
  sixteen-slot target without enabling it.

## Naming and originality

- Render PULSEBOX in uppercase only in the centered app mark and browser title.
  Use Pulsebox in normal prose.
- Use the .pulsebox extension for portable projects.
- Keep manufacturer names, historical product names, and model numbers out of
  all shipping files.
- Keep copied layouts, artwork, presets, and extracted samples out of all
  shipping files.
- Named historical research may exist only under non-shipping research/.
- Keep factory sounds, generated buffers, patterns, presets, graphics, icons,
  control ranges, defaults, layouts, and sound targets original.
- Re-run a case-insensitive naming and dependency audit after naming, asset,
  sample, research, or legal-boundary changes.

## Technology

Use:

- strict TypeScript.
- one UI framework or component model for the whole UI layer, applied
  consistently.
- style encapsulation for reusable controls and isolated leaf components.
- CSS Grid, Flexbox, custom properties, and original inline SVG.
- Canvas only where high-frequency rendering benefits from it.
- Web Audio and AudioWorklet.
- IndexedDB for projects and project assets.
- local storage only for lightweight global UI preferences.
- Vite or an equivalent lightweight TypeScript build tool.
- Vitest and Playwright.

Do not use:

- third-party sequencer, mixer, piano-roll, knob, or fader components.
- raster control artwork.
- ScriptProcessorNode or main-thread custom DSP.
- MIDI APIs, MIDI files, MIDI learn, or MIDI placeholders.

Inspect the dependency tree before close-out. Remove unused dependencies.

## Architecture

- Keep engine, state, and UI as strict layers.
- The engine owns the audio graph, plugins, transport, scheduling, meters,
  sample decoding, offline rendering, export, and worklet messaging. It has no
  DOM dependency.
- The state layer owns plain project data, commands, undo, redo, serialization,
  migrations, and validation.
- It also owns selectors, editor state, automation, and persistence state. It
  has no DOM and stores no live AudioNode objects.
- The UI owns components, layout, input, accessibility, themes, and visual
  patching. It dispatches typed commands and never edits the audio graph.
- Before you implement instruments or effects, define the base plugin manifest
  and the instrument and effect contracts.
- Also define parameter descriptors, the command model, the message protocol,
  the project schema, and theme tokens.
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
| `src/composition/`  | composition | Wiring-only content such as the default project                                           |
| `src/engine/`       | engine      | AudioContext, AudioNodes, worklets, transport clock, scheduling, decoding, offline render |
| `src/state/`        | state       | Project data, typed commands, undo and redo, selectors, serialization, persistence ports  |
| `src/persistence/`  | persistence | Browser-storage adapters behind state-owned ports. The only layer that names IndexedDB    |
| `src/ui/`           | UI          | Components, layout, input, focus, accessibility, themes, DOM patching                     |
| `src/contracts/`    | contracts   | Data-only shared types with no singleton, browser handle, or algorithm                    |

Cross-layer imports go through the owning layer's `public.ts`
(`src/engine/public.ts`, `src/state/public.ts`, `src/persistence/public.ts`,
`src/ui/public.ts`). Two guards enforce this:

- `no-restricted-imports` per layer in `eslint.config.mjs`. Its patterns match a
  layer directory at any nesting depth. Adding another `../` cannot bypass the
  boundary.
- The AST policy in `tests/unit/architecture/source-policy.ts` also rejects
  `ScriptProcessorNode` and any identifier or string that matches `midi`.
- It rejects service-worker code and product-specific plugin-ID branches outside
  a plugin folder or the registry.

Read that policy file before adding a source directory or a shared branch.

An instrument or effect folder follows the current module shape under
`src/engine/modules/<plugin-id>/`:

- `manifest.ts` declares the base manifest, parameter descriptors, meters,
  defaults, and the UI manifest including its `moduleAccent` tokens and
  original `icon` path.
- `dsp-core.ts` holds pure, testable DSP.
- `<name>.worklet.ts` is the AudioWorkletProcessor.
- `adapter.ts` loads the worklet module and owns its nodes. It imports the
  worklet through a Vite `?worker&url` import, not a hand-written path.
- `runtime.ts` implements the lifecycle the engine drives.

`PulseStore` in `src/state/pulse-store.ts` is the only mutation path. History is
limited to 100 entries and 64 MiB in total. One entry is limited to 17 MiB.
`PulseStore` evicts the oldest entries instead of rejecting a valid new action.

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
- Apply destructive actions immediately.
- Retain complete Undo data while the bounded active-history entry exists.
- Show a non-blocking Undo notice and an ARIA live announcement.
- Evict older history instead of rejecting a valid new action. Do not add
  confirmation dialogs.
- Store projects and assets in IndexedDB. Store only lightweight global UI
  preferences in local storage.
- Keep project documents versioned, validated, and migration-aware.
- Treat imported project data as untrusted. Reject executable content, unsafe
  paths, and invalid structures.
- Reject unknown or incompatible referenced plugins. Reject projects that
  exceed eight rack slots as specified in docs/PROJECT-FORMAT.md.
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
- This bans fake controls and the listed idioms. It does not ban visual richness.
  Keep raised caps, recessed bays, inset readouts, edges, and pointer response:
  detail that shows affordance, structure, identity, or feedback is doing work.
- Every visible operational control must change state, sound, navigation, or a
  documented preference.
- An empty rack slot or channel may show the loaded silhouette with the real
  controls in their disabled state. Give each one `disabled`, an accessible name
  that reports the empty state, and no operable target. This is not a fake
  control: it is the same control before its module exists. Do not use it to
  show a control the product does not have.
- Make every interactive feature keyboard-operable. Prefer native semantics, use
  ARIA only when needed, preserve visible focus, restore modal focus, and never
  rely on color alone.
- Pause nonessential visual animation when hidden.

## Commands and verification

- When package.json exists, treat its scripts as the executable command source.
- The required command surface includes npm install, npm run dev, npm run
  build, and npm run start.
- It also includes npm run test, npm run test:e2e, npm run lint, and npm run
  typecheck.
- Do not invent a command or quality threshold that the repository has not
  defined.
- To run one unit file, use
  `npx vitest run tests/unit/state/pulse-store.test.ts`.
- To run one test, use `npx vitest run -t "name"`.
- To run one browser specification, use
  `npx playwright test tests/e2e/app-shell.spec.ts --project=chrome`.
- `npm run test:e2e` builds and serves the application before the test run.
- Every implementation task needs an objective verification method.
- Add and run the smallest relevant unit, component, Playwright, or visual
  regression check for each changed contract.
- Verify the production build in real browser contexts, not only a DOM shim.
- Cover current stable Chrome. Automate every deterministic path and record the
  required manual audio checks.
- Verify supported layouts at 1536 x 1024, 1440 x 900, and 1366 x 768.
- Also verify 1280 x 720 and the below-minimum notice.
- Use deterministic state, meters, animation, and audio fixtures for visual or
  rendered-audio assertions.
- For performance claims, record the browser, sample rate, exposed buffer
  setting, and active modules and effects.
- Also record the workload, method, result, observed glitches, and known
  hotspots. Do not invent a fixed CPU release threshold.

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
- When their owning contracts change, keep docs/ARCHITECTURE.md,
  docs/THEMING.md, and docs/PROJECT-FORMAT.md current.
- Also keep README.md and domain documentation current. Do not claim that a
  planned implementation exists.

## Close-out

- Inspect the current workspace state and recent history before summarizing.
- Run a self-critique and fix every acceptance-blocking gap before declaring the
  requested work complete.
- Re-run affected checks after each fix.
- For large, high-risk, or difficult changes, request an independent review from
  a clean context. Ask: "Evaluate this work. What may have been missed?"
- In the final handoff, record:
  1. least-confident changes and a concrete verification procedure for each.
  2. skipped, incomplete, or deferred work.
  3. previously unstated assumptions.
  4. the largest remaining blind spot.
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
- When a run reveals a durable requirement or a real limitation, put that fact
  in its owning specification.
- Discard the run narrative.
- Do not write repository prose describing what a previous agent found, repaired,
  removed, or superseded. Change the affected file and let the diff carry it.
