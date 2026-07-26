# Pulsebox Unified Product Specification

**Status:** Approved authoritative product specification  
**Version:** 1.0  
**Approval date:** 2026-07-26  
**Purpose:** Define the single authoritative Pulsebox product contract by
preserving the functional union of both source specifications and incorporating
every product-owner decision recorded on 2026-07-26.

> This document is final for the approved MVP scope. It contains no unresolved
> product decisions. Later accepted changes must update this file in the same
> change.

---

## 0. Overview

Governance:

1. This document is the single living `SPEC.md`.
2. Direct product-owner decisions override this document and must be
   incorporated into it immediately.
3. Older source documents remain historical references only.
4. A change request or bug fix must update `SPEC.md` in the same change.
5. No agent may silently resolve a future contradiction by dropping
   functionality.

### 0.1 Implementation workflow

Before product code:

- Read the full approved specification.
- Write a build plan.
- Check the plan against every acceptance criterion.
- Write the base plugin contracts, state model, command model, message protocol,
  project schema, and theme token set.
- Begin with parallel research and independent architecture reviews where the
  available agent environment supports them.
- Do not guess about browser API behavior or unstable technical details. Verify
  them from primary documentation.
- Keep code, comments, tests, and documentation in simple English.
- Do not use emoji in code, comments, specifications, tests, or documentation.
- Ask an independent reviewer to evaluate the plugin contracts and architecture
  before Phase 1.
- Keep `SPEC.md` current after every accepted change and bug fix.
- Re-run the relevant repository audit after naming, asset, sample, or
  legal-boundary changes.
- Keep named historical research only in the non-shipping `/research` directory.
  Production code, assets, tests, public documentation, package metadata, and
  shipped project data must pass the naming audit.

---

## 1. Product goal

Build **Pulsebox**, a production-quality, desktop-first modular groove
workstation for the browser.

Pulsebox is:

- Fully client-side.
- Runnable at the canonical local origin `http://127.0.0.1:4173`.
- A serious music-production application, not a static mockup.
- Built around a dense rack, an eight-channel studio mixer, a four-bus effects
  area, pattern editing, piano-roll editing, and song arrangement.
- Designed for fast results. A new user should be able to start the supplied
  loop within one minute.
- Designed so playback continues while modules, effects, patterns, themes, and
  project data change.
- Original in artwork, naming, control layout, code, sample content, and sound
  design.
- Limited to eight instrument slots in the MVP, with plugin contracts that do
  not hard-code any one instrument type.

Pulsebox is not:

- A marketing page.
- A collection of generic dashboard cards.
- A visual clone of any historical product.
- A MIDI application.
- A server-backed application.
- A sample-pack wrapper with decorative controls.

---

## 2. Naming and intellectual-property boundary

### 2.1 Product naming

Render `PULSEBOX` in uppercase only in:

- The centered application mark in the transport bar.
- The browser title.

Write `Pulsebox` in sentence case everywhere else, including:

- Documentation.
- Help text.
- Accessibility descriptions.
- Tooltips.
- Onboarding.
- Error messages.
- Project metadata.

Project files use the `.pulsebox` extension.

### 2.2 Instrument names

| Full name    | Code ID             | Type                                 | Short label |
| ------------ | ------------------- | ------------------------------------ | ----------- |
| Acid Bass    | `bass-mono`         | Monophonic analog-style bass synth   | `BASS`      |
| Drumline Six | `drum-analog-small` | Small analog-style drum machine      | `SIX`       |
| Boom Eight   | `drum-analog-large` | Large analog-style drum machine      | `BOOM`      |
| Hybrid Nine  | `drum-hybrid`       | Analog and sample hybrid machine     | `NINE`      |
| Digit Seven  | `drum-digital-a`    | Digital drum machine                 | `SEV`       |
| Digit Five   | `drum-digital-b`    | Digital drum machine with percussion | `FIVE`      |

Rules:

- Short labels are always uppercase.
- Short labels are no longer than four characters.
- Use short labels on faceplates, compact rack cards, rack-overview markers,
  mixer strips, and dense selectors.
- Use full names in the library, help text, accessible names, detailed editors,
  and documentation.
- Do not invent additional visible names for the six instruments.
- Internal stable IDs are not visible product names.

### 2.3 Originality rules

Production code, shipped assets, tests, public documentation, package metadata,
file names, factory project data, and user-facing strings must not contain:

- Real-world manufacturer names.
- Historical product titles or model numbers.
- Copied panel layouts.
- Copied color schemes.
- Copied type treatments.
- Copied icons.
- Copied presets.
- Extracted ROM or hardware samples.
- Community theme artwork.
- Traced or recolored reference art.

Named historical sources may appear only in the non-shipping `/research`
directory. That directory is excluded from production packages and public
product documentation. Research may be used to understand broad synthesis
families, but factory voice lists, control ranges, curves, defaults, sound
targets, panel arrangements, and shipped content must remain original.

The interface may use generic rack cues such as handles, screws, inset bays,
compact pedal enclosures, and dark powder-coated surfaces, but every arrangement
and drawing must be original.

All factory sounds, generated buffers, patterns, presets, graphics, and icons
must be newly created for Pulsebox.

---

## 3. Product principles

1. **Editing is not step-toggle-only.** Every sequencer supports painting,
   direct manipulation, computer-keyboard performance, and generation or
   transformation.
2. **The system is modular.** Instruments and effects use plugin contracts. Rack
   slots, insert chains, send chains, and the master chain are data-driven.
3. **Playback remains continuous.** Editing, saving, loading compatible data,
   switching themes, opening editors, and reordering modules must not produce a
   dropout or click.
4. **Undo is the safety system.** User edits go through a command layer.
   Continuous gestures coalesce into one history entry.
5. **Core controls remain visible.** Compact panels expose the controls needed
   for fast sound design. Expanded editors expose deeper parameters without
   replacing the underlying state.
6. **Visual feedback follows sound.** Audible parameter changes receive a useful
   visual response such as a meter, curve, envelope, playhead, waveform, or
   numerical value.
7. **No dead controls.** Every visible operational control must alter state,
   audio, navigation, or a documented preference.
8. **Mouse and computer keyboard are first-class.** No workflow depends on MIDI.
9. **Errors are actionable.** An error states what happened and how to recover.
10. **Accessibility is part of the component contract.** It is not a late
    retrofit.

Deep effect editors use the already established 760 × 680 editor format.
Playback continues underneath. The editor restores focus when closed.

Pulsebox uses no destructive confirmation dialogs. Destructive edits happen
immediately, preserve full undo data, and produce a non-blocking Undo
notification and ARIA live announcement.

---

## 4. Technology and repository rules

Use:

- TypeScript with strict mode.
- Native DOM APIs.
- Native Custom Elements and Web Components.
- Shadow DOM for reusable controls and isolated leaf components.
- CSS Grid and Flexbox.
- CSS custom properties.
- Inline SVG.
- Canvas where high-frequency rendering benefits from it.
- Web Audio API.
- AudioWorklet for custom synthesis and DSP.
- IndexedDB for projects and project assets.
- Local storage only for lightweight UI preferences.
- Vite or an equivalent lightweight TypeScript build tool.
- A repository-owned static-file launcher for the production build. The launcher
  serves only local static files, exposes no application API, and fails rather
  than changing the canonical port.
- Vitest.
- Playwright.

Do not use:

- React.
- Vue.
- Angular.
- Svelte.
- Solid.
- Preact.
- Lit.
- JSX.
- A virtual DOM.
- A UI component framework.
- A CSS framework.
- Third-party sequencer, mixer, piano-roll, knob, or fader components.
- Raster control artwork.
- `ScriptProcessorNode`.
- Main-thread DSP.
- MIDI APIs, MIDI file code, MIDI learn, or MIDI placeholders.

Inspect the final dependency tree. No unused framework dependency may remain.

---

## 5. Layered architecture

Pulsebox has three strict layers.

`ARCHITECTURE.md` owns the normative interfaces, dependency directions, message
envelopes, command shapes, lifecycle rules, and verification seams for these
layers. This section owns the product-level boundary.

### 5.1 Engine

Responsibilities:

- Audio graph ownership.
- Instrument instances.
- Effect instances.
- Transport and scheduling.
- Voice allocation and stealing.
- Parameter smoothing.
- Meter extraction.
- Offline rendering.
- Audio export.
- Sample decoding and prepared audio buffers.
- Worklet messaging.

The engine has no DOM dependency.

### 5.2 State

Responsibilities:

- Project model.
- Commands.
- Undo and redo.
- Serialization.
- Migrations.
- Import validation.
- Autosave state.
- Stable IDs.
- Selectors.
- Editor state.
- Automation data.
- Clipboard data.

The state layer has no DOM and no live AudioNode objects.

### 5.3 UI

Responsibilities:

- Web Components.
- Layout.
- Input handling.
- Accessibility.
- Direct visual patching.
- Theme tokens.
- Canvas rendering.
- Menus, dialogs, popovers, and tooltips.
- Dispatching typed commands.
- Reading selected state.

The UI never constructs, connects, disconnects, or edits the audio graph
directly. It sends commands to the engine controller. The engine returns
acknowledgements, transport position, state, warnings, and meter frames.

Custom synthesis and custom DSP run in AudioWorklet processors. Suitable native
Web Audio nodes may be used behind engine-owned plugin adapters. The UI never
touches either worklets or native graph nodes directly.

AudioWorklet processors process the frame count supplied by the audio host. No
plugin may assume or hard-code a 128-frame render quantum. An algorithm that
requires an internal fixed block may use bounded buffering inside its
engine-owned adapter. The adapter must document its latency and must not
allocate unbounded memory.

---

## 6. Plugin contracts

Write the plugin contracts before implementing instruments or effects.

`ARCHITECTURE.md` owns the complete TypeScript contract shapes and protocol
rules. `PROJECT-FORMAT.md` owns their serialized identities, versions, and
migrations.

Use a shared base manifest and typed specializations rather than forcing
instruments and effects into one untyped interface.

### 6.1 Base plugin manifest

Every plugin defines:

- Stable plugin ID.
- Plugin kind.
- Product name.
- Short label where relevant.
- Version.
- Parameter descriptors.
- Default state.
- State schema version.
- Serialization and restore functions.
- UI manifest.
- Meter outputs.
- Automation capability.
- CPU-cost classification.
- Compatibility and migration hooks.

### 6.2 Parameter descriptor

Every persistent instrument, voice, mixer, send, effect, master, tempo, and
timing parameter is automatable. Structural commands, transient monitor state,
meter values, and UI preferences are not parameters and are not automation
targets.

Every automatable parameter has:

- Stable string ID.
- Full accessible name.
- Short label where needed.
- Data type.
- Minimum.
- Maximum.
- Default.
- Step or precision.
- Display unit.
- Display formatter.
- Smoothing mode.
- Smoothing duration.
- Automation rate.
- Modulation policy.
- Reset value.

