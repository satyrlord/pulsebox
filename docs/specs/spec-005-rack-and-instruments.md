# Pulsebox Rack and Instruments Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-005`  
**Build order:** 5 of 10  
**Depends on:** [Audio engine and transport](spec-004-audio-engine-and-transport.md)  
**Owns:** Default projects, the unified module browser, rack behavior, and instrument
modules.  
**Acceptance IDs:** `AC-007` through `AC-010`, `AC-021`, `AC-077`, and
`AC-080` in [release acceptance](spec-012-release-acceptance.md).

---

## 9. Default projects and initial state

### 9.1 Default project

Project name: `Neon Basement`

Transport and timing:

- Tempo: 128.0 BPM.
- Time signature: 4/4.
- Pattern length: 16 steps.
- Grid: 1/16.
- Swing: 0%, global to the project.
- Humanize: 0%.
- Quantize strength: 100%.
- Transport: stopped.
- Instrument channel level: approximately -8 dB on every occupied slot, so the
  supplied six-module mix leaves master headroom.
- Master level: approximately -6 dB.
- New-installation UI theme: `rack`, stored as a global preference rather than
  project state.

Rack order:

1. Silver Serpent.
2. Tin Soldier.
3. Soft Thunder.
4. Twin Engine.
5. Gray Ghost.
6. Dusty Mosaic.
7. Empty.
8. Empty.

The MVP rack contains exactly eight slots.

Default named Patterns: Intro, Verse, Break, Drop, and Outro. Each Pattern is
one bar of sixteen steps.

The default Song chain plays the Patterns in this order:

1. Intro, 8 bars.
2. Verse, 16 bars.
3. Break, 8 bars.
4. Drop, 16 bars.
5. Outro, 8 bars.

A bar count is the entry's repeat count in the chain. The chain ships
disabled. Song mode plays the chain when the user enables it. Decision `D92`
records this reading of the bar counts.

Select Verse by default.

Default send effects:

- A: Analog echo.
- B: Plate reverb.
- C: Stereo width.
- D: Drive.

Default master chain:

1. Compressor.
2. Parametric EQ.
3. Limiter.

The limiter occupies the protected final slot and starts enabled.

Create an original coherent demo loop. Do not use copied patterns, presets,
samples, or note data.

### 9.2 Starter template

Pulsebox has one built-in template, `Neon Basement`. It creates a fresh copy of
the section 9.1 default project. The template has no separate rack order, tempo,
pattern set, or note data. Section 9.1 is the single owner of that content.

A new installation opens the same content on first start, so the startup project
and the template stay identical by construction.

The user creates a fresh project from the template through the project selector.
Before replacement, Pulsebox saves the current project. If that save fails,
Pulsebox keeps the current project active and reports that the template was not
created. A successful action creates a new project and lineage ID, and the new
project starts with empty Undo history.

After replacement, Pulsebox stores the fresh copy at once. Both projects then
appear in the project selector, and the save control does not report unsaved
edits for a project the user has not edited. When storage is unavailable,
Pulsebox still creates the fresh project and leaves it unsaved.

---

## 13. Module browser and rack overview

### 13.1 Unified module browser

The module browser has one list with no tabs. It does not split the same module
definitions into separate Rack and Library views.

Browser content:

- Category or filter control.
- Six instrument definitions.
- Original SVG icon from the module manifest, rendered in the module accent.
- Short label.
- Full name.
- Type description in the card tooltip.
- Useful empty state.

Interactions:

- Double-click to add to the first empty slot.
- Drag the complete module card into a specific slot.
- Keyboard Add command.
- No screenshot thumbnails.

Do not add a separate drag handle or inspection panel. The complete module card
is the drag surface. Keep the type description out of the fixed card text.

### 13.2 Rack overview

Requirements:

- Slots 01 through 08.
- If the slot list does not fit, use internal scrolling.
- Miniature loaded cards.
- Empty labels and add controls.
- Selected border and accent marker.
- Two-digit slot number.
- No persistent Add or Remove buttons below the slot list. The plus control in
  each empty slot is the only visible Add action in the overview.
- A loaded module's context menu contains Duplicate, Swap, and `Delete module`.
  Open it with right-click, the Menu key, or Shift+F10.
- Do not show separate Select, Duplicate, or Swap buttons. Select a module with
  its loaded overview card. The context menu owns Duplicate and Swap.
- Disabled states are visible and semantic.
- Rack action hit targets remain distinct from module controls and do not
  overlap them at any supported viewport.
- Overview-only mode shows all slots as compact strips.

Interactions:

- Select a slot and scroll its full module into view.
- Reorder by custom pointer drag.
- Use pointer capture.
- Show insertion marker.
- Support keyboard reorder.
- Announce results through an ARIA live region.
- Preserve module IDs, named-Pattern parts, automation, mixer routing, and effect chains
  when reordered.
- Delete a loaded module through `Delete module` in its context menu. The menu
  is not right-click-only: it is focusable, keyboard-operable, and exposes the
  same command through the standard keyboard context-menu gesture.

