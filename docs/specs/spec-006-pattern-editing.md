# Pulsebox Pattern Editing Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-006`  
**Build order:** 6 of 10  
**Depends on:** [Rack and instruments](spec-005-rack-and-instruments.md)  
**Owns:** Named project Patterns, the module-aware Piano Roll as the single
pattern editing surface and the single automation-lane editing surface, live
input, generators, and transforms.
**Acceptance IDs:** `AC-011` through `AC-017`, `AC-069`, `AC-072`, `AC-079`, and
`AC-086` in
[release acceptance](spec-012-release-acceptance.md).

---

## 16. Patterns and the module-aware Piano Roll

### 16.0 Pattern inspector

- Pattern name, default `Verse` in the supplied project.
- Previous and next.
- Duration in bars.
- Scale, default Chromatic. The MVP offers Chromatic, Minor, Dorian, Phrygian,
  and Pentatonic.
- Add.
- Duplicate.
- Rename.
- Delete.
- Pattern color.
- Launch quantization.

The Playlist always lets the user build a Song beside the inspector. It uses the
same named Patterns and does not introduce Section or Scene entities. The
inspector has no Pattern/Song tabs.

### 16.1 One pattern editing surface

The Piano Roll is the only surface that edits Pattern event data. No other view
creates, deletes, or modifies steps, notes, or triggers.

Rack module faceplates carry no step grid, no per-step editing, and, per
decision `D78`, no Pattern activity indicator or other step-shaped readout. A
faceplate provides the audition control that
[rack and instruments](spec-005-rack-and-instruments.md) section 15 defines.
Playback position feedback lives in the Piano Roll playhead, the pattern
position readout, and the transport clock.

This rule gives the user one place to edit a Pattern. A second faceplate grid
cannot show accent, tie, slide, and probability. It also cannot show
micro-timing, page position, or parts longer than sixteen steps. Within the
module height limit, it would show an incomplete and misleading copy of the
same data.

Patterns longer than sixteen steps use sixteen-step pages in the Piano Roll with
a visible page indicator. Enable playback follow by default. It advances the
displayed page with the playhead. The user may lock the viewed page while
playback continues.

### 16.2 Named project Patterns

A project owns between 1 and 32 named Patterns. A Pattern is a complete
multi-module musical block. Section and Scene are not separate user-facing terms
or stored entities.

Each Pattern has:

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

The UI identifies Patterns by names such as `Intro`, `Verse`, `Break`,
`Drop`, and `Outro`. The UI never presents a compound module-and-pattern number
such as `1 - 1`. When the user reorders a Pattern, its stable ID and name do not
change.

### 16.3 Module-aware Piano Roll

The user sees one editor named Piano Roll. Its interaction mode comes from the
selected module's declared event capability. The MVP implements only:

- `monophonic-pitched` for monophonic synths.
- `drum-triggers` for drum machines.

The architecture may reserve a `polyphonic-pitched` capability, but the MVP has
no polyphonic synth implementation or acceptance requirement. There is no
separate user-facing Sequencer or Drum Grid.

Shared header:

- Toolbar.
- Module or lane selector.
- Four-bar timeline header by default.
- Fixed 1/16 grid status.
- Horizontal Swing slider. It edits the one global project Swing value, so its
  position is the same on every Pattern.
- Horizontal Humanize slider. The selected Pattern owns its value.
- Both timing sliders default to 0 percent. Their travel is tapered: the first
  30 percent of the value takes 60 percent of the track. The mouse wheel steps
  the value by two percent, or by one percent with Shift held. Each slider
  reports the true percent to assistive technology.
- Parameter selector, default Velocity. Do not show a static `Vel 100` label.
  It is the single entry point to every lane the Piano Roll edits, as defined
  in section 16.3.1.
- Zoom controls.
- Timeline.
- Scrollable grid.
- One active lower lane, as defined in section 16.3.1.
- Horizontal and vertical zoom.
- Current playhead.
- Selection overlay.
- Ghost notes, as defined in section 16.3.2.

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
Direct pointer gestures create, delete, move, and resize events.
Right-click deletion is not the only delete path: Delete or Backspace removes
the selected note during keyboard operation.

Monophonic pitched mode:

