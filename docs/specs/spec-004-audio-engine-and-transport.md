# Pulsebox Audio Engine and Transport Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-004`  
**Build order:** 4 of 10  
**Depends on:** [Application shell and controls](spec-003-application-shell-and-controls.md)  
**Owns:** Transport, timing, AudioWorklet processing, scheduling, sample
boundaries, startup, and live-audio behavior.  
**Acceptance IDs:** `AC-031`, `AC-044` through `AC-050`, `AC-063`, and
`AC-073` in [release acceptance](spec-012-release-acceptance.md).

---

## 12. Transport

The full-width transport contains:

Far left:

- Main menu.
- Project selector.
- Pin project.
- Project actions.

Transport group:

- Compact Pattern/Song transport-scope toggle.
- Play.
- Stop.
- Record.
- Tempo display.
- BPM label.
- Tap tempo.

Center:

- `PULSEBOX`, fixed to the horizontal center of the viewport independently of
  the width of the groups on either side.
- The app mark uses a restrained inset or recessed surround matching the
  approved design target.

Position group:

- Elapsed time.
- Bars, beats, and ticks.
- Tabular monospace numerals.

Master group:

- Audio-engine power.
- One two-state analysis toggle labeled `L/R` or `M/S`.
- Two master meter bars. In `L/R` they show left and right. In `M/S` they
  show mid and side.
- Peak indicator.
- Master dB value.
- Settings.

The header has no theme selector. Theme and high-contrast selection exists only
on the Settings page when that page is implemented.

Behavior:

- Space toggles play or pause unless focus is in a text field or a conflicting
  editor.
- Escape stops playback.
- Space pauses in place. Stop halts playback and returns to the last explicit
  transport start marker, defaulting to Pattern step 1 in Pattern mode or the
  first Playlist row in Song mode. Repeated Stop presses have no second
  behavior.
- The transport start marker updates when the user positions the playhead while
  stopped or starts playback from a manually selected location. Loop wraps,
  quantized Pattern switches and automatic playhead movement do
  not move the marker.
- Record arms or disarms.
- Tempo range is approximately 40 to 240 BPM.
- Tempo supports pointer adjustment and direct numeric entry.
- Tap tempo uses a rolling set of recent taps.
- Position updates do not cause layout shifts.
- Meter decay is smooth.
- Buttons expose idle, hover, pressed, active, disabled, and focus states.
- Pattern and Song transport modes switch without stopping.
- Pattern switching is quantized to a configurable boundary, default one bar.
- Count-in and metronome are configurable for live recording.
- Pin project toggles whether the current project appears at the top of the
  project selector. It uses `aria-pressed` and persists as project metadata.

The `L/R`/`M/S` control changes analysis only. It never changes live audio,
project state, automation, undo history, or export. Meter mode is a transient
monitoring preference. `M = (L + R) / 2` and `S = (L - R) / 2` for displayed
analysis.

The separate master Mono control remains in the Master studio view. It is a
monitor-only fold-down placed after the master chain, affects live listening and
the displayed master meters, and is excluded from project audio state, master
WAV export, and stem export.

---

## 17. Timing

Swing is one global project property in the MVP. It applies to every Pattern and
to every module. Per-Pattern Swing is post-MVP work.

Timing properties shown as horizontal sliders in the Piano Roll header:

- Swing, default 54%. Project-wide in the MVP: moving it on any Pattern changes
  playback of every Pattern.
- Humanize, default 12%. Pattern-owned.
- Quantize strength is fixed at 100% in the MVP and is not a visible control.
- The Pattern grid is fixed at 1/16. There is no Straight selector, grid
  selector, triplet selector, or persistent snap-off control in the MVP.

Behavior:

- Swing shifts alternating subdivisions.
- Humanize changes timing and velocity deterministically.
- A stored pattern seed produces repeatable playback.
- Changing the seed creates a new deterministic variation.
- Alt-drag temporarily bypasses the 1/16 snap for a pitched note gesture.
- Timing is audible.
- Visual playheads reflect timing where practical.
- Tempo changes during playback are supported.
- Per-Pattern Swing, selectable grids, triplets, persistent snap-off, per-voice
  grid resolution, tempo automation, and time-signature timelines are post-MVP
  work.

---

## 21. Audio engine

### 21.1 Core requirements

- 32-bit float processing.
- A documented host-frame processing contract: processors accept the frame count
  supplied by the host, and fixed-block algorithms use bounded internal
  buffering only where required.