Project files and automation lanes reference stable parameter IDs, not array
positions.

### 6.3 Instrument plugin

An instrument plugin adds:

- Voice or lane descriptors.
- Pattern compatibility.
- Note or trigger event compatibility.
- Voice-stealing policy.
- Audio renderer or processor factory.
- Per-voice output descriptors.
- Sample-layer capability where applicable.
- Compact faceplate manifest.
- Detailed editor manifest.

### 6.4 Effect plugin

An effect plugin adds:

- Audio input and output descriptors.
- Channel configuration.
- Latency.
- Tail behavior.
- Bypass behavior.
- Wet and dry behavior.
- Processor factory.
- Compact pedal manifest.
- Detailed editor manifest.
- Safety clamps.
- Offline-render support.

### 6.5 Plugin loading

Adding a new instrument or effect should mean adding one plugin folder and
registering its manifest. Existing engine, rack, mixer, persistence, automation,
and UI code must not require product-specific branching beyond the registry.

---

## 7. Central state and command model

Implement a typed `PulseStore`, or an equivalently named central store.

Required API:

- `getState()`
- `dispatch(command)`
- `subscribe(selector, callback)`
- `undo()`
- `redo()`
- `loadProject()`
- `saveProject()`
- `exportProject()`
- `importProject()`

Use:

- Plain TypeScript objects.
- Discriminated unions.
- Stable typed IDs.
- Selector-based subscriptions.
- Command objects with reversible patches or explicit inverse commands.
- Gesture coalescing.

High-level state:

- `project`
- `transport`
- `rack`
- `patterns`
- `song`
- `mixer`
- `effects`
- `automation`
- `samples`
- `editor`
- `ui`
- `history`
- `persistence`

Do not persist:

- Meter animation frames.
- Hover state.
- Temporary pointer positions.
- Drag previews.
- Live AudioNodes.
- Audio-context power state.
- Playhead animation state.

### 7.1 Typed UI events

Use typed composed events such as:

- `pulse-control-input`
- `pulse-control-commit`
- `pulse-step-change`
- `pulse-note-create`
- `pulse-note-change`
- `pulse-note-delete`
- `pulse-module-add`
- `pulse-module-move`
- `pulse-module-remove`
- `pulse-module-duplicate`
- `pulse-channel-change`
- `pulse-effect-change`
- `pulse-pattern-change`
- `pulse-section-select`
- `pulse-section-reorder`
- `pulse-automation-change`
- `pulse-transport-command`

Transient drag input does not create one history entry per pointer event.
Pointer release commits one command unless the user deliberately creates
multiple edits.

---

## 8. Application composition

Pulsebox fills the viewport. Page-level scrolling is not allowed. Major regions
manage their own overflow.

### 8.1 Main rows

1. Transport bar: approximately 64 to 70 pixels.
2. Main rack and studio workspace: flexible; target at least 430 pixels on
   taller displays and allow a compact minimum near 350 pixels at the supported
   720-pixel height.
3. Lower editor workspace: approximately 260 to 300 pixels on taller displays
   and approximately 210 to 230 pixels at the supported 720-pixel height. Use
   internal tabs and scrolling rather than shrinking controls below their
   minimum sizes.
4. Bottom workspace bar: approximately 40 to 46 pixels.

At 1280 × 720, the complete row stack, inter-region gaps, and borders must fit
without page-level scrolling or overlap. The rack and editor manage their own
overflow.

### 8.2 Wide desktop composition

At 1536 × 1024:

- A full-width transport spans the top.
- A module library sits on the far left.
- A narrow rack overview sits beside the library.
- A large central rack shows six compact modules.
- The studio region contains the mixer on its left and the four-slot effects
  bank on its right.
- The effects bank never overlaps the mixer.
- The mixer receives slightly more vertical space than surrounding studio
  panels.
- The lower editor shows the pattern inspector, piano roll or drum grid, timing
  controls, and compact playlist or section navigator.
- The bottom workspace bar remains visible.

The rack remains the central sound-design surface. The mixer is the central
mixing feature and receives stronger visual weight than a minor sidebar.

### 8.3 Workspace modes

Provide:

- Rack.
- Edit.
- Song.

Rack mode emphasizes the module library, overview, rack faceplates, mixer, and
effects.

Edit mode emphasizes the active module editor, piano roll or drum grid, timing
lanes, and automation.

Song mode provides the full arrangement timeline, scenes, section markers, and
automation lanes.

Switching modes never stops playback.

### 8.4 Mixer geometry already carried forward

The studio mixer uses:

- Eight permanently visible instrument channel strips. Empty rack slots retain
  disabled strips labeled `Empty`.
- One master strip.
- Four send controls per visible channel.
- A vertical fader.
- A loudness meter.
- Pan, mute, and solo.
- A slightly taller section than adjacent panels.

The four-slot FX bank is anchored to the right of the mixer. Each compact FX
slot keeps its Edit control in the existing unused space and uses a circular Mix
control. The compact slot height remains approximately 110 pixels.

The MVP has eight rack slots, eight corresponding instrument channel strips, and
one master strip. No mixer banking, horizontal scrolling, or channels 9–16 exist
in the MVP.

### 8.5 Studio tabs

The studio region provides:

- Mixer.
- Effects.
- Master.

On wide screens:

- Mixer is selected by default.
- The mixer presents all eight instrument strips, including disabled `Empty`
  strips, with the compact FX bank to its right.
- Effects opens detailed send-chain and effect editing without changing the
  compact bank geometry.
- Master opens master routing, master-chain, and output metering.
- The active tab is a UI preference, not core project data.

On narrower screens, these tabs select the entire studio view.

### 8.6 Bottom workspace bar

Left:

- Workspace mode.
- Performance mode.

Center:

- Sequencer.
- Piano roll.

Right:

- Undo.
- Redo.
- Save.

Behavior:

- Active modes use a thin accent underline and stronger text.
- Undo and redo disable correctly.
- Save exposes clean, dirty, saving, saved, and error states.
- All actions have keyboard shortcuts and accessible names.
- No button is decorative.
- Workspace returns to the most recently used Rack, Edit, or Song view.
  Performance opens the live scene-and-pattern trigger surface. Sequencer and
  Piano roll switch the active editor inside Workspace only.

### 8.7 Responsive behavior

- The minimum supported viewport is 1280 × 720 CSS pixels.
- At 1440 pixels and above, show the complete primary composition.
- From 1280 to 1439 pixels, reduce nonessential padding, allow the library to
  collapse, and tab less essential studio details while keeping the rack and
  transport fully usable.
- Below either minimum dimension, replace the editable workspace with a clear
  unsupported-size notice. Autosave continues, and Save, portable Export, and a
  read-only project summary remain accessible.
- Layouts below the minimum are outside MVP editing acceptance scope. The
  application must not claim mobile or compact-desktop support.
- At supported sizes, never overlap the rack, mixer, effects, editor, or
  playlist.
- Never hide transport controls behind horizontal scrolling.
- Menus and popovers must remain within the viewport.

---

## 9. Default projects and initial state

### 9.1 Default project

Project name: `Neon Basement`

Transport and timing:

- Tempo: 128.0 BPM.
- Time signature: 4/4.
- Pattern length: 16 steps.
- Grid: 1/16.
- Swing: 54%.
- Humanize: 12%.
- Quantize strength: 100%.
- Transport: stopped.
- Master level: approximately -6 dB.
- New-installation UI theme: `rack`, stored as a global preference rather than
  project state.

Rack order:

1. Acid Bass.
2. Drumline Six.
3. Boom Eight.
4. Hybrid Nine.
5. Digit Seven.
6. Digit Five.
7. Empty.
8. Empty.

The MVP rack contains exactly eight slots.

Default playlist sections:

1. Intro, 8 bars.
2. Verse, 16 bars.
3. Break, 8 bars.
4. Drop, 16 bars.
5. Outro, 8 bars.

Select Verse by default.

Default send effects:

- A: Analog echo.
- B: Plate reverb.
- C: Stereo width.
- D: Drive.

Default master chain:

1. Compressor.
2. Parametric EQ.
3. Limiter.

The limiter occupies the protected final slot and starts enabled.

Create an original coherent demo loop. Do not use copied patterns, presets,
samples, or note data.

### 9.2 Secondary starter template

Retain the alternative three-slot starter as a built-in template rather than the
default:

1. Acid Bass.
2. Acid Bass.
3. Boom Eight.
4. Remaining slots empty.
5. Tempo: 130 BPM.

It must contain two independent basslines and an original drum pattern.

---

## 10. Web Component structure

Use the `pulse-` prefix without exceptions.

Recommended hierarchy:

- `pulse-app`
  - `pulse-transport-bar`
  - `pulse-main-workspace`
    - `pulse-module-library`
    - `pulse-rack-overview`
    - `pulse-rack`
      - `pulse-rack-module`
      - `pulse-pattern-strip`
    - `pulse-studio-panel`
      - `pulse-mixer`
        - `pulse-channel-strip`
        - `pulse-master-strip`
      - `pulse-effects-bank`
        - `pulse-effect-slot`
  - `pulse-editor-workspace`
    - `pulse-pattern-inspector`
    - `pulse-piano-roll`
    - `pulse-drum-grid`
    - `pulse-timing-panel`
    - `pulse-playlist-summary`
    - `pulse-automation-editor`
  - `pulse-song-workspace`
    - `pulse-song-timeline`
    - `pulse-scene-list`
    - `pulse-automation-lanes`
  - `pulse-workspace-bar`
  - shared controls:
    - `pulse-knob`
    - `pulse-fader`
    - `pulse-meter`
    - `pulse-led-button`
    - `pulse-toggle`
    - `pulse-segment-display`
    - `pulse-tooltip`
    - `pulse-context-menu`
    - `pulse-value-popover`
    - `pulse-dialog`
    - `pulse-curve-editor`

Do not create a custom element for every static wrapper.

Rules:

- Custom elements extend `HTMLElement`.
- Reusable controls and isolated leaves use Shadow DOM.
- The application shell may use light DOM.
- Use templates, fragments, native elements, and `textContent`.
- Never insert project data through unsanitized `innerHTML`.
- Cache element references.
- Clean up listeners, observers, timers, worklet ports, and animation frames.
- Use `AbortController` for listener groups.
- Render once, then patch changed DOM.
- Do not rebuild the application tree after each state update.
- Do not query the whole document from leaf components.

---

## 11. Visual language and themes

### 11.1 Default visual direction

Create a dark, tactile, high-density studio interface using:

- Matte black and graphite enclosures.
- Slightly raised control surfaces.
- Recessed sequencer wells.
- Compact pedal-like effects.
- Restrained status lighting.
- Technical labels.
- Borders, highlights, and modest shadows for depth.
- Modern software precision.

Avoid:

