# Pulsebox Song and Automation Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-008`  
**Build order:** 8 of 10  
**Depends on:** [Mixer and effects](spec-007-mixer-and-effects.md)  
**Owns:** Arrangement, sections, clips, scenes, time signatures, and step
automation.  
**Acceptance IDs:** `AC-029` through `AC-030`, `AC-032`, `AC-070`, `AC-079`,
and `AC-085` in [release acceptance](spec-012-release-acceptance.md).

---

## 18. Song building

Pulsebox provides both a compact playlist summary and a full Song workspace.

### 18.1 Compact section navigator

Each row contains:

- Position.
- Name.
- Duration in bars.
- Selected state.
- Drag handle.
- Menu.

Interactions:

- Select.
- Rename.
- Change duration.
- Reorder.
- Duplicate.
- Delete.
- Add.
- Assign patterns or scenes.
- Undo and redo.

### 18.2 Full arrangement timeline

- One lane per rack slot.
- Pattern clips.
- Clip repetition by resizing.
- Move clips.
- Copy clips.
- Duplicate clips.
- Clip-level transpose.
- Clip-level velocity scale.
- Clip-level probability.
- Loop markers.
- Bar ruler.
- Time-signature events.
- Tempo automation.
- Horizontal zoom.
- Track-height control.

### 18.3 Scenes

A scene stores:

- Name.
- Color.
- Active pattern per rack slot.
- Launch quantization.

Capabilities:

- Trigger live.
- Place on timeline.
- Duplicate.
- Rename.
- Reorder.
- Delete.
- Undo and redo.

### 18.4 Automation

Any automatable parameter may have a lane.

Automation is step-based only. It stores discrete values on a musical automation
grid. It does not store line segments, curve segments, or dense freehand points.

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
- Tempo.

Time signature is not a parameter and has no automation lane. A time-signature
event is a structural Song command attached to a bar boundary. It stores a
numerator from 1 through 32 and a denominator of 1, 2, 4, 8, 16, or 32. Moving,
creating, or deleting one event is undoable. Recording parameter movement never
creates or changes a time-signature event.

Song always has one non-deletable time-signature anchor at tick 0. Later events
are unique and ordered by tick. A later event is on a bar boundary only when its
distance from the preceding event is an exact multiple of that preceding
signature's bar length, `numerator * 960 * 4 / denominator` ticks. Any edit
revalidates all later events atomically as defined in `PROJECT-FORMAT.md`.

Whenever transport Record is armed, every user parameter movement records
automatically into the target parameter lane. The resulting take is one undoable
command.

In Pattern mode, recording writes to the active pattern. In Song mode, it writes
to the arrangement timeline. Automation capture uses a dedicated musical grid,
default 1/16. Within one grid cell, the last recorded value wins and is held
until the next automation step. One gesture or recording pass creates one undo
entry. Only deliberate user input records; playback modulation, meters,
playheads, theme changes, state restoration, and generated patches never write
automation.

---

