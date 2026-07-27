# Pulsebox Application Shell and Controls Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-003`  
**Build order:** 3 of 10  
**Depends on:** [Technical foundations](spec-002-technical-foundations.md)  
**Owns:** Application composition, Web Components, navigation, responsive
behavior, and shared control primitives.  
**Acceptance IDs:** `AC-004` through `AC-005`, `AC-042`, `AC-059`, and `AC-064`
through `AC-066` in [release acceptance](spec-012-release-acceptance.md).

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