- Excessive glow.
- Glassmorphism.
- Floating translucent cards.
- Consumer-app softness.
- Cartoon controls.
- Photorealistic textures.
- Fake wood.
- Large mobile-style pills.
- Decorative waveform graphics.
- Excessive gradients.
- Generic dashboard styling.

### 11.2 Instrument accents

- `BASS`: acid green.
- `SIX`: amber orange.
- `BOOM`: warm red.
- `NINE`: violet.
- `SEV`: electric blue.
- `FIVE`: turquoise.

Accents identify modules. They do not become full panel colors.

Use each accent for:

- Name.
- Thin trim.
- Selected-step LEDs.
- Small control-ring detail.
- Mixer header.
- Overview marker.

Never rely on color alone.

### 11.3 Typography and icons

- System UI sans-serif for normal text.
- System monospace for time, tempo, ticks, values, and grid coordinates.
- No loaded legacy-style font.
- Normal labels use sentence case.
- Short technical labels may use uppercase.
- Avoid text smaller than about 10 CSS pixels.
- Operational values are at least 12 CSS pixels.
- Draw original inline SVG icons with `currentColor`.
- No emoji UI icons.
- No icon font.
- Every icon-only control has an accessible label and tooltip.

### 11.4 Built-in themes

Ship five original token-based themes:

| Theme ID | Visible label | Direction                                             |
| -------- | ------------- | ----------------------------------------------------- |
| `rack`   | Rack          | Studio hardware, graphite and steel, default          |
| `mono`   | Mono          | Near-black, minimal, high contrast                    |
| `cosmic` | Cosmic        | Deep blue, restrained luminous detail                 |
| `analog` | Analog        | Warm silver and tactile metal                         |
| `rust`   | Rust          | Industrial, angular, weathered without copied artwork |

Also provide a high-contrast mode that can be layered over a theme.

Rules:

- Themes are CSS custom-property sets.
- No theme-specific TypeScript.
- No theme-specific markup.
- Switching themes does not rebuild the audio graph or interrupt playback.
- Every module and effect must work in every theme.
- Focus rings and meters remain readable.
- Theme switching causes no layout shift.
- Document the token contract in `THEMING.md`.
- Themes change appearance only. Sample packs and user samples change sound
  independently.

User themes import through the bounded, allowlisted JSON token schema in
`THEMING.md` only. Raw CSS and values capable of loading resources or injecting
additional declarations are rejected. Unknown tokens are ignored with a report.
Any invalid required token rejects the complete theme without changing the
active theme.

Theme and high-contrast settings are global UI preferences stored in local
storage. Projects never change the user's appearance settings and do not
serialize a theme override. New installations start with the `rack` theme.

### 11.5 CSS implementation

Use custom properties for:

- Surfaces.
- Text.
- Accents.
- Meter colors.
- Control tracks and fills.
- Borders.
- Shadows.
- Focus rings.
- Spacing.
- Radii.
- Type scale.
- Control sizes.
- Animation durations.

Use:

- A spacing scale based on about 4 pixels.
- Small-control radii of about 3 to 4 pixels.
- Panel radii of about 5 to 8 pixels.
- `box-sizing: border-box` throughout.
- Logical properties where practical.
- Subtle visible scrollbars.
- Container queries where they simplify adaptation, with media-query fallbacks.
- Constructable stylesheets where supported, with a small fallback.

Module-scoped variables include:

- `--module-accent`
- `--module-accent-muted`
- `--module-led`
- `--module-control-ring`

Do not hide scrollbars completely. Do not use large pill containers except for
deliberately compact switches.

---

## 12. Transport

The full-width transport contains:

Far left:

- Main menu.
- Project selector.
- Pin project.
- Project actions.

Transport group:

- Play.
- Stop.
- Record.
- Tempo display.
- BPM label.
- Tap tempo.

Center:

- `PULSEBOX`.

Position group:

- Elapsed time.
- Bars, beats, and ticks.
- Tabular monospace numerals.

Master group:

- Audio-engine power.
- Stereo or mono.
- Left and right meters.
- Peak indicator.
- Master dB value.
- Settings.

Behavior:

- Space toggles play or pause unless focus is in a text field or a conflicting
  editor.
- Escape stops playback.
- Space pauses in place. Stop halts playback and returns to the last explicit
  transport start marker, defaulting to pattern step 1 in Pattern mode or Song
  bar 1 in Song mode. Repeated Stop presses have no second behavior.
- The transport start marker updates when the user positions the playhead while
  stopped or starts playback from a manually selected location. Loop wraps,
  quantized pattern launches, scene launches, and automatic playhead movement do
  not move the marker.
- Record arms or disarms.
- Tempo range is approximately 40 to 240 BPM.
- Tempo supports pointer adjustment and direct numeric entry.
- Tap tempo uses a rolling set of recent taps.
- Position updates do not cause layout shifts.
- Meter decay is smooth.
- Buttons expose idle, hover, pressed, active, disabled, and focus states.
- Pattern and Song transport modes switch without stopping.
- Pattern switching is quantized to a configurable boundary, default one bar.
- Count-in and metronome are configurable for live recording.
- Pin project toggles whether the current project appears at the top of the
  project selector. It uses `aria-pressed` and persists as project metadata.

The master Mono control is a monitor-only fold-down placed after the master
chain. It affects live listening and the displayed master meters. It does not
alter project audio state and is excluded from master WAV and stem export.

---

## 13. Module library and rack overview

### 13.1 Library

Tabs:

- Rack.
- Library.

Library content:

- Category or filter control.
- Six instrument definitions.
- Original DOM or SVG thumbnail.
- Short label.
- Full name.
- Type description.
- Drag affordance.
- Useful empty state.

Interactions:

- Click to inspect.
- Double-click to add to the first empty slot.
- Drag into a specific slot.
- Keyboard Add command.
- No screenshot thumbnails.

### 13.2 Rack overview

Requirements:

- Slots 01 through 08.
- Internal scrolling as required.
- Miniature loaded cards.
- Empty labels and add controls.
- Selected border and accent marker.
- Two-digit slot number.
- Add, Remove, Duplicate, and Swap actions.
- Disabled states are visible and semantic.
- Overview-only mode shows all slots as compact strips.

Interactions:

- Select a slot and scroll its full module into view.
- Reorder by custom pointer drag.
- Use pointer capture.
- Show insertion marker.
- Support keyboard reorder.
- Announce results through an ARIA live region.
- Preserve module IDs, patterns, automation, mixer routing, and effect chains
  when reordered.

---

## 14. Rack behavior

The MVP rack holds eight slots. Any slot can hold any instrument. Duplicates are
allowed.

The engine, state, plugin, and UI contracts remain slot-count agnostic. Sixteen
rack slots are an explicit post-MVP target, but the approved MVP and its
acceptance criteria remain capped at eight.

Each slot supports:

- Enable or bypass.
- Mute.
- Solo.
- Pattern selector.
- Output routing.
- Swap.
- Collapse.
- Expand.
- Duplicate.
- Remove.
- Reorder.
- Module menu.
- Selection.
- Visible level.
- Pattern activity.

Rack-module collapse is a lightweight local UI preference keyed by project ID
and stable module ID. It is not project data, is not included in portable files,
and does not create an undo entry. Removing a module removes its local collapse
preference; Undo restores the module expanded.

Collapsed slots remain usable and show:

- Short label.
- Level.
- Mute.
- Solo.
- Pattern selector.
- Activity.
- Expand control.

Empty slots show an Add control.

Removing a module:

- Happens immediately with no confirmation dialog and exposes Undo.
- Releases its audio resources safely.
- Clears its matching mixer channel and leaves the corresponding disabled
  visible strip labeled `Empty`; it never creates a mixer bank.
- Preserves full recovery data in undo history.
- Undo restores the module, patterns, mixer state, automation, sample
  references, and effect chains.

Swapping a module:

- Replaces the plugin.
- Preserves sequence data where event mapping is valid.
- Reports unmapped data before or after the operation through a non-blocking
  result panel.
- Is undoable.
- Does not interrupt unrelated audio.

Each full module is approximately 86 to 98 pixels high at the target viewport
unless expanded.

---

## 15. Instrument modules

Each instrument has:

- Compact rack faceplate.
- Expanded editor.
- Stable parameter IDs.
- Pattern selector.
- Step or note activity.
- Per-module output level.
- Mute and solo.
- Insert-chain access.
- Metering.
- Original visualization.
- Full keyboard accessibility.
- Automation support.

Compact faceplates expose the established fast-control set defined for each
instrument below. Additional synthesis, sample, voice, insert, and routing
parameters live in the playback-safe expanded editor. Faceplate pages are not
user-configurable in the MVP.

### 15.1 Acid Bass

Compact controls:

- Tune.
- Cutoff.
- Resonance.
- Envelope amount.
- Decay.
- Accent amount.
- Waveform.
- Glide.
- Volume.
- Current note or lane.
- Compact filter response.

Expanded controls:

- Second oscillator.
- Second-oscillator detune.
- Sub oscillator.
- Clean or dirty filter model.
- Detailed envelope.
- Glide mode.
- Accent response.
- Real-time filter response curve moving with the envelope.
- Voice and note monitor.

Sequencing states:

- Note.
- Rest.
- Tie.
- Slide.
- Accent.
- Velocity.
- Probability.
- Micro-timing.

The sound is an original monophonic subtractive design. It must not claim
hardware accuracy.

### 15.2 Shared drum architecture

Every drum voice is an independent internal channel.

Each voice supports:

- Synthesized layer.
- Optional factory or user sample layer.
- Blend.
- Level.
- Tune.
- Decay.
- Pan.
- Mute.
- Solo.
- One voice insert slot.
- Choke-group assignment.
- Musically appropriate original choke defaults for open and closed hat
  relationships.
- Metering.
- Stable voice ID.

Each step supports:

- Trigger.
- Velocity.
- Accent.
- Probability.
- Micro-timing offset.
- Flam.
- Roll.
- Selection.
- Per-voice step resolution.
- Per-voice pattern length.

Factory sample content is original and project-owned. User samples may be
layered without replacing the synthesis engine.

Default layer balance is machine-specific: Drumline Six and Boom Eight are
synth-heavy, Hybrid Nine is blended, and Digit Seven and Digit Five are
sample-heavy with their built-in lo-fi stages enabled. Every voice still
provides both a synthesized layer and an optional sample layer.

### 15.3 Drumline Six

Compact controls:

- Tune.
- Snap.
- Decay.
- Tone.
- Level.
- Drive.
- Voice selector.
- Per-step trigger and velocity.

Expanded editor:

- All shared per-voice controls.
- Voice mixer.
- Choke groups.
- Sample layer.
- Voice inserts.
- Parent module send controls and routing.
- Per-step properties.
- Synthesis-specific voice controls.

### 15.4 Boom Eight

Compact controls:

- Tune.
- Punch.
- Decay.
- Tone.
- Level.
- Compression.
- Voice selector.
- Per-step trigger and velocity.

Expanded editor includes the shared drum capabilities and original large-machine
voice design.

