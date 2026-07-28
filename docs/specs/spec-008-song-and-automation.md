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

Pattern names are edited on the shared Pattern record, not copied onto each
Playlist row.

In Pattern mode, the transport loops the selected named Pattern. In Song mode,
it plays Playlist rows in order, honoring each row's repeat count. Switching
modes does not stop playback. Playlist edits are project-owned and undoable.

Live Pattern launch, lane-based timeline editing, clip-level transforms, loop
markers, Song automation, tempo automation, and time-signature timelines are
post-MVP work.

### 18.2 Pattern automation

Any automatable parameter may have a lane in a Pattern.

Every automation lane is edited in the Piano Roll's active lower lane and
nowhere else, as defined in
[pattern editing](spec-006-pattern-editing.md) section 16.3.1. This section owns
what a lane stores and how it records; that section owns how a lane is chosen
and displayed. Module-owned parameters are chosen from the Piano Roll's
module-scoped Parameter selector. Mixer, send, effect, and master parameters are
armed from their own surface and then open in the same Piano Roll lane.

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

Whenever transport Record is armed, every deliberate user parameter movement
records automatically into the active Pattern's target lane. This is true in
both Pattern and Song transport modes. The resulting take is one undoable
command.

Within one 1/16 cell, the last recorded value wins and is held until the next
automation step. One gesture or recording pass creates one undo entry. Playback
modulation, meters, playheads, theme changes, state restoration, and generated
patches never write automation.

---
