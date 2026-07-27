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
- Swing: 54%.
- Humanize: 12%.
- Quantize strength: 100%.
- Transport: stopped.
- Master level: approximately -6 dB.
- New-installation UI theme: `rack`, stored as a global preference rather than
  project state.

Rack order:

1. Acid Bass.
2. Drumline Six.
3. Boom Eight.
4. Hybrid Nine.
5. Digit Seven.
6. Digit Five.
7. Empty.
8. Empty.

The MVP rack contains exactly eight slots.

Default named Patterns:

1. Intro, 8 bars.
2. Verse, 16 bars.
3. Break, 8 bars.
4. Drop, 16 bars.
5. Outro, 8 bars.

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

### 9.2 Secondary starter template

Retain the alternative three-slot starter as a built-in template rather than the
default:

1. Acid Bass.
2. Acid Bass.
3. Boom Eight.
4. Remaining slots empty.
5. Tempo: 130 BPM.

It must contain two independent basslines and an original drum pattern.

---

## 13. Module browser and rack overview

### 13.1 Unified module browser

The module browser has one un-tabbed list. It does not split the same module
definitions into separate Rack and Library views.

Browser content:

- Category or filter control.
- Six instrument definitions.
- Original DOM or SVG thumbnail.
- Short label.
- Full name.
- Type description.
- Drag affordance.
- Useful empty state.

Interactions:

- Click to inspect.
- Double-click to add to the first empty slot.
- Drag into a specific slot.
- Keyboard Add command.
- No screenshot thumbnails.

### 13.2 Rack overview

Requirements:

- Slots 01 through 08.
- Internal scrolling as required.
- Miniature loaded cards.
- Empty labels and add controls.
- Selected border and accent marker.
- Two-digit slot number.
- Duplicate and Swap actions for the selected loaded module.
- No persistent Add or Remove buttons below the slot list. The plus control in
  each empty slot is the only visible Add action in the overview.
- A loaded module's context menu contains `Delete module`. Pointer users open it
  with right-click. Keyboard users open the same menu with the Menu key or
  Shift+F10.
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

The MVP rack holds eight slots. Any slot can hold any instrument. Duplicates are
allowed.

The engine, state, plugin, and UI contracts remain slot-count agnostic. Sixteen
rack slots are an explicit post-MVP target, but the approved MVP and its
acceptance criteria remain capped at eight.

Each slot supports:

- Enable or bypass.
- Mute.
- Solo.
- Pattern selector.
- Output routing.
- Swap.
- Collapse.
- Expand.
- Duplicate.
- Remove.
- Reorder.
- Module menu.
- Selection.
- Visible level.
- Pattern activity.

Rack-module collapse is a lightweight local UI preference keyed by project ID,
project lineage ID, and stable module ID. It is not project data, is not
included in portable files, and does not create an undo entry. Removing a module
removes its local collapse preference; Undo restores the module expanded. A
whole-project Replace, Undo replace, or Import as copy cannot inherit another
lineage's collapse state even when module IDs match.

Collapsed slots remain usable and show:

- Short label.
- Level.
- Mute.
- Solo.
- Pattern selector.
- Activity.
- Expand control.

Empty slots show an Add control.

Removing a module:

- Starts from `Delete module` in the loaded module's context menu. There is no
  separate minus button in the rack overview.
- Happens immediately with no confirmation dialog and exposes Undo.
- Releases its audio resources safely.
- Clears its matching mixer channel and leaves the corresponding disabled
  visible strip labeled `Empty`; it never creates a mixer bank.
- Preserves full recovery data in undo history.
- Undo restores the module, its named-Pattern parts, mixer state, automation, sample
  references, and effect chains.

Swapping a module:

- Replaces the plugin.
- Preserves sequence data where event mapping is valid.
- Reports unmapped data before or after the operation through a non-blocking
  result panel.
- Is undoable.
- Does not interrupt unrelated audio.

Each full module is approximately 86 to 98 pixels high at the target viewport
unless expanded.

---

## 15. Instrument modules

Each instrument has:

- Compact rack faceplate.
- Expanded editor.
- Stable parameter IDs.
- Pattern selector.
- Step or note activity.
- Per-module output level.
- Mute and solo.
- Insert-chain access.
- Metering.
- Original visualization.
- Full keyboard accessibility.
- Automation support.

Compact faceplates expose the established fast-control set defined for each
instrument below. Additional synthesis, sample, voice, insert, and routing
parameters live in the playback-safe expanded editor. Faceplate pages are not
user-configurable in the MVP.

### 15.1 Acid Bass

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
- Current note or lane.
- Compact filter response.

Expanded controls:

- Second oscillator.
- Second-oscillator detune.
- Sub oscillator.
- Clean or dirty filter model.
- Detailed envelope.
- Glide mode.
- Accent response.
- Real-time filter response curve moving with the envelope.
- Voice and note monitor.

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
- One voice insert slot.
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

Factory sample content is original and project-owned. User samples may be
layered without replacing the synthesis engine.

Default layer balance is machine-specific: Drumline Six and Boom Eight are
synth-heavy, Hybrid Nine is blended, and Digit Seven and Digit Five are
sample-heavy with their built-in lo-fi stages enabled. Every voice still
provides both a synthesized layer and an optional sample layer.

### 15.3 Drumline Six

Compact controls:

- Tune.
- Snap.
- Decay.
- Tone.
- Level.
- Drive.
- Voice selector.
- Per-step trigger and velocity.

Expanded editor:

- All shared per-voice controls.
- Voice mixer.
- Choke groups.
- Sample layer.
- Voice inserts.
- Parent module send controls and routing.
- Per-step properties.
- Synthesis-specific voice controls.

### 15.4 Boom Eight

Compact controls:

- Tune.
- Punch.
- Decay.
- Tone.
- Level.
- Compression.
- Voice selector.
- Per-step trigger and velocity.

Expanded editor includes the shared drum capabilities and original large-machine
voice design.

### 15.5 Hybrid Nine

Compact controls:

- Original waveform preview.
- Sound selector.
- Start position.
- Tune.
- Decay.
- Filter.
- Module-send emphasis that scales sends A through D together while preserving
  their relative levels.
- Per-step trigger and velocity.

Expanded editor includes:

- Runtime-generated or project-owned original one-shots.
- Synth layer.
- Sample layer.
- Start offset.
- Pitch.
- Decay.
- Filtering.
- Voice mixer.
- Per-step properties.
- Voice inserts plus parent module send controls and routing.

### 15.6 Digit Seven

Compact controls:

- Tune.
- Decay.
- Compression.
- Bit reduction.
- Sample-rate reduction.
- Level.
- Voice selector.
- Per-step trigger and velocity.

The built-in lo-fi stage starts enabled and can be disabled.

### 15.7 Digit Five

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
- Per-step trigger and velocity.

The built-in lo-fi stage starts enabled and can be disabled.

---