### 15.5 Hybrid Nine

Compact controls:

- Original waveform preview.
- Sound selector.
- Start position.
- Tune.
- Decay.
- Filter.
- Module-send emphasis that scales sends A through D together while preserving
  their relative levels.
- Per-step trigger and velocity.

Expanded editor includes:

- Runtime-generated or project-owned original one-shots.
- Synth layer.
- Sample layer.
- Start offset.
- Pitch.
- Decay.
- Filtering.
- Voice mixer.
- Per-step properties.
- Voice inserts plus parent module send controls and routing.

### 15.6 Digit Seven

Compact controls:

- Tune.
- Decay.
- Compression.
- Bit reduction.
- Sample-rate reduction.
- Level.
- Voice selector.
- Per-step trigger and velocity.

The built-in lo-fi stage starts enabled and can be disabled.

### 15.7 Digit Five

Compact controls:

- Tune.
- Decay.
- Noise amount.
- Filter.
- Pan.
- Level.
- Bit reduction.
- Sample-rate reduction.
- Voice selector.
- Per-step trigger and velocity.

The built-in lo-fi stage starts enabled and can be disabled.

---

## 16. Pattern strips, piano roll, and drum grid

### 16.0 Pattern inspector

Tabs:

- Pattern.
- Song.

Pattern view:

- Pattern number, default `1`.
- Previous and next.
- Length, default 16.
- Shuffle, default 54%.
- Scale, default Chromatic.
- Add.
- Duplicate.
- Rename.
- Delete.
- Pattern color.
- Launch quantization.

Song view provides a compact section, scene, and assignment overview linked to
the full Song workspace.

### 16.1 Compact pattern strip

- Sixteen visible steps by default.
- Active, inactive, current, selected, accented, tied, slid, probabilistic, and
  disabled states.
- Current step is clear but restrained.
- Click toggles.
- Shift-click changes selection.
- Pointer drag paints.
- Vertical drag may change velocity for drum steps.
- An alternate button, keyboard command, or inspector exposes advanced
  properties.
- Advanced editing never depends on right-click alone.
- Step numbers or beat divisions remain readable.

Patterns longer than sixteen steps use sixteen-step pages with a visible page
indicator. Playback follow is enabled by default and advances the displayed page
with the playhead. The user may lock the viewed page while playback continues.

### 16.2 Pattern banks

Each module has at least 32 patterns.

Each pattern has:

- Stable ID.
- Name.
- Color.
- Nominal length.
- Seed.
- Event data.
- Automation references.
- Created and modified metadata.

Capabilities:

- Copy.
- Paste.
- Duplicate.
- Rename.
- Delete.
- Generate variation.
- Drag to another compatible module.
- Quantized switching.
- Scene assignment.

A module pattern has a nominal 1–64-step span. Each drum voice may override its
own length and resolution and wraps independently inside that pattern.

Pattern positions use flat visible numbers `1` through `32`. Pattern names and
colors remain independent metadata.

### 16.3 Piano roll

For pitched instruments:

- Toolbar.
- Module or lane selector.
- Pointer, Draw, and Erase tools.
- Four-bar timeline header by default.
- Grid resolution, default 1/16.
- Timing mode, default Straight.
- Lower-lane selector, default Velocity.
- Snap toggle.
- Zoom controls.
- Timeline.
- Piano keyboard.
- Scrollable grid.
- Velocity lane.
- Automation lanes.
- Horizontal and vertical zoom.
- Current playhead.
- Selection overlay.
- Ghost note preview.

Interactions:

- Create.
- Move.
- Resize.
- Group drag.
- Marquee select.
- Multi-select.
- Delete.
- Copy.
- Paste.
- Duplicate.
- Nudge.
- Change velocity.
- Quantize.
- Edge auto-scroll.
- Temporary snap override.
- Change snap during drag.
- Triplet snap.
- Snap off.
- Prevent invalid pitch or time.
- Undo and redo for every committed edit.

Per-note properties:

- Velocity.
- Accent.
- Slide.
- Probability.
- Micro-timing.
- Duration.

Scale features:

- Scale.
- Key.
- Lock.
- Snap to scale.
- Grey out out-of-scale notes.

Canvas may render the static grid and playhead. Interactive notes must expose
meaningful accessibility information.

Keyboard behavior:

- Delete or Backspace deletes selected notes or steps where applicable.
- Arrow keys move selected notes.
- Shift plus arrows resizes or performs fine movement according to editor
  context.
- Control or Command plus C copies.
- Control or Command plus V pastes.
- Control or Command plus D duplicates.
- Control or Command plus A selects all events in the active lane.
- Control or Command plus Z undoes.
- Control or Command plus Shift plus Z redoes.
- Platform conventions take precedence where they differ.

### 16.4 Drum grid

- One row per voice.
- Paint steps by dragging.
- Velocity shown as bar height.
- Vertical drag edits velocity.
- Advanced step editor for probability, offset, roll, and flam.
- Right-click or long-press may open it, but a visible button and keyboard
  command must provide the same access.
- Independent voice length.
- Independent voice resolution.
- Clear polyrhythm visualization.
- Choke indicators.
- Voice mute, solo, and audition.
- No one-click-per-step requirement.

### 16.5 Live input

- Play the selected module from the computer keyboard.
- Show a visible key map.
- Record into the active pattern.
- Quantize on input.
- Quantize after recording.
- Record without quantize.
- Configurable count-in.
- Configurable metronome.
- Recording remains undoable as one take or logical group.

Musical input uses physical `KeyboardEvent.code` positions. Text fields use
normal typed characters. The musical map is visible and remappable.

### 16.6 Generators and transforms

Generators:

- Euclidean rhythm per voice.
- Randomize with strength.
- Humanize timing and velocity.
- Pattern variation with similarity.

Transforms:

- Reverse.
- Invert.
- Transpose.
- Double time.
- Half time.
- Shift.
- Legato.
- Stretch to length.

Requirements:

- Preview is non-destructive.
- Preview is audible.
- Apply commits one undoable command.
- Cancel restores the previous result.
- “Apply” is not a destructive confirmation dialog.

---

## 17. Timing

Global controls:

- Swing, default 54%.
- Humanize, default 12%.
- Quantize strength, default 100%.
- Reset.
- Optional lock.
- Grid display and timing status.

Behavior:

- Swing shifts alternating subdivisions.
- Humanize changes timing and velocity deterministically.
- A stored pattern seed produces repeatable playback.
- Changing the seed creates a new deterministic variation.
- Quantize strength blends events toward the grid.
- Timing is audible.
- Visual playheads reflect timing where practical.
- Tempo changes during playback are supported.
- Tempo automation and structural time-signature events are supported in Song
  mode.

---

## 18. Song building

Pulsebox provides both a compact playlist summary and a full Song workspace.

### 18.1 Compact section navigator

Each row contains:

- Position.
- Name.
- Duration in bars.
- Selected state.
- Drag handle.
- Menu.

Interactions:

- Select.
- Rename.
- Change duration.
- Reorder.
- Duplicate.
- Delete.
- Add.
- Assign patterns or scenes.
- Undo and redo.

### 18.2 Full arrangement timeline

- One lane per rack slot.
- Pattern clips.
- Clip repetition by resizing.
- Move clips.
- Copy clips.
- Duplicate clips.
- Clip-level transpose.
- Clip-level velocity scale.
- Clip-level probability.
- Loop markers.
- Bar ruler.
- Time-signature events.
- Tempo automation.
- Horizontal zoom.
- Track-height control.

### 18.3 Scenes

A scene stores:

- Name.
- Color.
- Active pattern per rack slot.
- Launch quantization.

Capabilities:

- Trigger live.
- Place on timeline.
- Duplicate.
- Rename.
- Reorder.
- Delete.
- Undo and redo.

### 18.4 Automation

Any automatable parameter may have a lane.

Automation is step-based only. It stores discrete values on a musical automation
grid. It does not store line segments, curve segments, or dense freehand points.

Tools:

- Step draw.
- Erase.
- Select.
- Move.
- Scale values.

Automation may target:

- Instrument parameters.
- Voice parameters.
- Mixer parameters.
- Send parameters.
- Effect parameters.
- Master parameters.
- Tempo.

Time signature is not a parameter and has no automation lane. A time-signature
event is a structural Song command attached to a bar boundary. It stores a
numerator from 1 through 32 and a denominator of 1, 2, 4, 8, 16, or 32. Moving,
creating, or deleting one event is undoable. Recording parameter movement never
creates or changes a time-signature event.

Whenever transport Record is armed, every user parameter movement records
automatically into the target parameter lane. The resulting take is one undoable
command.

In Pattern mode, recording writes to the active pattern. In Song mode, it writes
to the arrangement timeline. Automation capture uses a dedicated musical grid,
default 1/16. Within one grid cell, the last recorded value wins and is held
until the next automation step. One gesture or recording pass creates one undo
entry. Only deliberate user input records; playback modulation, meters,
playheads, theme changes, state restoration, and generated patches never write
automation.

---

## 19. Mixer and routing

### 19.1 Logical channels

The MVP has eight rack-slot mixer channels and one master channel.

Each of the eight rack slots has one matching instrument channel. Loading,
removing, swapping, or reordering a module updates that slot channel without
creating mixer banks or channels beyond eight. Empty rack slots retain disabled
visible strips labeled `Empty`.

The active audio-path identity follows the module ID. Slot identity controls
placement and the corresponding strip position.

### 19.2 Visible mixer

The established visible mixer contains:

- Exactly eight visible instrument channel strips, including disabled `Empty`
  strips.
- Slim and expanded strip states.
- One expanded strip at a time.
- One master strip.
- Four send controls per channel.
- Meter.
- Vertical fader.
- Pan.
- Mute.
- Solo.
- Monitor control for single-channel pre-fader audition.
- Clip indicator.
- Module short label.
- Selection state.
- Insert-chain access.
- A clear indicator when any send is active.

The slim state keeps meter, fader, mute, solo, module identity, and compact send
controls visible. The expanded state enlarges pan, sends, meter detail, Monitor,
and insert-chain access.

Selecting a rack module selects its mixer channel. Selecting a mixer channel
selects the matching module.

Monitor performs exclusive single-channel pre-fader audition through a
non-exported monitor bus. The tap occurs after the module insert chain and
before the channel fader and send taps. While Monitor is active, the master
program continues to render internally but is not sent to the physical output.
Only the selected channel tap reaches the physical output, through monitor
safety gain and the protected limiter. Displayed master meters switch to the
monitor signal and show a visible Monitor state. This prevents the selected
channel from being doubled. Only one channel may be monitored at a time. Monitor
selection is transient session state and is not serialized, restored, included
in portable project files, or rendered into audio exports.

The master strip and all eight instrument strips remain visible at supported
wide layouts. Empty strips are disabled and labeled `Empty`. There are no hidden
mixer banks in the MVP.

### 19.3 Internal drum-voice mixer

