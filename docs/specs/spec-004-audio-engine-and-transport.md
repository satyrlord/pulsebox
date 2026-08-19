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

- One project selector for New, Open, Import, and Export.

Transport group:

- Compact Pattern/Song transport-scope toggle.
- Play.
- Stop.
- Record.
- Tempo number with no visible unit label.
- Tempo tooltip that defines beats per minute.
- Tap tempo.

Center:

- Place `PULSEBOX` at the horizontal center of the viewport. Keep its position
  independent of the group widths on each side.
- Give the app mark a restrained inset or recessed surround that matches the
  approved design target.

Position group:

- Elapsed time.
- Bars, beats, and ticks.
- Tabular monospace numerals.

Master group:

- Metronome toggle.
- Audio-engine power.
- One two-state analysis toggle labeled `L/R` or `M/S`.
- Two master meter bars. In `L/R` they show left and right. In `M/S` they
  show mid and side.
- Peak indicator.
- Master dB value.
- Settings.

The header has no theme selector. Theme and high-contrast selection exists only
on the Settings page when that page exists.

Behavior:

- If focus is in a text field or conflicting editor, Space does not control
  playback. Otherwise, Space toggles play or pause.
- Escape stops playback.
- Space pauses in place. Stop halts playback and returns to the last explicit
  transport start marker. The default marker is Pattern step 1 in Pattern mode
  or the first Playlist row in Song mode. Repeated Stop presses have no second
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
- The transport quantizes Pattern changes to a configurable boundary. The
  default boundary is one bar.
- The user can configure the count-in and metronome for live recording.
- The header metronome toggle is the single control that enables or disables the
  metronome. It uses `aria-pressed`. Store its state as a global UI preference,
  not as project state. It creates no undo entry. It never changes project state,
  automation, or export. Count-in length and metronome sound stay with the live
  recording settings in
  [pattern editing](spec-006-pattern-editing.md) section 16.4.
- The MVP has no control that marks a project. The project selector orders
  stored projects by modified time alone. A post-MVP Favourite feature will let
  the user mark projects. Decision `D84` records its scope. The project format
  reserves the `favorite` field for it.

The `L/R`/`M/S` control changes analysis only. It never changes live audio,
project state, automation, undo history, or export. Meter mode is a transient
display preference. `M = (L + R) / 2` and `S = (L - R) / 2` for displayed
analysis.

---

## 17. Timing

Swing is one global project property in the MVP. It applies to every Pattern and
to every module. Per-Pattern Swing is post-MVP work.

The Piano Roll header shows these timing properties as horizontal sliders:

- Swing, default 0%. It is project-wide in the MVP. When the user moves it on
  any Pattern, it changes playback of every Pattern.
- Humanize, default 0%. Pattern-owned.
- The MVP fixes quantize strength at 100% and shows no control for it.
- The MVP fixes the Pattern grid at 1/16. There is no Straight selector, grid
  selector, triplet selector, or persistent snap-off control in the MVP.

Behavior:

- Swing shifts alternating subdivisions.
- Humanize changes timing and velocity deterministically.
- Humanize varies each module independently. Its timing offset is at most one quarter step.
- A stored pattern seed produces repeatable playback.
- When the user changes the seed, Pulsebox creates a new deterministic variation.
- Alt-drag temporarily bypasses the 1/16 snap for a pitched note gesture.
- Timing is audible.
- Visual playheads reflect timing where practical.
- The engine supports tempo changes during playback.
- A pointer move previews Tempo, Swing, or Humanize without a project command.
  Pointer release commits one command and one Undo entry.
- Pointer cancel restores the committed timing value and creates no Undo entry.
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
- Preallocate real-time event and parameter storage.
- Meter publication is the only bounded allocation during real-time processing.
- Allocate at most one small envelope for each published meter frame.
- Limit meter publication to 30 frames per second.
- Do not log during real-time processing.
- Do not use locks during real-time processing.
- Conservative output level.
- Enable the master limiter by default.
- Clean voice release.
- Bounded graph growth.
- Bounded feedback.
- Reusable impulse responses and buffers.
- No large buffer regeneration on each parameter edit.

### 21.2 Transport clock

- Reads audio context time.
- Schedules ahead.
- Supports tempo changes during playback. It keeps the current musical position.
  The engine discards only queued future events and rebuilds them on the new
  tempo grid.
- Supports one global Swing value.
- Supports deterministic humanization.
- Supports pattern and song modes.
- Supports quantized named Pattern launches.
- Keeps visual playheads separate.

