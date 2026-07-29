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

### 16.1 One pattern editing surface

The Piano Roll is the only surface that edits Pattern event data. No other view
creates, deletes, or modifies steps, notes, or triggers.

Rack module faceplates carry no step grid and no per-step editing. A faceplate
shows non-editing Pattern activity and provides the audition control defined in
[rack and instruments](spec-005-rack-and-instruments.md) section 15. Pattern
activity is an output-only indicator: it never accepts pointer or keyboard
input, and it is not a paged or scrubbable view of step data.

This rule exists so that a user learns exactly one place to edit a Pattern. A
second editing grid on the faceplate cannot show accent, tie, slide,
probability, micro-timing, page position, or parts longer than sixteen steps
within the module height budget, so it would present an incomplete and
misleading copy of the same data.

Patterns longer than sixteen steps use sixteen-step pages in the Piano Roll with
a visible page indicator. Playback follow is enabled by default and advances the
displayed page with the playhead. The user may lock the viewed page while
playback continues.

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
- Horizontal Swing slider. It edits the one global project Swing value, so its
  position is the same on every Pattern.
- Horizontal Humanize slider, owned by the selected Pattern.
- Parameter selector, default Velocity, in place of a static `Vel 100` label.
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

#### 16.3.1 Parameter selector and the active lane

The Piano Roll owns every lane a Pattern can hold. The Parameter selector in the
shared header is the only control that chooses which lane is edited. There is no
second lane picker, no per-lane add button in the rack, and no automation editor
outside the Piano Roll.

The selector is scoped to the selected module. It offers exactly two groups:

- Note properties supported by the selected module's declared event capability,
  drawn from the per-note property list above.
- Automatable parameters declared by the selected module's plugin manifest,
  including its voice parameters, in manifest order.

Changing the module selection re-scopes the selector. Mixer, send, effect, and
master parameters are not module-owned and therefore never appear in it; those
lanes are armed from their own surface, as required by
[mixer and effects](spec-007-mixer-and-effects.md), and open in this same Piano
Roll lane once armed. Whatever the source, the lane is edited only here.

Exactly one lane is active and visible at a time. Choosing a parameter replaces
the displayed lane; it never stacks a second lane and never resizes the grid.
Lanes that hold data are not lost when hidden, and the selector marks which
parameters already have data in the active Pattern so a user can find existing
automation without opening each entry in turn.

The selector lists a parameter whether or not a lane exists for it yet.
Selecting a parameter with no lane shows an empty lane at the parameter's
current value and creates no project data. A lane record is created by the first
committed edit, which is one undoable command. A lane emptied by erasing every
step is removed on commit rather than persisting as an empty record.

The active lane obeys the automation rules in
[song and automation](spec-008-song-and-automation.md) section 18.2: step-based
values on the fixed 1/16 grid, with step draw, erase, select, move, and scale
values. Note-property lanes edit the selected events rather than a separate
automation record, so a note property has no lane record of its own and erasing
its lane content resets the property to its default instead of deleting notes.

The selector is keyboard reachable, announces the active parameter and its
group, and reports when a listed parameter has existing data.

#### 16.3.2 Ghost notes and ghost lanes

Ghost notes show the events of non-selected modules in the same Pattern behind
the active module's events, so a user can place events against the rest of the
Pattern without switching modules.

- Ghosts are output only. They never accept pointer or keyboard input, are not
  focusable, are never selected by marquee or select-all, and are never moved,
  deleted, or transformed by an edit aimed at the active module.
- Ghosts are visually recessed and use a non-color cue in addition to color, so
  the distinction survives the accessible themes required by
  [product and design foundations](spec-001-product-and-design-foundations.md).
- Ghosts follow the module's assigned color where color is available.
- Ghost display is a local view preference. It is not project data, is not
  included in portable files, and creates no undo entry.

The same rule applies to the lower lane: the active lane may show the
corresponding lane of non-selected modules as recessed ghost content under the
same output-only constraints. This preserves the single-editing-surface rule of
section 16.1, because a ghost is a reference image of data that is edited by
selecting its owning module.

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