Drum voices have an internal mixer inside the expanded instrument editor.

Voice output flow:

1. Voice synthesis.
2. Voice sample layer.
3. Voice insert.
4. Voice pan and level.
5. Module sum.
6. Module insert chain.
7. Main channel fader.
8. Module send taps according to each send bus pre-fader or post-fader setting.
9. Master.

Voice-level send controls do not exist. The four send controls live only on the
parent rack-slot mixer channel.

### 19.4 Inserts

Approved hierarchy:

- One insert slot per drum voice.
- One eight-slot pedalboard per rack module.
- The module pedalboard is the same chain opened from the rack and the expanded
  mixer strip.
- Four send-bus chains.
- One master chain with at least six slots.

Each compact A–D card summarizes one modular send-bus chain. It shows the
primary effect, four macros, chain count, bypass state, activity, Edit control,
and circular return Mix control.

### 19.5 Solo and mute

- Channel mute silences the module main path and all four sends, regardless of
  whether a send tap is configured pre-fader or post-fader.
- Voice mute silences one drum voice before the module sum.
- Module solo participates in global mixer solo.
- Voice solo is local to its drum module and does not place the parent mixer
  channel into global solo.
- Multiple module solos are additive. When any channel is soloed, only soloed
  channels and their sends feed the mix.
- Shared send returns remain audible only for signal contributed by the
  surviving soloed channels.
- Solo behavior is deterministic and tested.
- Muting and soloing do not rebuild the graph.

### 19.6 Mixer-strip modularity

The channel-strip structure is fixed. Its insert processing, metering options,
and processing modules are swappable through the shared effect plugin system.
There are no replaceable channel-strip types in the MVP.

### 19.7 Output routing

Every rack module exposes output routing to the main output and the four send
buses. The project model may reserve future routing destinations, but the MVP
does not provide fixed subgroups or an arbitrary routing graph.

---

## 20. Effects

Use one effect plugin system for voice inserts, module pedalboards, send chains,
and the master chain.

### 20.1 Effect locations

1. Per-drum-voice insert: one slot.
2. Per-module pedalboard: at least eight slots.
3. Four send buses: each contains a chain.
4. Master chain: at least six slots.
5. Protected limiter: final master slot by default.

### 20.2 Effect catalog

Build:

- Lo-fi.
- Pattern controlled filter.
- Distortion.
- Compressor.
- Delay.
- Reverb.
- Chorus.
- Phaser.
- Parametric EQ.
- Transient shaper.
- Stereo width.

Effect variants or modes provide the compact default identities:

- Delay in Analog echo mode.
- Reverb in Plate mode.
- Distortion in Drive mode.
- Stereo width as its own effect.

The reverb detailed editor retains the previously designed shimmer capability.

### 20.3 Compact A–D bank

The established compact bank remains anchored to the right of the mixer. Each
card summarizes one send-bus effect chain.

Default primary effects:

- A: Analog echo.
- B: Plate reverb.
- C: Stereo width.
- D: Drive.

Each approximately 110-pixel compact slot contains:

- Bus letter.
- Primary effect name.
- Four macros from the pinned focus effect's declared compact controls.
- Circular return Mix control.
- Chain bypass.
- Edit button placed in the established unused space.
- Activity or status.
- Accent.
- Selection state.
- Chain-count indicator.

The Add effect row appends a plugin to the selected send chain. The detailed
editor manages ordering, replacement, per-plugin bypass, and per-plugin wet/dry
mix.

The user pins one effect in the chain as the compact card focus. The first
effect is pinned by default. The four macros use the pinned plugin's declared
compact controls. If the focused effect is removed, focus moves to the next
surviving effect, then the previous effect, or to an empty-card state when the
chain has no effects.

The circular control keeps the visible label `Mix` but acts as the send-chain
return level from silence to unity. The source remains dry on its main path, and
each plugin retains its own wet/dry control inside the chain.

Edit opens the established 760 × 680 detailed editor without stopping playback.

### 20.4 Pedalboard

- Pedals flow left to right.
- Reorder by pointer drag and keyboard commands.
- Bypass per pedal.
- Wet and dry mix per pedal.
- Compact view with two or three important controls.
- Expanded editor.
- No click or dropout while reordering.
- Stable effect IDs.
- Automation follows the effect instance when moved.

### 20.5 Send buses

- Four buses A through D.
- Independent amount per channel.
- Pre-fader or post-fader per channel and bus.
- Default post-fader.
- Effect chains receive sends and return to master.
- Routing prevents feedback loops.
- Send return level is automatable.

### 20.6 Master chain

- Serial.
- At least six slots.
- Compressor and EQ available by default.
- Limiter in the last slot.
- Limiter protected from removal.
- Limiter may be bypassed.
- Peak reset.
- Metering before and after the chain.

### 20.7 DSP requirements

Lo-fi:

- Bit-depth reduction.
- Sample-rate reduction.
- Anti-alias filtering.
- Adjustable character.
- Shared DSP core with the built-in digital-instrument lo-fi stage.

Pattern controlled filter:

- Tempo-locked editable cutoff pattern.
- Fully editable lane.
- No preset-only workflow.

Distortion:

- Multiple original models.
- Safe level compensation.

Compressor:

- Threshold.
- Ratio.
- Attack.
- Release.
- Makeup.
- Visible gain reduction.

Delay:

- Tempo sync.
- Free time.
- Feedback filtering.
- Ping-pong.
- Smooth time changes.
- Original implementation.

Reverb:

- Pre-delay.
- Decay.
- Damping.
- Mix.
- Plate mode.
- Shimmer in detailed editor.
- Stable impulse or algorithm allocation.

Chorus and phaser:

- Tempo-aware modulation where applicable.
- Stable stereo behavior.

Parametric EQ:

- Visible editable response curve.
- Stable bands and IDs.

Transient shaper:

- Attack and sustain shaping.
- Safe output compensation.

Stereo width:

- Mid-side or dual-channel processing.
- High-pass and low-pass controls.
- Safe mono behavior.

---

## 21. Audio engine

### 21.1 Core requirements

- 32-bit float processing.
- A documented host-frame processing contract: processors accept the frame count
  supplied by the host, and fixed-block algorithms use bounded internal
  buffering only where required.
- Sample-rate agnostic.
- Correct at 44.1 kHz and 48 kHz.
- Audio clock is authoritative.
- Lookahead scheduling.
- Visual timers are never the musical clock.
- Parameter smoothing.
- No zipper noise.
- No allocation in real-time processing.
- No logging in real-time processing.
- No locks in real-time processing.
- Conservative output level.
- Master limiter enabled by default.
- Clean voice release.
- Bounded graph growth.
- Bounded feedback.
- Reusable impulse responses and buffers.
- No large buffer regeneration on each parameter edit.

### 21.2 Transport clock

- Reads audio context time.
- Schedules ahead.
- Supports tempo change during playback.
- Supports swing.
- Supports deterministic humanization.
- Supports pattern and song modes.
- Supports quantized pattern and scene launches.
- Keeps visual playheads separate.

A scheduling interval around 20 to 30 milliseconds and a horizon around 80 to
120 milliseconds may be used by the engine controller, but the audio thread
remains authoritative.

### 21.3 Worklet and graph messaging

- UI sends commands to the state and engine controller.
- Engine controller sends compact messages to worklets.
- Worklets return meter frames and status through preallocated or bounded
  channels.
- No UI component owns a worklet port directly.
- Messages are versioned.
- Parameter changes are timestamped where needed.

Custom synthesis and custom DSP use AudioWorklet processors. Native Web Audio
nodes may implement suitable primitives such as delay, filtering, convolution,
waveshaping, dynamics, analysis, and gain staging, but only behind engine-owned
plugin adapters.

### 21.4 Voice stealing

Each instrument documents:

- Maximum voices.
- Steal priority.
- Release duration.
- Choke policy.
- Retrigger policy.

Steal with a short release, never a hard cut.

### 21.5 Sample boundaries

Apply automatic micro-fades:

- Fade-in: 2 ms.
- Fade-out: 4 ms.
- Linear amplitude.
- Per channel.

Handle:

- Very short samples.
- Adjacent samples.
- Loop boundaries.
- DC offsets.
- Choked voices.
- Start offsets.
- Rate changes.

### 21.6 Sample decoding

WAV, AIFF, and FLAC import uses the Pulsebox-owned decoding interface defined in
`ARCHITECTURE.md`. The production path uses bundled deterministic decoders and
does not depend on whether `decodeAudioData()` supports a format in the current
browser. Decoding runs outside the audio render thread. The decoder validates
container structure, channel count, declared lengths, decoded frame count, and
project limits before publishing an asset.

### 21.7 Audio unlock and fallback

- Resume audio only from a direct user gesture.
- Clearly show locked, active, suspended, and unavailable states.
- Editing remains functional if Web Audio is blocked or unavailable.
- No fake meters while stopped.
- Demo animation, if used, is deterministic and clearly non-audio.

### 21.8 Startup and first sound

Audible playback must begin within three seconds on a warm cache. Measure from
the first valid audio-unlock gesture that also requests an audible result, such
as the first Play command or an instrument audition. A power-only gesture that
does not request sound does not start the metric.

For release evidence, serve the production build from the canonical origin, load
it once successfully, close that browser context, then run five fresh contexts
with the default project already stored. Measure from the trusted Play action to
the first non-silent output frame observed by the deterministic audio probe.
Every run must finish within three seconds. Record the browser version,
operating system, processor, memory, audio device, sample rate, and exposed
buffer setting.

### 21.9 Performance

Target:

- Eight active rack slots.
- Active patterns.
- Effects and metering.
- No avoidable audible dropouts during normal supported use.
- Stable long-running playback.
- Pause nonessential visual animation when the document is hidden.
- Do not keep an animation loop running while inactive unless audio or a visible
  meter requires it.
- Batch visual patches.
- Use transforms for playheads, meters, and drag previews.
- Cache geometry for the duration of pointer gestures.
- Avoid repeated layout measurement inside pointer-move handlers.

Apart from the functional first-sound metric above, the MVP has no normative
hardware class, CPU percentage, buffer-size threshold, or timed stress benchmark
as a release gate. Performance profiling remains required for engineering
diagnosis and `HANDOFF.md`, but it is informational rather than a pass-or-fail
acceptance criterion.

---

## 22. Control primitives

### 22.1 Knobs

Use `pulse-knob`.

Support:

- Native range semantics.
- Vertical drag.
- Pointer capture.
- Fine adjustment with modifier.
- Wheel while focused or deliberately hovered.
- Arrow keys.
- Page Up and Page Down.
- Home and End.
- Double-click reset.
- Direct numeric entry.
- Tooltip during adjustment.
- Units.
- Accessible full name.
- Value arc or indicator.
- Default marker where useful.

### 22.2 Faders

Use `pulse-fader`.

Support:

