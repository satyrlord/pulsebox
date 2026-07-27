# Pulsebox Technical Foundations Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-002`  
**Build order:** 2 of 10  
**Depends on:** [Product and design foundations](spec-001-product-and-design-foundations.md)  
**Owns:** Technology, layers, plugin contracts, central state, commands, and
Undo foundations.  
**Acceptance IDs:** `AC-001` through `AC-003`, `AC-033`, `AC-043`, `AC-071`,
`AC-078`, and `AC-084` in
[release acceptance](spec-012-release-acceptance.md).

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
- `pulse-pattern-select`
- `pulse-pattern-reorder`
- `pulse-automation-change`
- `pulse-transport-command`

Transient drag input does not create one history entry per pointer event.
Pointer release commits one command unless the user deliberately creates
multiple edits.

---

