# Pulsebox Song and Automation Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-008`  
**Build order:** 8 of 10  
**Depends on:** [Mixer and effects](spec-007-mixer-and-effects.md)  
**Owns:** The ordered named-Pattern Playlist and Pattern step automation.
**Acceptance IDs:** `AC-029` through `AC-030`, `AC-032`, and `AC-070` in
[release acceptance](spec-012-release-acceptance.md).

---

## 18. Song building and Pattern automation

Pulsebox uses one compact Playlist to arrange named Patterns into a Song. The
MVP has no separate full Song workspace or arrangement timeline.

### 18.1 Named-Pattern Playlist

The Playlist orders placements of the same named Patterns edited in the Piano
Roll. A row is not a separate Section or Scene record.

Each row contains:

- Order.
- Referenced Pattern name and color.
- Pattern duration in bars.
- Repeat count.
- Selected state.
- Drag handle.
- Menu.

Interactions:

- Select.
- Choose a named Pattern for a placement.
- Change repeat count.
- Reorder.
- Duplicate.
- Delete.
- Add.
- Undo and redo.

The user edits Pattern names on the shared Pattern record. Playlist rows do not
copy Pattern names.

On compact layouts, Playlist action buttons use original inline SVG icons. Each
icon-only button has a full accessible name and a tooltip. The mode and Add
controls also use icons. Pattern names and repeat counts remain visible.

In Pattern mode, the transport loops the selected named Pattern. In Song mode,
it plays Playlist rows in order, honoring each row's repeat count. Switching
modes does not stop playback. A repeated placement keeps each independent drum
voice cycle in phase until that placement ends. A new placement starts a new
phase. Playlist edits are project-owned and undoable.

Live Pattern launch, lane-based timeline editing, clip-level transforms, loop
markers, Song automation, tempo automation, and time-signature timelines are
post-MVP work.

### 18.2 Pattern automation

Any automatable parameter may have a lane in a Pattern.

The user edits every automation lane in the Piano Roll's active lower lane and
nowhere else. [Pattern editing](spec-006-pattern-editing.md) section 16.3.1
defines this rule. This section owns what a lane stores and how it records. That
section owns how the user chooses and displays a lane. The user chooses
module-owned parameters from the Piano Roll's module-scoped Parameter selector.

The user arms mixer, send, effect, and master parameters from their own surface.
They then open in the same Piano Roll lane.

Automation is step-based only. It stores discrete values on the fixed 1/16
musical grid. It does not store line segments, curve segments, or dense
freehand points.

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

Whenever the user arms transport Record, each deliberate parameter movement
records automatically into the active Pattern's target lane. This rule applies
in both Pattern and Song transport modes. The resulting take is one undoable
command.

If the Pattern has no part for that loaded module, its first automation step
creates an empty 16-step part for the module.

Within one 1/16 cell, the last recorded value wins. The engine holds it until
the next automation step. One gesture or recording pass creates one undo entry.
Playback modulation, meters, playheads, theme changes, state restoration, and
generated patches never write automation.

---