- Range semantics.
- Pointer.
- Wheel.
- Keyboard.
- Fine adjustment.
- Direct numeric entry.
- dB display.
- Double-click to unity or default.
- Visible cap at minimum and maximum.

### 22.3 Buttons and toggles

- Native buttons.
- No clickable `div`.
- Visible focus.
- `aria-pressed` for toggles.
- Clear active state.
- Clear bypass semantics.
- Practical hit area.

### 22.4 Meters

- Canvas is preferred for frequently updating channel and master meters.
- No DOM allocation per frame.
- Green, amber, and red regions.
- Peak hold.
- Smooth decay.
- No random motion while stopped.
- Hidden from assistive technology unless a meaningful numerical value is
  exposed.
- Meter animation never triggers component-tree rerenders.

### 22.5 Playheads and curves

- Playheads use Canvas or direct transforms.
- Filter, EQ, envelope, and waveform curves plus automation step graphs use
  Canvas or SVG.
- No per-frame allocation.
- Reduced-motion mode limits nonessential animation without hiding position.

---

## 23. Persistence, project files, and export

### 23.0 Project sample library

User sample layers require a project sample library.

Capabilities:

- Import audio files.
- Preview.
- Rename the project asset.
- Assign one asset to multiple voices without duplicating decoded data.
- Replace.
- Remove when unreferenced.
- Show usage references.
- Detect duplicate content where practical.
- Report decode failure.
- Report missing linked assets.
- Store original metadata separately from display names.
- Prepare safe channel, rate, DC-offset, and boundary handling before playback.
- Keep decoded buffers out of serializable state.
- Durable non-embedded references may target immutable factory packs or
  user-installed packs stored in IndexedDB by content ID. Loose imported files
  are embedded during portable export.

User-installed packs enter through Settings, Sample packs, Install pack from a
local `.pulsebox-pack` archive. Packs are immutable and content-addressed as
defined in `PROJECT-FORMAT.md`. A missing referenced pack loads the project in
the defined degraded mode: unavailable sample layers are silent, synthesis and
unrelated audio continue, references round-trip unchanged, and the recovery
report identifies the exact content needed.

Accepted user-sample formats are WAV, AIFF, and FLAC. Preserve mono and stereo
channel layouts. Reject files with more than two channels. Enforce hard limits
of 32 MiB per source file and 512 MiB of total stored imported assets per
project. Enforce the decoded frame, duration, archive, manifest, and expansion
limits in `PROJECT-FORMAT.md` before project state changes. A compressed source
that expands beyond a decoded limit is rejected even when its source file is
smaller than 32 MiB.

### 23.1 Browser storage

IndexedDB stores:

- Project metadata.
- Rack order.
- Module state.
- Patterns.
- Notes.
- Steps.
- Automation.
- Mixer.
- Effects.
- Samples.
- Playlist and arrangement.
- Timing.

Local storage stores only preferences such as:

- Last project ID.
- Last workspace.
- Collapsed panels.
- Last studio tab.
- Theme preference.
- Contrast mode.

Both development and production-build launch commands use
`http://127.0.0.1:4173` with strict-port behavior so origin-scoped project data
does not move silently. A different scheme, host, or port is a different storage
origin and is not an automatic migration path.

### 23.2 Project document

A `.pulsebox` project has:

- Version.
- Project metadata.
- Stable IDs.
- Plugin versions.
- Parameter state.
- Pattern banks.
- Song arrangement.
- Automation.
- Mixer and routing.
- Effect chains.
- Sample manifest, including a stable content ID and storage mode for each
  asset: `embedded` or `pack-reference`.
- Migration metadata.

No executable code is imported.

No live AudioNode or worklet object is serialized.

Browser storage uses a versioned JSON manifest plus separate asset records.
Portable export uses one `.pulsebox` package containing the manifest and any
embedded audio assets. A `.pulsebox` file is a standard ZIP-compatible archive
with `manifest.json` at the root and imported assets under `assets/`. The
normative schema, canonical serialization, pack-reference contract, plugin
compatibility rules, resource bounds, and archive safety rules are documented in
`PROJECT-FORMAT.md`.

### 23.3 Save and recovery

- Autosave after committed edits with debounce.
- Dirty indicator.
- Saving indicator.
- Saved indicator.
- Explicit Save.
- Saving does not block interaction.
- Recover after refresh or crash.
- Tell the user what was recovered through a non-blocking panel and ARIA live
  announcement.
- Keep a bounded recovery history.
- Schema migrations exist before version 2 is needed.

After the first explicit Save or sample-pack installation gesture, request
persistent origin storage once and expose whether it was granted. Before a write
that adds assets or a recovery snapshot, use the browser storage estimate as an
early warning and calculate the operation's worst-case new records. Estimates
never replace transaction error handling.

Every Save, autosave, import, migration, and recovery update is atomic. A failed
transaction preserves the last committed project, keeps the current editor
dirty, shows a storage error and recovery action, and keeps portable Export
available. `QuotaExceededError` never triggers silent pruning of current project
assets. Only recovery snapshots outside the protected current and last
known-good pair may be pruned, oldest first, and the pruning is reported.

Ordinary Save preserves each sample manifest entry's current `embedded` or
`pack-reference` storage mode without prompting. Portable Export asks whether
eligible recognized pack references should remain references or be embedded.
Loose imported files are not eligible as durable external references and are
embedded in the portable package.

When the same project is open in multiple tabs, last writer wins. There is no
edit lock and no automatic conflict copy. Tabs should broadcast version changes
so a stale tab can show a non-blocking warning before its next save, but a later
save still becomes authoritative.

### 23.4 Import validation

- Validate structure.
- Validate plugin IDs.
- Validate parameter ranges.
- Validate IDs and references.
- Validate effect routing.
- Validate sample metadata.
- Clamp or reject dangerous values.
- Reject executable content.
- Report every repaired or rejected item.

Apply the complete validation order and limits in `PROJECT-FORMAT.md`. In
particular, reject unsafe or colliding archive paths, links, duplicate entries,
excessive expansion, oversized or deeply nested manifests, excessive record
counts, decoded audio over the frame limits, and unknown or incompatible
referenced plugins before decoding assets or mutating IndexedDB.

Import safely repairs numeric ranges and missing optional fields. When only safe
repairs are needed, it applies the project and then shows a complete repair
report. Structural damage or an unknown or incompatible referenced plugin
rejects the import and produces a complete rejection report. Every plugin
reference in an MVP project is required. No optional-plugin degradation mode
exists. No confirmation dialog is used.

An imported project containing more than eight rack slots is incompatible with
the MVP and is rejected in full. The rejection report lists every over-cap slot;
no partial project state is applied.

### 23.5 Audio export

- Master WAV export.
- One stem per rack slot.
- Offline rendering.
- Faster than real time where supported; measure the result informally, but do
  not treat a hardware-specific threshold as a release gate.
- Visible progress.
- Cancel.
- Deterministic result.
- No playback dropout.
- No server.

Stem export produces one post-module-insert, post-fader stem per occupied rack
slot, one separate stem for each of the four send returns, and one master mix.
Rack stems do not duplicate shared send returns. Rack and send-return stems are
rendered before the master chain. Only the master mix includes master-chain
processing.

All WAV exports use 16-bit, 44.1 kHz PCM, including exports from a 48 kHz live
project. Offline export uses high-quality deterministic resampling to 44.1 kHz.
Export does not normalize. Deterministic TPDF dither is applied whenever audio
is quantized to 16-bit PCM.

---

## 24. Accessibility, testing, documentation, and delivery

### 24.1 Accessibility

Pulsebox uses WCAG 2.2 Level AA success criteria as the measurement source for
supported desktop viewports, without claiming full WCAG conformance below the
product's 1280 × 720 editing boundary. Normal text has at least 4.5:1 contrast;
large text, essential graphics, control boundaries, state indicators, and focus
indicators have at least 3:1 contrast where the applicable criterion requires
it. Pointer targets are at least 24 × 24 CSS pixels or satisfy the WCAG 2.2
spacing exception. Focus is visible and not fully obscured.

- Keyboard access for every interactive feature.
- Semantic native controls.
- ARIA only where native semantics are insufficient.
- Visible focus in all themes.
- Full accessible names.
- Tooltips for abbreviations.
- Tooltips explain audible behavior in plain user-facing language.
- No color-only meaning.
- Reduced motion.
- The numeric contrast requirements above.
- ARIA live announcements for module movement, deletion, save, recovery, import,
  and errors.
- Error text never apologizes and never uses vague wording.
- No ordinary-panel focus traps.
- Modal editor focus trap only while open.
- Focus restored on close.
- High-contrast mode.
- Pointer targets meeting the size or spacing rule above.
- Notes and steps expose meaningful text alternatives.
- Keyboard reorder for rack slots, effects, patterns, and song sections.

### 24.2 Undo and redo

Include:

- Parameter changes.
- Step changes.
- Note changes.
- Automation changes.
- Module add, remove, duplicate, swap, and reorder.
- Mixer changes.
- Effect changes.
- Chain changes.
- Playlist and arrangement changes.
- Scene changes.
- Pattern changes.
- Sample assignment.

Exclude:

- Meter frames.
- Playhead movement.
- Hover.
- Focus.
- Temporary previews.
- Audio power.
- Save-status animation.
- Rack-module and ordinary panel collapse preferences.

### 24.3 Tests

Unit tests:

- Store commands.
- Selectors.
- Undo and redo.
- Gesture coalescing.
- Migrations.
- Import validation.
- Pattern timing.
- Swing.
- Deterministic humanization.
- Quantize strength.
- Mixer solo logic.
- Voice solo logic.
- Effect sends.
- Routing safety.
- Parameter clamps.
- Time formatting.
- Sample micro-fades.
- Voice stealing.
- Automation step timing, overwrite, and sample-and-hold behavior.
- Theme token validation.
- Time-signature event validation and bar-boundary behavior.
- Archive traversal, collision, expansion, and record-count rejection.
- Plugin version and pack-reference validation.
- Storage quota failure and atomic rollback.
- Bundled WAV, AIFF, and FLAC decoder fixtures.
- Monitor routing without program-path doubling.

Component tests:

- Knob keyboard behavior.
- Knob reset.
- Numeric entry.
- Fader keyboard behavior.
- Toggle ARIA.
- Step painting.
- Velocity drag.
- Module add and remove.
- Module reorder.
- Playlist reorder.
- Pattern reorder.
- Effect reorder.
- Piano-roll creation, move, and resize.
- Focus restoration.
- Live keyboard map focus rules.

Playwright:

- Startup.
- Audio unlock.
- Play and stop.
- Pattern and Song mode.
- Add, reorder, swap, and remove module.
- Undo removal.
- Toggle and paint steps.
- Record computer-keyboard input.
- Generate a pattern.
- Edit a note.
- Edit automation.
- Change mixer controls.
- Change sends.
- Enable and reorder effects.
- Open detailed effect editor.
- Rename and reorder a section.
- Place a clip.
- Trigger a scene.
- Save and reload.
- Crash recovery.
- Export and import.
- WAV export.
- Keyboard-only use.
- Supported layouts at 1536 × 1024, 1440 × 900, 1366 × 768, and 1280 × 720, plus
  the unsupported-size notice below either minimum dimension.
