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

Pulsebox fills the viewport. Do not allow page-level scrolling. Major regions
manage their own overflow.

### 8.1 Main rows

1. Application header: approximately 56 to 64 pixels.
2. Main rack and studio workspace: flexible. Target at least 430 pixels on
   taller displays. Allow a compact minimum near 350 pixels at the supported
   720-pixel height.
3. Lower editor workspace: collapsible. Use approximately 260 to 300 pixels on
   taller displays. Use approximately 210 to 230 pixels at the supported
   720-pixel height. Use internal scrolling. Do not shrink controls below their
   minimum sizes.
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

Parameter readouts must track their values. Meters show no signal while the
transport is stopped. Do not seed history. No control can show a value that the
product cannot produce.

### 8.3 Pattern and Song transport modes

The application header provides one compact rectangular two-state toggle,
immediately to the left of the transport controls:

- Pattern plays and loops the selected named Pattern.
- Song plays the ordered named-Pattern Playlist.

This toggle changes transport scope. It does not replace the rack or open a
second workspace. The lower editor remains the single place for editing the
selected Pattern and its Playlist context. A mode change never stops playback.

The MVP has no separate Rack, Edit, Workspace, Performance, Sequencer, or full
Song-timeline navigation mode. Live Pattern launch, a lane-based arrangement
timeline, clip transforms, Song automation, tempo timelines, and time-signature
timelines are post-MVP work.

### 8.4 Compact mixer geometry

For the studio mixer:

- Show eight instrument channel strips when Mixer is the active studio view.
  Keep all eight strips visible at the same time. Empty rack slots retain
  disabled strips. Each disabled strip shows its two-digit slot number, such as
  `07` or `08`, and exposes its Empty state in accessible text.
- Show one master strip with master level, metering, and master-effects bypass.
  It has no A–D grid. The mix bus is not a send source. Its processing uses a
  master chain, not four send chains. Therefore, send-bus content belongs to the
  Effects and Master views.
- Arrange four A–D send buttons in a visible 2 × 2 grid inside each instrument
  strip. Keep empty-channel send buttons visible but disabled.
- A vertical fader.
- A loudness meter.
- Pan, mute, and solo.
- One fixed compact strip geometry. A channel selection must not widen its strip
  or force horizontal mixer scrolling.

The mixer occupies the Mixer tab of the compact studio column. The four send
chains occupy the Effects tab of that same column. The two views are never
visible simultaneously. Pulsebox does not duplicate effects beside or below the
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

- Pulsebox selects Mixer by default.
- Mixer presents all eight instrument strips and one master strip. Disabled
  empty strips show a two-digit slot number. Each instrument strip keeps its
  2 × 2 A–D send grid visible. The master strip carries no A–D grid.
- Effects replaces the Mixer view and presents the four modular send-chain
  summaries plus detailed-chain entry points.
- Master opens master routing, master-chain, and output metering.
- Show only the active studio view. Make only that view interactive. Hide
  inactive panes. Remove them from keyboard navigation and the accessibility
  tree.
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
- When the user collapses the lower editor, remove it from the layout, keyboard
  navigation, and accessibility tree. The rack then receives the available
  height.
- When the user expands the editor, restore its scroll positions, selection,
  and focus context. Do not change playback or project data.

### 8.7 Responsive behavior

- The minimum supported viewport is 1280 × 720 CSS pixels.
- At 1440 pixels and above, show the complete primary composition.
- From 1280 to 1439 pixels, reduce nonessential padding. Allow the module browser
  to collapse. Compact the studio column. Keep the rack and transport fully
  usable. Studio panes remain mutually exclusive at every width.
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

Use the React component model for the complete UI layer. Name components in
PascalCase. Give each rendered component root a kebab-case `data-component`
hook for tests.

Reserve the `pulse-` prefix for CSS custom properties and storage keys. Do not
use it as a React component-name prefix.

Recommended hierarchy:

- `PulseApp`
  - `TransportBar`
  - `MainWorkspace`
    - `ModuleBrowser`
    - `RackOverview`
    - `Rack`
      - `RackModule`
      - `PatternStrip`
    - `StudioPanel`
      - `Mixer`
        - `ChannelStrip`
        - `MasterStrip`
      - `EffectsBank`
        - `EffectSlot`
  - `EditorWorkspace`
    - `PatternInspector`
    - `PianoRoll`
    - `PlaylistSummary`
    - `AutomationEditor`
  - `WorkspaceBar`
  - shared controls:
    - `Knob`
    - `Fader`
    - `LevelMeter`
    - `Led`
    - `Toggle`
    - `SegmentDisplay`
    - `Tooltip`
    - `ContextMenu`
    - `ValuePopover`
    - `Dialog`
    - `CurveEditor`

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

Use the shared `Knob` React component.

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

Use the shared `Fader` React component.

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

- Use Canvas for channel and master meters that update frequently.
- No DOM allocation per frame.
- Green, amber, and red regions.
- Peak hold.
- Smooth decay.
- No random motion while stopped.
- If the UI exposes no meaningful numerical value, hide the meter from
  assistive technology.
- Meter animation never triggers component-tree rerenders.

### 22.5 Playheads and curves

- Playheads use Canvas or direct transforms.
- Filter, EQ, envelope, and waveform curves plus automation step graphs use
  Canvas or SVG.
- No per-frame allocation.
- Reduced-motion mode limits nonessential animation without hiding position.

---
