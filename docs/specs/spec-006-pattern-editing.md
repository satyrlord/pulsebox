# Pulsebox Pattern Editing Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-006`  
**Build order:** 6 of 10  
**Depends on:** [Rack and instruments](spec-005-rack-and-instruments.md)  
**Owns:** Pattern banks, compact sequencing, piano roll, drum grid, live input,
generators, and transforms.  
**Acceptance IDs:** `AC-011` through `AC-017`, `AC-069`, and `AC-072` in
[release acceptance](spec-012-release-acceptance.md).

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