---

## 14. Rack behavior

The MVP rack holds eight slots. Any slot can hold any instrument. The MVP allows
duplicates.

The engine, state, plugin, and UI contracts remain slot-count agnostic. Sixteen
rack slots are an explicit post-MVP target, but the approved MVP and its
acceptance criteria remain capped at eight.

Each slot supports:

- Enable or bypass.
- Mute.
- Solo.
- Output routing.
- Swap.
- Duplicate.
- Remove.
- Reorder.
- Module menu.
- Selection.
- Visible level.
- Audition, as defined in section 15.0.

A loaded faceplate shows all expanded control groups in one horizontal row.
Control groups do not wrap to a second line. The groups are Sound, Voice when
the module has voice controls, and Output. Each group has one disclosure
control. A user can collapse or expand groups independently when the row does
not fit. Keep Output at the right edge. Sound and Voice use the flexible lane.

Group disclosure is transient component state. It does not enter project data,
local storage, portable files, or Undo history. A collapsed group hides its
controls from the layout, keyboard order, and accessibility tree.

The full-rack empty slot is a compact identity row. The rack overview and the
module browser own the visible Add actions.

Reordering a module:

- The pull handles on the module's rack ears are the drag affordance.
  When the user drags either handle, the module moves up or down the rack.
- The drag uses pointer capture and shows an insertion marker at the position
  where the module will land. When the user releases the pointer, the store
  commits the move. If the user presses Escape, the drag stops without a change.
- A committed move is one undo entry.
- Keyboard reorder on the focused module commits the same move.
- A committed move renumbers slots and follows section 13.2. Module IDs,
  named-Pattern parts, automation, mixer routing, and effect chains stay with
  the module. An ARIA live region announces the result.
- A reorder does not interrupt playback.

Removing a module:

- Starts from `Delete module` in the loaded module's context menu. There is no
  separate minus button in the rack overview.
- Happens immediately with no confirmation dialog and exposes Undo.
- Releases its audio resources safely.
- Clears its matching mixer channel and leaves the corresponding disabled
  visible strip labeled `Empty`. It never creates a mixer bank.
- Preserves full recovery data in undo history.
- Undo restores the module, its named-Pattern parts, mixer state, automation, sample
  references, and effect chains.

Swapping a module:

- Replaces the plugin.
- Preserves sequence data where event mapping is valid.
- Keeps all sequence data in place. An event the new plugin cannot map to a
  voice does not sound. Swapping back restores it unchanged.
- Reports unmapped data before or after the operation through a non-blocking
  result panel. The panel states the count of events with no voice on the new
  module.
- The panel clears itself after about twelve seconds, and the user can dismiss
  it sooner. It also clears on Undo, on Redo, and when another project replaces
  the working project, because its count describes the swapped module only.
- Is undoable.
- Does not interrupt unrelated audio.

Each loaded module is approximately 66 to 74 pixels high at a supported
viewport. Each full-rack empty slot is approximately 38 pixels high.

---

## 15. Instrument modules

Each instrument has:

- Compact rack faceplate.
- Expanded editor.
- Stable parameter IDs.
- Audition control.
- Per-module output level.
- Mute and solo.
- Rack-only pedalboard access.
- Metering.
- Original visualization.
- Full keyboard accessibility.
- Automation support.

Only the instrument rack opens a module pedalboard. Mixer channels and the
Effects studio do not expose a second module-chain editor.

Compact faceplates expose the established fast-control set defined for each
instrument below. The controls use the one-row groups from section 14.
Additional synthesis, sample, voice, pedalboard, and routing parameters live in the
playback-safe expanded editor. Faceplate pages are not user-configurable in the
MVP.

Faceplates contain no step grid and no per-step editing. Edit all Pattern events
in the Piano Roll, as required by
[pattern editing](spec-006-pattern-editing.md) section 16.1. The horizontal
space that a faceplate would otherwise spend on a step grid carries the
promoted fast controls listed for each instrument below.

### 15.0 Audition

Per decision `D78`, the faceplate carries no Pattern activity indicator and no
other step-shaped readout. Playback position feedback lives in the Piano Roll
playhead, the pattern position readout, and the transport clock. Do not restore a
step-shaped indicator to the faceplate. It would reintroduce the second apparent
pattern editor that decisions `D65` and `D78` removed.

Audition control:

- One control per module faceplate.
- Sounds the module while held and stops when released. Pointer press and
  release, and keyboard Space or Enter press and release, drive the same
  behavior.
- Uses the module's current faceplate parameter values, so a parameter change
  is audible on the next audition without touching the Pattern.
- For a drum module, sounds the voice currently chosen in the voice selector.
- For a pitched module, sounds the module's audition pitch, which defaults to
  the Pattern's key or to a documented fixed pitch when no key applies.
- Writes nothing. It never creates, deletes, or modifies Pattern events. It never
  mutates project state or creates an Undo entry.
