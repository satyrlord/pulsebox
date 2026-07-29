# Pulsebox Application Shell and Controls Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-003`  
**Build order:** 3 of 10  
**Depends on:** [Technical foundations](spec-002-technical-foundations.md)  
**Owns:** Application composition, UI components, navigation, responsive
behavior, and shared control primitives.  
**Acceptance IDs:** `AC-004` through `AC-005`, `AC-042`, `AC-059`, and `AC-064`
through `AC-066` in [release acceptance](spec-012-release-acceptance.md).

---

## 8. Application composition

Pulsebox fills the viewport. Page-level scrolling is not allowed. Major regions
manage their own overflow.

### 8.1 Main rows

1. Application header: approximately 56 to 64 pixels.
2. Main rack and studio workspace: flexible; target at least 430 pixels on
   taller displays and allow a compact minimum near 350 pixels at the supported
   720-pixel height.
3. Collapsible lower editor workspace: approximately 260 to 300 pixels on
   taller displays and approximately 210 to 230 pixels at the supported
   720-pixel height. Use internal scrolling rather than shrinking controls
   below their minimum sizes.
4. Bottom workspace bar: approximately 50 to 52 pixels.

At 1280 × 720, the complete row stack, inter-region gaps, and borders must fit
without page-level scrolling or overlap. The rack and editor manage their own
overflow.

### 8.2 Wide desktop composition

At 1536 × 1024:

- A full-width transport spans the top.
- A unified module browser sits on the far left.
- A narrow rack overview sits beside the browser.
- A large central rack shows six compact modules.
- A compact studio column sits on the right and provides mutually exclusive
  Mixer, Effects, and Master tabs.
- Mixer is the default studio view. Effects and Master replace it inside the
  same column rather than appearing beside or below it.
- Each instrument channel in the Mixer view includes four A–D send buttons in
  a visible 2 × 2 grid.
- Send-chain content appears only in the Effects view. Pulsebox never renders a
  second or persistent duplicate effects bank beside the mixer.
- The lower editor shows the Pattern inspector, one module-aware Piano Roll,
  Pattern timing controls, and the compact named-Pattern Playlist.
- The bottom bar remains visible and can collapse or restore the complete lower
  editor with one action.

The rack remains the central sound-design surface. The studio column stays
compact so mixer routing remains immediately available without taking visual
priority from the rack.

For the shell surfaces covered by this specification,
[`docs/design/claude-mock-up.html`](../design/claude-mock-up.html) is the single
approved composition target. It owns the semantic structure, the interactive
behavior, and the visual proportion, placement, density, materials, typography
scale, and control sizing that an earlier raster study previously carried. There
is no separate image reference; a second target in another medium drifts from
the first and leaves implementers with two conflicting sources.

The product specifications continue to own behavior, state, accessibility, audio
routing, and responsive acceptance. Where the composition target and a product
specification disagree, the specification wins and the target is corrected.
Other files under `docs/design/` remain non-normative visual evidence.

Per decision `D80`, the target displays only true or specification-owned state.
It renders the default project defined in
[rack and instruments](spec-005-rack-and-instruments.md) section 9.1 in its real
stopped state. Structural content is required, because density is one of the
properties this file owns. Staged runtime state is not: no control may display a
value the product would never produce, including parameter readouts that ignore
their own value, meters that show signal while the transport is stopped, and
seeded history. A fixture that improves the picture by showing something
unreachable in the product is a defect in the target.

### 8.3 Pattern and Song transport modes

The application header provides one compact rectangular two-state toggle,
immediately to the left of the transport controls:

- Pattern plays and loops the selected named Pattern.
- Song plays the ordered named-Pattern Playlist.

This toggle changes transport scope. It does not replace the rack or open a
second workspace. The lower editor remains the single place for editing the
selected Pattern and its Playlist context. Switching modes never stops playback.