- Theme switch during playback.
- Canonical-origin and strict-port launch behavior.
- First-run supplied-loop path from empty browser storage.
- Missing-pack degraded load and recovery.
- Storage persistence status and quota failure recovery.

Visual regression:

- 1536 × 1024.
- 1440 × 900.
- 1366 × 768.
- 1280 × 720.
- All five themes.
- High-contrast mode.
- Deterministic meters and animation.

### 24.4 Objective evidence thresholds

Use the deterministic fixtures and detailed procedures in `ARCHITECTURE.md`,
`PROJECT-FORMAT.md`, and `THEMING.md`. The following release thresholds are
normative:

- A same-build project save, reload, and offline render at the same sample rate
  produces the same canonical manifest and event schedule. For deterministic
  rendered samples, maximum absolute sample error is at most `1e-6`.
- Across 44.1 kHz and 48 kHz fixtures, scheduled event time differs by at most 1
  millisecond and oscillator pitch differs by at most 1 cent after converting
  results to seconds and hertz.
- Every audible parameter descriptor declares its smoothing curve and duration.
  A constant-input sweep fixture must match that control trajectory within
  `1e-6` and introduce no output discontinuity above `0.02` full scale at a
  control update boundary.
- Offline 48 kHz to 44.1 kHz resampling is deterministic, keeps passband error
  within 0.1 dB from 20 Hz through 20 kHz, and keeps aliased or imaged test-tone
  energy at or below -90 dBFS.
- Automated deterministic checks run in the current stable Chrome, Edge, and
  Firefox release channels. The evidence records exact versions. Required
  real-audio checks run manually in all three browsers when automation cannot
  observe the physical result.
- Accessibility evidence checks the numeric requirements in section 24.1 at
  every supported viewport, in all five themes and high-contrast mode.
- The first-sound procedure in section 21.8 passes all five runs in every
  supported browser on the recorded release host.
- Before final release, five people unfamiliar with Pulsebox attempt to start
  the supplied loop from fresh browser storage using only visible product
  guidance. At least four must produce audible playback within one minute
  without assistance. Record anonymized elapsed times and failure points.

### 24.5 Suggested file structure

```text
src/
  main.ts
  app/
  state/
  engine/
    worklets/
    transport/
    routing/
    modules/
    effects/
  components/
    transport/
    library/
    rack/
    mixer/
    effects/
    editor/
    song/
    controls/
  persistence/
  themes/
  styles/
  utilities/
tests/
  unit/
  component/
  e2e/
  visual/
docs/
  instruments/
research/  # non-shipping named source notes; excluded from production packages and public docs
```

Keep audio processors, state logic, UI components, persistence, and theme tokens
in separate modules. Do not create one enormous component, engine file, or
global stylesheet.

### 24.6 Browser support

Support the current stable releases of Chrome, Edge, and Firefox. Safari is
outside MVP support. Run every deterministic browser-specific audio, file,
Canvas, persistence, and Web Component check in all three release channels. Use
documented manual checks only for physical audio behavior that browser
automation cannot observe. Record exact browser versions in release evidence.

### 24.7 Documentation

Deliver:

- `SPEC.md`
- `ARCHITECTURE.md`
- `THEMING.md`
- `PROJECT-FORMAT.md`
- `HANDOFF.md`
- `README.md`
- One sanitized approved instrument design specification per module in
  `docs/instruments/`.
- One named historical research note per module in the non-shipping `/research`
  directory, with sources and only broad synthesis-family findings. It must not
  define copied factory voice lists, control ranges, curves, defaults, or sound
  targets.
- Effect plugin documentation.
- Keyboard shortcut reference.
- `docs/user-sample-policy.md`.
- Informational performance notes covering browser, sample rate, buffer setting
  where exposed, active module and effect load, observed glitches, and known
  hotspots. No fixed CPU threshold is an acceptance gate.
- Repository-wide case-insensitive naming and dependency audit report under
  `docs/audits/`.

README includes:

- Overview.
- Technology.
- Commands.
- Architecture.
- State.
- Audio.
- Persistence.
- Accessibility.
- Keyboard shortcuts.
- Known limitations.
- Adding an instrument.
- Adding an effect.
- Adding a theme.

Commands:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`
- `npm run typecheck`

### 24.8 Build phases

Phase 0: Contract, legal boundary, research policy, state model, theme tokens,
project format, repository consistency checks, and independent architecture
review. Phase 0 ends with complete reviewed documents and passing documentation,
link, naming, and contract-consistency checks. It does not require a runnable
product application or product tests.

Phase 1: Application shell, controls, state spine, AudioWorklet spine,
transport, Acid Bass, three-slot functional rack.

Phase 2: Remaining instruments, sample layers, eight-slot rack, overview,
internal voice mixers.

Phase 3: Pattern banks, piano roll, drum grid, live input, generators,
transforms, full undo.

Phase 4: Main mixer, voice inserts, module pedalboards, send chains, master
chain, complete effect catalog.

Phase 5: Song timeline, scenes, automation, transport modes.

Phase 6: Five themes, user theme import, accessibility, default projects, visual
polish, performance measurements.

Phase 7: Persistence, recovery, project import/export, WAV and stem export,
final browser matrix.

Phases 1 through 7 end with a runnable application and passing tests for their
completed scope.

### 24.9 Close-out

Run a self-critique. Fix every acceptance-blocking gap before declaring the
product complete. Re-run affected tests after each fix. Record only remaining
non-blocking limitations, future work, and verified known issues in
`HANDOFF.md`. The former instruction to stop after finding gaps is removed.

---

## 25. Approved decision record

All product decisions below are final for version 1.0. The normative
requirements are integrated into the relevant sections of this specification;
this table is the traceability record.

- **D01.** Named historical research may exist only in the non-shipping
  `/research` directory. Production code, assets, tests, public docs, package
  metadata, and shipped data remain clean.
- **D02.** Use a hybrid engine: custom synthesis and custom DSP in AudioWorklet;
  suitable native Web Audio nodes behind engine-owned adapters.
- **D03.** The MVP has a maximum of eight rack slots, eight instrument mixer
  strips, and one master strip.
- **D04.** Compact A–D cards summarize modular send-bus chains.
- **D05.** All drum voices support synth and sample layers; analog modules
  default synth-heavy, Hybrid Nine blended, digital modules sample-heavy with
  lo-fi enabled.
- **D06.** No destructive confirmation dialogs. Actions happen immediately and
  preserve complete Undo.
- **D07.** The supported editing workspace begins at 1280 CSS pixels wide.
- **D08.** Deep effect editors use the established 760 × 680 playback-safe modal
  overlay.
- **D09.** Compact faceplates expose the established fast controls; deeper
  synthesis, sample, voice, insert, and routing controls live in the expanded
  editor.
- **D10.** Browser projects use JSON manifests plus asset records; portable
  export is one `.pulsebox` package.
- **D11.** Support current stable Chrome, Edge, and Firefox.
- **D12.** Rack stems are post-module-insert and post-fader; send returns are
  separate; export also includes the master mix.
- **D13.** Voice-level send controls are removed. Sends exist only on the parent
  module channel.
- **D14.** Patterns have a nominal 1–64-step span; drum voices may override
  length and resolution and wrap independently.
- **D15.** Pattern positions use flat numbers `1` through `32`.
- **D16.** User themes import only through the bounded, allowlisted JSON token
  schema in `THEMING.md`; raw CSS and resource-loading or declaration-injecting
  values are rejected.
- **D17.** Musical input uses physical key positions through
  `KeyboardEvent.code`; mapping is remappable.
- **D18.** MVP output routing is main plus four send buses.
- **D19.** Automation is step-based only.
- **D20.** Import safely repairs ranges and missing optional fields, rejects
  structural failures and any unknown or incompatible referenced plugin, and
  reports all changes. Every referenced MVP plugin is required.
- **D21.** Other than the defined first-sound functional metric, no fixed
  hardware benchmark, CPU threshold, buffer, duration, or utilization target is
  a release gate.
- **D22.** Browser application only. No PWA, service worker, or install flow.
- **D23.** The self-critique must fix acceptance-blocking gaps rather than
  deliberately leaving them unresolved.
- **D24.** Research informs broad synthesis families only; factory voice lists,
  ranges, curves, defaults, and sound targets remain original.
- **D25.** Ordinary Save preserves each asset's current embedded or
  recognized-pack-reference policy silently. Portable Export asks whether
  eligible pack references remain references or are embedded.
- **D26.** Mixer strips have a fixed structure with swappable processing modules
  and insert chains.
- **D27.** The three-second first-sound metric starts at the first valid
  audio-unlock gesture that also requests an audible result and uses the
  five-run warm-cache procedure in section 21.8.
- **D28.** Import WAV, AIFF, and FLAC through the bundled decoder path; preserve
  mono or stereo; reject more than two channels; limit source files to 32 MiB,
  stored imported project assets to 512 MiB, and decoded audio to the
  `PROJECT-FORMAT.md` bounds.
- **D29.** Multiple tabs use last-writer-wins behavior.
- **D30.** WAV export is always 16-bit, 44.1 kHz PCM.
- **D31.** Every deliberate user parameter move records automatically while
  transport Record is armed.
- **D32.** AudioWorklet plugins process the host-supplied frame count and never
  hard-code 128 frames; fixed-block algorithms use bounded internal buffering.
- **D33.** Pattern mode records automation into the active pattern; Song mode
  records into the arrangement; the dedicated grid defaults to 1/16, last value
  wins per cell, and one gesture or pass is one undo entry.
- **D34.** A `.pulsebox` file is a ZIP-compatible archive with root
  `manifest.json` and imported assets under `assets/`.
- **D35.** Imports containing more than eight rack slots are rejected in full
  and report every over-cap slot.
- **D36.** Rack and send-return stems are pre-master-chain; only the master mix
  includes the master chain.
- **D37.** WAV export does not normalize, uses deterministic TPDF dither, and
  resamples offline to 44.1 kHz at high quality.
- **D38.** All eight instrument strips remain visible; empty slots use disabled
  strips labeled `Empty`.
- **D39.** The minimum supported viewport is 1280 × 720. Below it, autosave
  continues and Save, portable Export, and a read-only project summary remain
  accessible behind a clear notice.
- **D40.** Theme and contrast are global local-storage preferences. Projects
  never change appearance settings, and new installations start on `rack`.
- **D41.** Durable references target immutable factory packs or explicitly
  installed IndexedDB packs by SHA-256 content ID under the install, integrity,
  missing-pack, and removal rules in `PROJECT-FORMAT.md`; loose imports are
  embedded during portable export.
- **D42.** Monitor is exclusive physical-output PFL for one post-insert,
  pre-fader channel. The master program keeps rendering but is not physically
  output while Monitor is active, so the selected channel is never doubled.
- **D43.** Workspace returns to the last Rack/Edit/Song view; Performance opens
  the live trigger surface; Sequencer and Piano roll switch editors inside
  Workspace only.
- **D44.** One effect is pinned as each send card's focus; the first effect is
  pinned by default, and its declared compact controls supply the four macros.
- **D45.** Sixteen rack slots remain an explicit post-MVP target while the MVP
  is capped at eight.
- **D46.** The compact `Mix` control is send-chain return level from silence to
  unity; the source stays dry and individual effects retain wet/dry controls.
- **D47.** Pause preserves position; Stop returns to the last explicit start
  marker, defaulting to Pattern step 1 or Song bar 1; repeated Stop has no
  second action.
- **D48.** Patterns longer than sixteen steps use sixteen-step pages, playback
  follow by default, and an optional viewed-page lock.
- **D49.** Channel mute silences main and sends; global solo passes only soloed
  channels and their sends, and shared returns contain only surviving soloed
  sources.
- **D50.** Mono is a monitor-only fold-down after the master chain. It affects
  live listening and meters but not WAV or stem export.
- **D51.** Development and built-app launch use `http://127.0.0.1:4173` with
  strict-port behavior. The static-file launcher exposes no product API.