- Is not a recording path. Recording into a Pattern stays with live input in
  [pattern editing](spec-006-pattern-editing.md) section 16.4.
- Works while the transport is stopped, playing, or paused, and does not alter
  transport state or position.
- Respects module mute, solo, routing, pedalboard processing, and sends, so an auditioned
  voice reaches the module's assigned route.
- Releases its voice when the module is removed, when the project is replaced,
  and when audio is interrupted. If a held control loses pointer capture, it
  stops the voice. It also stops the voice if it loses keyboard focus.
- Remains visible and operable when audio is blocked, and reports the blocked
  state instead of failing silently.
- Assistive technology announces it as an audition control, not as a step or a
  toggle.

### 15.1 Silver Serpent

Compact controls:

- Tune.
- Cutoff.
- Resonance.
- Envelope amount.
- Decay.
- Accent amount.
- Waveform.
- Glide.
- Volume.
- Sub-oscillator level.
- Second-oscillator detune.
- Clean or dirty filter model.
- Audition control.
- Compact filter response.

Expanded controls:

- Second oscillator.
- Detailed envelope.
- Glide mode.
- Accent response.
- Real-time filter response curve moving with the envelope.
- Voice and note analysis display.

Sequencing states:

- Note.
- Rest.
- Tie.
- Slide.
- Accent.
- Velocity.
- Probability.
- Micro-timing.

The sound is an original monophonic subtractive design. It must not claim
hardware accuracy.

### 15.2 Shared drum architecture

Every drum voice is an independent internal channel.

Each voice supports:

- Synthesized layer.
- Optional factory or user sample layer.
- Blend.
- Level.
- Tune.
- Decay.
- Pan.
- Mute.
- Solo.
- Distortion rotary control from 0 through 100 percent. The default is 0.
- Choke-group assignment.
- Musically appropriate original choke defaults for open and closed hat
  relationships.
- Metering.
- Stable voice ID.

Each step supports:

- Trigger.
- Velocity.
- Accent.
- Probability.
- Micro-timing offset.
- Flam.
- Roll.
- Selection.
- Per-voice step resolution.
- Per-voice pattern length.

Factory sample content is original and project-owned. You may layer your samples
without replacing the synthesis engine.

Default layer balance is machine-specific. Tin Soldier and Soft Thunder are
synth-heavy. Twin Engine uses a balanced blend. Gray Ghost and Dusty Mosaic are
sample-heavy with their built-in lo-fi stages enabled. Every voice provides both
a synthesized layer and an optional sample layer.

### 15.3 Tin Soldier

Compact controls:

- Tune.
- Snap.
- Decay.
- Tone.
- Level.
- Drive.
- Voice selector.
- Selected-voice pan.
- Selected-voice mute and solo.
- Audition control.

Expanded editor:

- All shared per-voice controls.
- Voice mixer.
- Choke groups.
- Sample layer.
- Per-voice Distortion controls.
- Parent module send controls and routing.
- Per-step properties.
- Synthesis-specific voice controls.

### 15.4 Soft Thunder

Compact controls:

- Tune.
- Punch.
- Decay.
- Tone.
- Level.
- Compression.
- Voice selector.
- Selected-voice pan.
- Selected-voice mute and solo.
- Audition control.

Expanded editor includes the shared drum capabilities and original large-machine
voice design.

### 15.5 Twin Engine

Compact controls:

- Original waveform preview.
- Sound selector.
- Start position.
- Tune.
- Decay.
- Filter.
- Attack.
- Selected-voice level.
- Audition control.

This module's waveform preview uses the space that two more knobs would use.
Therefore, selected-voice pan and module-send emphasis are in the expanded
editor, not on the faceplate.

Expanded editor includes:

- Runtime-generated or project-owned original one-shots.
- Synth layer.
- Sample layer.
- Start offset.
- Pitch.
- Decay.
- Filtering.
- Selected-voice pan.
- Module-send emphasis that scales sends A through D together while preserving
  their relative levels.
- Voice mixer.
- Per-step properties.
- Per-voice Distortion plus parent module send controls and routing.

### 15.6 Gray Ghost

Compact controls:

- Tune.
- Decay.
- Compression.
- Bit reduction.
- Sample-rate reduction.
- Level.
- Voice selector.
- Selected-voice pan.
- Selected-voice mute and solo.
- Audition control.

The built-in lo-fi stage starts enabled. The user can disable it. While the
stage is disabled, the bit-reduction and sample-rate-reduction controls are
disabled.

### 15.7 Dusty Mosaic

Compact controls:

- Tune.
- Decay.
- Noise amount.
- Filter.
- Pan.
- Level.
- Bit reduction.
- Sample-rate reduction.
- Voice selector.
- Selected-voice mute and solo.
- Audition control.

The built-in lo-fi stage starts enabled. The user can disable it. While the
stage is disabled, the bit-reduction and sample-rate-reduction controls are
disabled.

---