The engine controller uses a 25-millisecond scheduling interval. It keeps a
500-millisecond event horizon at each processor. The audio thread applies each
event at its absolute frame and remains authoritative.

The scheduler never sends an expired note-on. After a late pass, all modules
resume from one shared future boundary. The scheduler keeps the musical grid
continuous after that boundary. It does not replay missed notes in a burst.

When a module becomes ready during playback, the engine fills that module to
the end of the current shared horizon. This rule applies after an add, a swap,
or a processor recovery.

A live step edit replaces the affected module's queued horizon. A quantized
Pattern launch replaces queued events that cross its selected boundary.

A timing rebuild preserves expanded onsets by their actual frame and stable
occurrence identity. It does not use only the source step. Micro-timing,
Flam, and Roll events cannot be lost or repeated at the rebuild boundary.
If controller work makes a pulled replacement onset expire, the engine keeps
the cleared old-timing occurrence when its frame is still in the future.
The engine applies the same rule to a pulled automation step.

The controller tracks the bounded queue sent to each processor. Timing rebuilds
derive kept and fallback occurrences from this queue record. Each scheduler
pass removes consumed records. Future records cannot exceed the matching
processor queue capacity.
A Swing or Humanize rebuild retains at least 100 milliseconds of old timing
inside the 500-millisecond processor horizon. A Tempo rebuild uses the normal
scheduler lead and applies the new tempo grid without that added delay.

The engine sends large horizons as bounded worklet batches. It schedules every
complete source step that fits the declared processor queue. It does not move
the horizon past a source step that it did not schedule.

Pattern automation uses absolute audio frames. The processor applies a step
before a note-on at the same frame and holds the value until the next step.

### 21.3 Worklet and graph messaging

- UI sends commands to the state and engine controller.
- Engine controller sends compact messages to worklets.
- Worklets return meter frames and status through preallocated or bounded
  channels.
- No UI component owns a worklet port directly.
- Messages include a version.
- Parameter changes include timestamps where needed.
- The controller coalesces pointer-rate parameter previews for 16 milliseconds.
  It keeps the latest value for each parameter.
- The processor validates normal controller data without serializing JSON on
  the audio thread.

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

A drum voice with the `restart` retrigger policy restarts its phase and
envelope immediately on a retrigger of the same voice. The new attack transient
masks the restart, so no ramp applies and the hit keeps its exact frame.
Decision `D93` records this exception. The micro-fade rules in section 21.5
govern steals, chokes, and sample boundaries, not same-voice restarts.

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
- Show locked, active, suspended, and unavailable states.
- A terminal audio-processor fault stops transport and disables audible
  operations while leaving editing available.
- Editing remains functional if Web Audio is blocked or unavailable.
- No fake meters while stopped.
- If used, make demo animation deterministic. Mark it as non-audio.

### 21.8 Startup and first sound

Audible playback must begin within three seconds on a warm cache. Measure from
the first valid audio-unlock gesture that also requests an audible result, such
as the first Play command or an instrument audition. A power-only gesture that
does not request sound does not start the metric.

For release evidence:

1. Serve the production build from the canonical origin.
2. Load it once successfully.
3. Close that browser context.
4. Before each run, store the default project in a fresh context.
5. Run each prepared context.
6. Measure from the trusted Play action to the first non-silent output frame.
7. Use the deterministic audio probe to observe that frame.

Every run must finish within three seconds. Record the browser version,
operating system, processor, and memory. Also record the audio device, sample
rate, and exposed buffer setting.

### 21.9 Performance

Target:

- Eight active rack slots.
- Active patterns.
- Effects and metering.
- No avoidable audible dropouts during normal supported use.
- Stable long-running playback.
- Pause nonessential visual animation when the document is hidden.
- If audio or a visible meter does not require an animation loop, stop it while
  inactive.
- Batch visual patches.
- Use transforms for playheads, meters, and drag previews.
- Cache geometry for the duration of pointer gestures.
- Avoid repeated layout measurement inside pointer-move handlers.
- Keep timing pointer, wheel, and key updates out of project history until the gesture ends.
- Test an eight-module active rack at 44.1 kHz and 48 kHz.
- Run performance regression tests without retries.
- Measure long tasks as run evidence. Do not use a long-task duration as a release gate.

Apart from the functional first-sound metric above, the MVP does not use a
hardware class as a performance release gate. It also does not use a CPU
percentage, buffer-size threshold, or timed stress benchmark. Engineers must
profile performance for diagnosis. The profile is informational, not a
pass-or-fail criterion. Put its result in the run report to the user, not in the
repository tree.

---
