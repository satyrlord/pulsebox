# Pulsebox Pattern Editing Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-006`  
**Build order:** 6 of 10  
**Depends on:** [Rack and instruments](spec-005-rack-and-instruments.md)  
**Owns:** Named project Patterns, the module-aware Piano Roll, live input,
generators, and transforms.
**Acceptance IDs:** `AC-011` through `AC-017`, `AC-069`, `AC-072`, and
`AC-079` in
[release acceptance](spec-012-release-acceptance.md).

---

## 16. Patterns and the module-aware Piano Roll

### 16.0 Pattern inspector

- Pattern name, default `Verse` in the supplied project.
- Previous and next.
- Duration in bars.
- Scale, default Chromatic.
- Add.
- Duplicate.
- Rename.
- Delete.
- Pattern color.
- Launch quantization.

The Playlist is always the compact Song-building surface beside the inspector.
It uses the same named Patterns and does not introduce Section or Scene
entities. The inspector has no Pattern/Song tabs.

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

### 16.2 Named project Patterns

A project owns between 1 and 32 named Patterns. A Pattern is the complete
multi-module musical block previously described as a section. Section and Scene
are not separate user-facing terms or stored entities.

Each pattern has:

- Stable ID.
- Name.
- Color.
- Duration in bars.
- Seed.
- One compatible event part for each participating module, keyed by stable
  module ID.
- Automation references.
- Created and modified metadata.

Capabilities:

- Copy.
- Paste.
- Duplicate.
- Rename.
- Delete.
- Generate variation.
- Copy or move compatible events between module parts.
- Quantized switching.
- Playlist placement.

A module part has a nominal 1–64-step cycle inside its owning Pattern. The cycle
repeats across the Pattern's bar duration. Each drum voice may override its own
cycle length and wraps independently inside that part. Per-voice grid resolution
is post-MVP.

Patterns are identified to users by names such as `Intro`, `Verse`, `Break`,
`Drop`, and `Outro`. The UI never presents a compound module-and-pattern number
such as `1 - 1`. Reordering a Pattern does not change its stable ID or name.

### 16.3 Module-aware Piano Roll

The user sees one editor named Piano Roll. Its interaction mode comes from the
selected module's declared event capability. The MVP implements only:

- `monophonic-pitched` for monophonic synths;
- `drum-triggers` for drum machines.

The architecture may reserve a `polyphonic-pitched` capability, but the MVP has
no polyphonic synth implementation or acceptance requirement. There is no
separate user-facing Sequencer or Drum Grid.

Shared header:

- Toolbar.
- Module or lane selector.
- Four-bar timeline header by default.
- Fixed 1/16 grid status.
- Horizontal Swing slider.
- Horizontal Humanize slider.
- Lower-lane selector, default Velocity, in place of a static `Vel 100` label.
- Zoom controls.
- Timeline.
- Scrollable grid.
- Velocity lane.
- Automation lanes.
- Horizontal and vertical zoom.
- Current playhead.
- Selection overlay.
- Ghost note preview.

Shared interactions:

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
- Alt-drag temporary unsnapped override.
- Prevent invalid pitch or time.
- Undo and redo for every committed edit.

The Piano Roll header has no local Play button and no persistent pen or erase
tools. Pattern playback uses Pattern mode and the global transport Play control.
Direct pointer gestures perform creation, deletion, movement, and resizing.
Right-click deletion is not the only delete path: Delete or Backspace removes
the selected note for keyboard users.

Monophonic pitched mode:

- Shows piano-key pitch rows.
- Prevents overlapping sounding notes in the module part.
- Left-click creates a note.
- Right-click deletes a note with Undo available.
- Dragging the note body moves it; dragging either edge resizes it.
- Slide is an explicit note property and is shown with a non-color cue.
- Scale, key, scale lock, snap-to-scale, and out-of-scale shading apply only in
  this mode.

Drum trigger mode:

- Shows one named voice row per drum voice.
- Allows simultaneous triggers on different rows.
- Left-click adds one fixed one-cell trigger.
- Left-drag paints fixed one-cell triggers.
- Right-click deletes a trigger with Undo available.
- Triggers have no duration edge and cannot be resized.
- Voice cycle lengths may differ and wrap independently.
- Advanced trigger properties remain keyboard-accessible and do not depend on
  a context menu.

Per-note or trigger properties where supported by the selected module:

- Velocity.
- Accent.
- Slide.
- Probability.
- Micro-timing.
- Duration.

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

### 16.4 Live input

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

### 16.5 Generators and transforms

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