- **D52.** WAV, AIFF, and FLAC import uses bundled deterministic decoders behind
  an engine-owned interface rather than browser-dependent format support.
- **D53.** `PROJECT-FORMAT.md` owns bounded archive, manifest, decoded-audio,
  path, collision, validation-order, and atomic-import rules.
- **D54.** Saves and imports are atomic, storage persistence is requested after
  an explicit gesture, quota failure preserves the last committed project, and
  portable Export remains available.
- **D55.** Time signatures are structural Song events at bar boundaries, not
  parameter automation targets.
- **D56.** Rack-module collapse is a local UI preference, is not portable
  project data, and is excluded from undo.
- **D57.** Objective audio, browser, accessibility, startup, and first-use
  evidence uses the thresholds and procedures in section 24.4 and the Phase 0
  domain contracts.

## 26. Acceptance criteria

The merged MVP is complete only when:

1. It is a real strict-TypeScript application.
2. It uses native DOM and Web Components.
3. It contains no UI framework or virtual DOM.
4. Its 1536 × 1024 composition follows the approved rack, mixer, FX, and editor
   hierarchy.
5. It remains usable without overlap at 1280 × 720 and at larger supported
   sizes; below either minimum dimension, the approved notice and limited Save,
   portable Export, autosave, and read-only summary behavior works.
6. Naming and capitalization rules pass the production audit, with `/research`
   as the only historical-name exception.
7. All six instruments exist.
8. Eight rack slots work and no ninth instrument can be added in the MVP.
9. Duplicate instruments work.
10. Add, select, collapse, expand, swap, duplicate, remove, and reorder work.
11. Compact step editing works.
12. Piano-roll note creation, movement, resizing, deletion, velocity, selection,
    and quantization work.
13. Drum-grid painting, velocity, probability, micro-timing, flam, roll, voice
    length, and resolution work.
14. Computer-keyboard live input and recording work through physical key
    positions.
15. Pattern generation and transforms work.
16. Every module has at least 32 flat-numbered patterns.
17. Quantized pattern switching works.
18. The mixer exposes exactly eight visible instrument channels plus one master
    channel; empty channels are disabled and labeled `Empty`.
19. No mixer banking, channels 9–16, or horizontal mixer scrolling exists in the
    MVP.
20. Mute, solo, fader, pan, four module-level sends, and exclusive
    single-channel pre-fader Monitor audition affect audio as specified. Monitor
    never doubles the selected channel, and displayed master meters follow the
    physical monitor signal while it is active.
21. Voice level, tune, decay, pan, blend, mute, solo, and voice inserts affect
    audio; voice-level sends do not exist.
22. Voice inserts work.
23. Module pedalboards work.
24. Four modular send chains work; each compact card uses a pinned focus effect
    and that plugin's four declared compact controls.
25. The master chain works.
26. All listed effects process audio.
27. A–D defaults match the approved compact effect design and use circular
    return Mix controls.
28. The reverb shimmer feature works.
29. The full Song timeline works.
30. Sections, clips, scenes, and step automation work.
31. Pattern and Song transport modes switch without stopping.
32. Deliberate parameter moves record while transport Record is armed, use the
    dedicated 1/16 automation grid by default, write to the active pattern or
    Song arrangement by mode, and apply the last-value-wins hold rule.
33. Undo and redo cover all committed edits and destructive actions use no
    confirmation dialog.
34. Autosave, recovery, explicit Save, import, export, and migrations are
    atomic. Quota failure preserves the last committed project, leaves the
    editor dirty, reports recovery actions, and keeps portable Export available.
35. Multiple tabs follow last-writer-wins behavior.
36. Master WAV export is unnormalized 16-bit, 44.1 kHz PCM with deterministic
    TPDF dither and high-quality deterministic resampling.
37. Stem export produces post-module-insert, post-fader rack stems and separate
    send-return stems before the master chain, plus a master mix that includes
    the master chain.
38. Projects reload and sound the same within the deterministic manifest,
    schedule, and rendered-sample limits in section 24.4.
39. Theme switching does not interrupt audio or shift layout; theme and contrast
    persist globally and never travel in project files.
40. All five themes and high-contrast mode pass the numeric accessibility checks
    in section 24.1 at every supported viewport.
41. User theme import enforces the complete bounded allowlist and safe value
    grammar in `THEMING.md`, ignores unknown tokens with a report, applies
    atomically, and rejects raw CSS and unsafe values.
42. The application is operable by keyboard.
43. No MIDI code exists.
44. No main-thread custom DSP exists.
45. No `ScriptProcessorNode` exists.
46. Custom synthesis and custom DSP use AudioWorklet; native nodes remain behind
    engine adapters.
47. AudioWorklet plugins process the host-supplied frame count without assuming
    128 frames; any fixed-block buffering is bounded and documented.
48. 44.1 kHz and 48 kHz live playback meets the 1-millisecond event-time and
    1-cent pitch tolerances in section 24.4.
49. Parameter sweeps meet their declared smoothing trajectories and the
    constant-input discontinuity threshold in section 24.4.
50. Sample boundaries use the approved micro-fades.
51. User sample import uses the bundled deterministic WAV, AIFF, and FLAC
    decoders; preserves mono or stereo; rejects multichannel files; enforces 32
    MiB per source, 512 MiB stored assets per project, and every decoded frame
    and expansion limit in `PROJECT-FORMAT.md`; and supports assignment, reuse,
    validation, and removal.
52. Ordinary Save preserves each asset's embedded or recognized-pack-reference
    mode. Pack references meet the install, identity, integrity, version,
    missing-pack, and removal contract in `PROJECT-FORMAT.md`. Portable Export
    offers embedding for eligible pack references, while loose imports are
    embedded.
53. Portable `.pulsebox` export produces a ZIP-compatible archive with root
    `manifest.json` and assets under `assets/`. Import rejects every unsafe
    path, link, collision, duplicate, excessive expansion, excessive record
    count, and incompatible referenced plugin defined in `PROJECT-FORMAT.md`
    before state changes.
54. An imported project exceeding eight rack slots is rejected in full and
    reports every over-cap slot.
55. Type checking passes.
56. Unit, component, end-to-end, and visual tests pass in the current stable
    Chrome, Edge, and Firefox release channels. Exact versions are recorded, and
    any physical-audio-only claim has a passing manual procedure in all three
    browsers.
57. The production build completes without unresolved imports, framework
    dependencies, a service worker, or PWA packaging.
58. The legal audit permits named historical sources only under non-shipping
    `/research` and verifies that shipped factory voice lists, ranges, curves,
    defaults, sound targets, layouts, assets, and public text remain original
    and free of prohibited names.
59. No visible control is fake or decorative.
60. Final documentation is complete.
61. Final self-critique fixes all acceptance-blocking gaps.
62. Mixer strips use a fixed structure with swappable processing modules and
    insert chains.
63. On a warm cache, audible playback begins within three seconds in every run
    of the five-run, per-browser procedure in section 21.8.
64. Workspace, Performance, Sequencer, Piano roll, Rack, Edit, and Song
    navigation follow the approved hierarchy defined in section 8.6.
65. The Pattern inspector defaults to pattern `1`, and studio tabs work.
66. Nonessential visual animation pauses when hidden.
67. CSS token, spacing, radius, scrollbar, and supported-viewport rules are
    followed.
68. The visible mixer supports slim and single-expanded strip states.
69. The piano-roll toolbar and four-bar default timeline work.
70. Step automation contains no line or curve segments.
71. The engine, state, and UI remain slot-count agnostic for the explicit
    sixteen-slot post-MVP target without enabling more than eight slots in the
    MVP.
72. The compact pattern strip handles lengths above sixteen steps through
    sixteen-step pages, playback follow, a page indicator, and viewed-page
    locking.
73. Pause preserves position; Stop returns to the last explicit start marker,
    with the defined Pattern and Song defaults and no second-stop behavior.
74. The compact send-chain `Mix` control changes return level from silence to
    unity without adding a dry copy or replacing per-effect wet/dry controls.
75. Channel mute silences main and sends; global solo passes only soloed
    channels and their sends; shared returns contain only surviving soloed
    sources.
76. Mono folds down live monitoring after the master chain, changes the
    displayed meters, and does not affect WAV or stem export.
77. At least four of five unfamiliar participants start the supplied loop
    without assistance within one minute under the procedure in section 24.4.
78. Development and built-product launch use `http://127.0.0.1:4173`; a busy
    port fails visibly instead of selecting a different origin.
79. Time signatures are validated structural Song events at bar boundaries, are
    editable through undoable commands, and are never written by parameter
    automation recording.
80. Rack-module collapse persists only as a local UI preference keyed by project
    and module, does not travel in `.pulsebox` files, and creates no undo entry.
81. Every referenced plugin is required and known at a compatible version;
    missing pack references use the degraded, reference-preserving recovery
    behavior in `PROJECT-FORMAT.md`.

## 27. Out of scope

The following are out of scope for version 1.0:

- Application server, API, or server-backed feature. The local static-file
  launcher is delivery tooling only.
- Accounts.
- Cloud sync.
- Collaboration.
- Plugin hosting.
- Microphone or line-input recording.
- MIDI of any kind.
- Eleven additional built-in themes.
- Editable layouts below 1280 × 720 CSS pixels, compact-desktop rescue layouts,
  and full touch-first mobile design.
- More than eight rack slots in the MVP. Sixteen slots remain an explicit
  post-MVP target.
- Native desktop wrappers.
- PWA installation and service workers.
- Marketplace or online sample store.
- Line and curve automation in the MVP.