- Sample-rate agnostic.
- Correct at 44.1 kHz and 48 kHz.
- Audio clock is authoritative.
- Lookahead scheduling.
- Visual timers are never the musical clock.
- Parameter smoothing.
- No zipper noise.
- No allocation in real-time processing.
- No logging in real-time processing.
- No locks in real-time processing.
- Conservative output level.
- Master limiter enabled by default.
- Clean voice release.
- Bounded graph growth.
- Bounded feedback.
- Reusable impulse responses and buffers.
- No large buffer regeneration on each parameter edit.

### 21.2 Transport clock

- Reads audio context time.
- Schedules ahead.
- Supports tempo change during playback without changing the current musical
  position. The engine discards only queued future events and rebuilds them on
  the new tempo grid.
- Supports one global Swing value.
- Supports deterministic humanization.
- Supports pattern and song modes.
- Supports quantized named Pattern launches.
- Keeps visual playheads separate.

A scheduling interval around 20 to 30 milliseconds and a horizon around 80 to
120 milliseconds may be used by the engine controller, but the audio thread
remains authoritative.

### 21.3 Worklet and graph messaging

- UI sends commands to the state and engine controller.
- Engine controller sends compact messages to worklets.
- Worklets return meter frames and status through preallocated or bounded
  channels.
- No UI component owns a worklet port directly.
- Messages are versioned.
- Parameter changes are timestamped where needed.

Custom synthesis and custom DSP use AudioWorklet processors. Native Web Audio
nodes may implement suitable primitives such as delay, filtering, convolution,
waveshaping, dynamics, analysis, and gain staging, but only behind engine-owned
plugin adapters.

### 21.4 Voice stealing

Each instrument documents:

- Maximum voices.
- Steal priority.
- Release duration.
- Choke policy.
- Retrigger policy.

Steal with a short release, never a hard cut.

### 21.5 Sample boundaries

Apply automatic micro-fades:

- Fade-in: 2 ms.
- Fade-out: 4 ms.
- Linear amplitude.
- Per channel.

Handle:

- Very short samples.
- Adjacent samples.
- Loop boundaries.
- DC offsets.
- Choked voices.
- Start offsets.
- Rate changes.

### 21.6 Sample decoding

WAV, AIFF, and FLAC import uses the Pulsebox-owned decoding interface defined in
`ARCHITECTURE.md`. The production path uses bundled deterministic decoders and
does not depend on whether `decodeAudioData()` supports a format in the current
browser. Decoding runs outside the audio render thread. The decoder validates
container structure, channel count, declared lengths, decoded frame count, and
project limits before publishing an asset.

### 21.7 Audio unlock and fallback

- Resume audio only from a direct user gesture.
- Clearly show locked, active, suspended, and unavailable states.
- A terminal audio-processor fault stops transport and disables audible
  operations while leaving editing available.
- Editing remains functional if Web Audio is blocked or unavailable.
- No fake meters while stopped.
- Demo animation, if used, is deterministic and clearly non-audio.

### 21.8 Startup and first sound

Audible playback must begin within three seconds on a warm cache. Measure from
the first valid audio-unlock gesture that also requests an audible result, such
as the first Play command or an instrument audition. A power-only gesture that
does not request sound does not start the metric.

For release evidence, serve the production build from the canonical origin, load
it once successfully, close that browser context, then run five fresh contexts
with the default project already stored. Measure from the trusted Play action to
the first non-silent output frame observed by the deterministic audio probe.
Every run must finish within three seconds. Record the browser version,
operating system, processor, memory, audio device, sample rate, and exposed
buffer setting.

### 21.9 Performance

Target:

- Eight active rack slots.
- Active patterns.
- Effects and metering.
- No avoidable audible dropouts during normal supported use.
- Stable long-running playback.
- Pause nonessential visual animation when the document is hidden.
- Do not keep an animation loop running while inactive unless audio or a visible
  meter requires it.
- Batch visual patches.
- Use transforms for playheads, meters, and drag previews.
- Cache geometry for the duration of pointer gestures.
- Avoid repeated layout measurement inside pointer-move handlers.

Apart from the functional first-sound metric above, the MVP has no normative
hardware class, CPU percentage, buffer-size threshold, or timed stress benchmark
as a release gate. Performance profiling remains required for engineering
diagnosis, but it is informational rather than a pass-or-fail acceptance
criterion, and its output belongs in the run report to the user rather than in
the repository tree.

---