- Shows a vertically scrollable ivory-and-black piano keybed. Each chromatic key
  aligns with one pitch row in the grid.
- Each key is a momentary pitch audition control. Pointer or Space and Enter
  hold the exact pitch. Release, lost capture, or lost focus stops it.
- Key audition changes no Pattern data, project state, transport position, or
  Undo history. It uses the selected module's current sound and routing.
- Natural and sharp keys use geometry and labels as well as color. Each visible
  key target is at least 24 by 24 CSS pixels.
- Prevents overlapping sounding notes in the module part.
- Left-click creates a note.
- Right-click deletes a note with Undo available.
- Drag the note body to move it. Drag either edge to resize it.
- Slide is an explicit note property. The UI shows it with a non-color cue.
- Scale, key, scale lock, snap-to-scale, and out-of-scale shading apply only in
  this mode.

Drum trigger mode:

- Shows one named voice row per drum voice.
- Allows simultaneous triggers on different rows.
- Left-click adds one fixed one-cell trigger.
- Left-drag paints fixed one-cell triggers.
- Right-click deletes a trigger with Undo available.
- Triggers have no duration edge. Do not resize them.
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

#### 16.3.1 Parameter selector and the active lane

The Piano Roll owns every lane a Pattern can hold. The Parameter selector in the
shared header is the only control that lets the user choose a lane. There is no
second lane picker, no per-lane add button in the rack, and no automation editor
outside the Piano Roll.

The selected module sets the selector scope. The selector offers exactly two
groups:

- Note properties supported by the selected module's declared event capability,
  drawn from the per-note property list above.
- Automatable parameters declared by the selected module's plugin manifest,
  including its voice parameters, in manifest order.

When the module selection changes, the selector changes its scope. It never
shows mixer, send, effect, or master parameters because modules do not own them.
Arm those lanes from their own surface, as required by
[mixer and effects](spec-007-mixer-and-effects.md). The lanes then open in this
same Piano Roll lane. Regardless of the source, edit the lane only here.

Exactly one lane is active and visible at a time. When the user chooses a
parameter, it replaces the displayed lane. It never stacks a second lane or
resizes the grid. Hidden lanes keep their data. The selector marks parameters
that have data in the active Pattern. This mark helps the user find existing
automation without opening each entry.

The selector lists a parameter even when no lane exists for it. If the user
selects that parameter, the selector shows an empty lane at the current value.
This action creates no project data. The first committed edit creates a lane
record and one undoable command. When the user erases every step, the store
removes the lane on commit. It does not keep an empty record.

The active lane obeys the automation rules in
[song and automation](spec-008-song-and-automation.md) section 18.2. It uses
step-based values on the fixed 1/16 grid. You can draw, erase, select, move,
and scale step values. Note-property lanes edit the selected events, not a
separate automation record.

Therefore, a note property has no lane record. When the user erases its lane
content, the property resets to its default. The notes remain.

The selector is keyboard reachable, announces the active parameter and its
group, and reports when a listed parameter has existing data.

#### 16.3.2 Ghost notes and ghost lanes

Ghost notes show events from non-selected modules in the same Pattern. They
appear behind the active module's events. A user can then place events against
the rest of the Pattern without a module change.

- Ghosts show output only. They accept no pointer or keyboard input. They cannot
  receive focus or selection. An edit for the active module never moves,
  deletes, or transforms them.
- Ghosts are visually recessed and use a non-color cue. Therefore, the distinction
  survives the accessible themes required by
  [product and design foundations](spec-001-product-and-design-foundations.md).
- Ghosts follow the module's assigned color where color is available.
- Ghost display is a local view preference. It is not project data. Portable
  files exclude it, and it creates no undo entry.

The same rule applies to the lower lane. The active lane may show lanes from
non-selected modules as recessed ghost content. These ghosts obey the same
output-only constraints. This preserves the single-editing-surface rule in
section 16.1. A ghost is a reference view of data. Select its owning module to
edit that data.

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
- Record into the active Pattern.
- Quantize on input.
- Quantize after recording.
- Record without quantize.
- Configurable count-in.
- Configurable metronome.
- One take or logical group creates one undo entry.

Musical input uses physical `KeyboardEvent.code` positions. Text fields use
normal typed characters. Show the musical map. Let the user remap it.

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
