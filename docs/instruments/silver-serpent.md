# Silver Serpent instrument design

**Plugin ID:** `bass-mono`

**State schema:** 1

**Implementation stage:** Phase 1 sound and compact-rack foundation

## Product identity

Silver Serpent is an original monophonic subtractive bass instrument. Its shipping
name, panel, defaults, pattern, parameter ranges, DSP, and visual treatment are
Pulsebox-owned. It does not reproduce or claim compatibility with another
instrument.

## Signal path

The Phase 1 path starts with one saw or square oscillator. It then uses a
resonant state-variable low-pass stage and one decaying amplitude and filter
envelope. The path also applies an accent response, glide, a smoothed output
level, and a conservative output clamp. Every numeric
parameter follows its manifest-declared eight-millisecond trajectory. Waveform
edits use an eight-millisecond linear crossfade. The processor uses the audio
host's supplied frame count and the context sample rate.

Live tempo edits keep the current transport tick position, discard only queued
future events, and schedule the new tempo grid from a bounded twenty-millisecond
lead. They do not silence or suspend the current voice. Module removal sends a
note release. It keeps the worklet connected for 100 milliseconds before final
disposal. This delay lets the bounded DSP release finish without a hard output
cut.

The full expanded editor remains governed by the
[rack and instruments specification](../specs/spec-005-rack-and-instruments.md).
Its second oscillator,
sub oscillator, alternate filter model, detailed envelope, response curve, and
voice monitor are later work. They must extend the plugin folder and manifest
without adding shared-engine product branches.

## Stable parameters

| ID                | Range                 | Default | Step | Unit      |
| ----------------- | --------------------- | ------- | ---- | --------- |
| `tune`            | -24 to 24             | 0       | 1    | semitones |
| `cutoff`          | 40 to 12000           | 720     | 1    | hertz     |
| `resonance`       | 0 to 0.92             | 0.38    | 0.01 | ratio     |
| `envelope-amount` | 0 to 1                | 0.52    | 0.01 | ratio     |
| `decay`           | 0.02 to 2             | 0.28    | 0.01 | seconds   |
| `accent-amount`   | 0 to 1                | 0.45    | 0.01 | ratio     |
| `waveform`        | `saw` or `square`     | `saw`   | n/a  | none      |
| `glide`           | 0 to 1                | 0.08    | 0.01 | ratio     |
| `volume`          | 0 to 1                | 0.62    | 0.01 | ratio     |

Committed edits use these stable IDs. The worklet adapter translates them to
internal DSP field names. Project state never stores live audio objects.

The Phase 1 runtime supports live rendering. Offline rendering is explicitly
unavailable until a real offline plugin runtime is implemented and verified.

## Pattern and voice behavior

- One voice is active at a time.
- A step contains note number, velocity, accent, and slide state.
- A non-slide step schedules a note-off before the next step.
- A slide step retains the gate and moves toward the next target frequency.
- The Phase 1 seed is an original sixteen-step loop. It is not a factory
  template contract and may be replaced by the final supplied project.

## Verification

- Deterministic DSP unit tests run at 44.1 and 48 kHz and with non-128 block
  sizes.
- Unit regressions verify the exact eight-millisecond parameter trajectory,
  waveform crossfade, release tail, and first rescheduled event frame after a
  live tempo edit.
- Controller-to-processor pairing verifies that tempo rescheduling clears only
  future events, while module disposal uses the bounded release path.
- Production-browser tests activate the AudioWorklet path in Chrome.
- Parameter and pattern edits, Undo, rack add, and the eight exposed rack slots
  have browser coverage.
- Final acceptance still requires the rendered-audio, startup, and manual
  listening procedures in the
  [audio engine and transport specification](../specs/spec-004-audio-engine-and-transport.md),
  [release acceptance](../specs/spec-012-release-acceptance.md), and
  [`ARCHITECTURE.md`](../ARCHITECTURE.md).