The MVP has no separate Rack, Edit, Workspace, Performance, Sequencer, or full
Song-timeline navigation mode. Live Pattern launch, a lane-based arrangement
timeline, clip transforms, Song automation, tempo timelines, and time-signature
timelines are post-MVP work.

### 8.4 Compact mixer geometry

The studio mixer uses:

- Eight simultaneously visible instrument channel strips whenever Mixer is the
  active studio view. Empty rack slots retain disabled strips identified by
  their two-digit slot numbers, such as `07` and `08`, and expose their Empty
  state in accessible text.
- One master strip carrying master level, metering, and master-effects bypass.
  It has no A–D grid. The mix bus is not a send source, and its processing is a
  master chain rather than four send chains, so send-bus content belongs to the
  Effects and Master views instead.
- Four A–D send buttons per instrument channel, arranged as a visible 2 × 2
  grid inside the strip. Empty-channel send buttons remain visible but disabled.
- A vertical fader.
- A loudness meter.
- Pan, mute, and solo.
- One fixed compact strip geometry. Selecting a channel must not widen its strip
  or force horizontal mixer scrolling.

The mixer occupies the Mixer tab of the compact studio column. The four send
chains occupy the Effects tab of that same column. The two views are never
visible simultaneously, so effects are not duplicated beside or below the
mixer.

The MVP has eight rack slots, eight corresponding instrument channel strips, and
one master strip. No mixer banking, horizontal scrolling, or channels 9–16 exist
in the MVP.

### 8.5 Studio tabs

The studio region provides:

- Mixer.
- Effects.
- Master.

The three tabs are peers and share one tab strip of equal-width controls. No view
takes a wider tab than the others at any supported width.

At every supported width:

- Mixer is selected by default.
- Mixer presents all eight instrument strips, including disabled empty strips
  identified by two-digit slot number, and one master strip. Each instrument
  strip keeps its 2 × 2 A–D send grid visible. The master strip carries no A–D
  grid.
- Effects replaces the Mixer view and presents the four modular send-chain
  summaries plus detailed-chain entry points.
- Master opens master routing, master-chain, and output metering.
- Only the active studio view is visible and interactive. Inactive panes are
  hidden and removed from keyboard navigation and the accessibility tree.
- The active tab is a UI preference, not core project data.

The compact studio column keeps the approved visual proportion at wide sizes.
Responsive rules may reduce its padding, but they do not create a persistent
second effects region or enlarge it into a dominant mixer surface.

### 8.6 Bottom bar

Left:

- One lower-editor collapse or expand toggle.

Right:

- Undo.
- Redo.
- Save.

Behavior:

- The collapse toggle exposes its expanded state and has a clear accessible
  name in both states.
- Undo and redo disable correctly.
- Save exposes clean, dirty, saving, saved, and error states.
- All actions have keyboard shortcuts and accessible names.
- No button is decorative.
- Collapsing removes the complete lower editor from layout, keyboard navigation,
  and the accessibility tree so the rack receives the available height.
- Expanding restores the editor, its scroll positions, selection, and focus
  context without changing playback or project data.

### 8.7 Responsive behavior

- The minimum supported viewport is 1280 × 720 CSS pixels.
- At 1440 pixels and above, show the complete primary composition.
- From 1280 to 1439 pixels, reduce nonessential padding, allow the module browser to
  collapse, and compact the studio column while keeping the rack and transport
  fully usable. Studio panes remain mutually exclusive at every width.
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

## 10. Component structure

Use the `pulse-` prefix without exceptions.

Recommended hierarchy:

- `pulse-app`
  - `pulse-transport-bar`
  - `pulse-main-workspace`
    - `pulse-module-browser`
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
    - `pulse-playlist-summary`
    - `pulse-automation-editor`
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

Do not create a component for every static wrapper.

Rules:

- Reusable controls and isolated leaves encapsulate their styles.
- The application shell may use unencapsulated styles.
- Use native elements and text nodes rather than markup strings.
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
