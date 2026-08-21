# Pulsebox Quality and Delivery Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-010`  
**Build order:** 10 of 10  
**Depends on:** [Persistence and export](spec-009-persistence-and-export.md)  
**Owns:** Accessibility, test evidence, browser support, documentation, build
phases, and close-out.  
**Acceptance IDs:** `AC-055` through `AC-057` and `AC-060` through `AC-061` in
[release acceptance](spec-012-release-acceptance.md).

---

## 24. Accessibility, testing, documentation, and delivery

### 24.1 Accessibility

Pulsebox uses WCAG 2.2 Level AA success criteria to measure supported desktop
viewports. It does not claim full WCAG conformance below the 1280 × 720 editing
boundary. Normal text has at least 4.5:1 contrast. Large text and essential
graphics have at least 3:1 contrast where the applicable criterion requires it.

Control boundaries, state indicators, and focus indicators have the same 3:1
minimum. Pointer targets are at least 24 × 24 CSS pixels or satisfy the WCAG
2.2 spacing exception. Focus is visible and not fully obscured.

- Keyboard access for every interactive feature.
- Semantic native controls.
- ARIA only where native semantics are insufficient.
- Visible focus in all themes.
- Full accessible names.
- Tooltips for abbreviations.
- Tooltips explain audible behavior in plain user-facing language.
- No color-only meaning.
- Reduced motion.
- The numeric contrast requirements above.
- ARIA live announcements for module movement, deletion, save, recovery, import,
  and errors.
- Error text never apologizes and never uses vague wording.
- No ordinary-panel focus traps.
- Modal editor focus trap only while open.
- Focus restored on close.
- High-contrast mode.
- Pointer targets meeting the size or spacing rule above.
- Notes and steps expose meaningful text alternatives.
- Keyboard reorder for rack slots, effects, named Patterns, and playlist clips.

### 24.2 Undo and redo

Include:

- Parameter changes.
- Step changes.
- Note changes.
- Automation changes.
- Module add, remove, duplicate, swap, and reorder.
- Mixer changes.
- Effect changes.
- Chain changes.
- Playlist changes.
- Pattern changes.
- Sample assignment.

The combined active Undo and Redo history keeps at most 100 entries and 64 MiB
of canonical patch JSON. One entry is at most 17 MiB. New committed edits clear
Redo and evict the oldest Undo entries as needed. They do not fail when history
is full. Retained entries pin referenced immutable blobs. The
exact accounting and eviction contract is in `ARCHITECTURE.md`.

Exclude:

- Meter frames.
- Playhead movement.
- Hover.
- Focus.
- Temporary previews.
- Audio power.
- Save-status animation.
- Ordinary panel disclosure preferences.

### 24.3 Tests

Unit tests:

- Store commands.
- Selectors.
- Undo and redo.
- Gesture coalescing.
- Undo/Redo count and byte eviction boundaries, Redo clearing, blob pins, and a
  maximum-before/maximum-after entry below the proven encoding cap.
- Migrations.
- Import validation.
- Pattern timing.
- Global Swing, including that one change reaches every Pattern.
- Deterministic humanization.
- Fixed 1/16 Pattern timing and Alt-drag snap override.
- Mixer solo logic.
- Voice solo logic.
- Effect sends.
- Routing safety.
- Parameter clamps.
- Time formatting.
- Sample micro-fades.
- Voice stealing.
- Automation step timing, overwrite, and sample-and-hold behavior.
- Theme token validation.
- Playlist ordering and repeat-count validation.
- Same-project-ID import resolution and revision-epoch rollover.
- Archive traversal, collision, expansion, and record-count rejection.
- Plugin version and pack-reference validation.
- Storage quota failure and atomic rollback.
- Bundled WAV, AIFF, and FLAC decoder fixtures.

Component tests:

- Knob keyboard behavior.
- Knob reset.
- Numeric entry.
- Fader keyboard behavior.
- Toggle ARIA.
- Marquee selection.
- Drum-trigger double-click creation and pitched-note move and resize.
- Module add and remove.
- Module reorder.
- Playlist reorder.
- Pattern reorder.
- Effect reorder.
- Piano-roll creation, move, and resize.
- Module-aware Piano Roll switching between monophonic pitched and drum-trigger
  modes.
- Global Swing and Pattern Humanize sliders.
- Lower-editor collapse and restore.
- Focus restoration.
- Live keyboard map focus rules.

Playwright:

- Startup.
- Audio unlock.
- Play and stop.
- Pattern and Song mode.
- Add, reorder, swap, and remove module.
- Undo removal.
- Double-click to create and marquee-select events.
- Record computer-keyboard input.
- Generate a pattern.
- Edit a note.
- Edit automation.
- Change mixer controls.
- Change sends.
- Toggle the Rack FX and Send FX group bypasses.
- Enable and reorder effects.
- Reorder Master pedals by pointer and keyboard while the protected limiter
  stays final.
- Detect and reset a post-master inter-sample clip from the Master true-peak
  meter.
- Open detailed effect editor.
- Rename and reorder a named Pattern.
- Reorder the Playlist and change a row repeat count.
- Switch the header meter between L/R and M/S without changing audio.
- Toggle master-effects bypass from the Master panel while the protected
  limiter stays active.
- Save and reload.
- Crash recovery.
- Export and import.
- WAV export.
- Keyboard-only use.
- Supported layouts at 1536 × 1024, 1440 × 900, 1366 × 768, and 1280 × 720, plus
  the unsupported-size notice below either minimum dimension.
- Change theme from Settings during playback.
- Canonical-origin and strict-port launch behavior.
- First-run supplied-song path from empty browser storage.
- Missing-pack degraded load and recovery.
- Storage persistence status and quota failure recovery.
- Eight active modules during Tempo, Swing, and Humanize interaction at 44.1
  kHz and 48 kHz.
- During these interactions, compare identical module queues after each reset.
  Reject an expired, missing, or duplicate onset. Tempo and Swing onsets must
  match. Humanize onset spread must stay within one half step across modules.
- Performance regression tests run with zero retries.

Visual regression:

- 1536 × 1024.
- 1440 × 900.
- 1366 × 768.
- 1280 × 720.
- The `rack` theme.
- High-contrast mode.
- Deterministic meters and animation.

#### 24.3.1 Mixer and effects verification matrix

<!-- markdownlint-disable MD013 MD060 -->

| Contract | Required evidence | Pass condition |
| -------- | ----------------- | -------------- |
| Direct per-voice Distortion | `tests/unit/engine/drumline-dsp.test.ts`, `tests/unit/engine/drum-machines-dsp.test.ts`, `tests/component/mixer-effects.test.tsx`, and `tests/e2e/audio-performance.spec.ts` | Zero is dry. A non-zero value affects only the selected voice and changes safely while it sounds. |
| Rack-only pedalboard access | `tests/component/mixer-effects.test.tsx` and `tests/e2e/spec-007-mixer-effects.spec.ts` | Rack Effects opens the module pedalboard. Mixer channels expose no module-chain editor. |
| Rack FX and Send FX group bypass | `tests/unit/state/pattern-bank-and-mixer.test.ts`, `tests/component/mixer-effects.test.tsx`, and `tests/e2e/spec-007-mixer-effects.spec.ts` | Each icon-only control uses one Undo entry, persists, and preserves the individual bypass states. |
| Effect stages and sends | `tests/unit/engine/effect-chain-node.test.ts`, `tests/unit/engine/mixer-routing-graph.test.ts`, `tests/unit/state/project-document.test.ts`, `tests/component/mixer-effects.test.tsx`, and `tests/e2e/spec-007-mixer-effects.spec.ts` | Every effect has one Mix and one Gain. No `Wet/Dry` label appears. The saved document uses `mix` and `gainDecibels`. Effect order is DSP, Mix, then Gain. Sends use only the pre-fader tap. |
| Detailed effect editor | `tests/unit/contracts/plugins.test.ts`, `tests/component/mixer-effects.test.tsx`, and `tests/e2e/spec-007-mixer-effects.spec.ts` | Manifest sections and visibility rules render generically. Units and precision match descriptors. EQ gestures converge after blur or close. The modal grows before it scrolls and restores focus. |
| Effect help and unity-peak drive | `tests/unit/engine/effect-catalog.test.ts`, `tests/component/mixer-effects.test.tsx`, and `tests/e2e/spec-007-mixer-effects.spec.ts` | Every built-in numeric parameter has non-empty manifest help no longer than 240 characters. Compact and detailed tooltips show current value, audible purpose, and relationship text for Tempo Sync, Mix, Gain, and Return Level. Pattern Filter full-scale drive stays above 0.9 after 4,000 frames. Distortion Drive and Asymmetric keep full-scale input at unity, and Drive, Fold, and Asymmetric keep every tested output at or below unity. |
| Compact Send effect cards | `tests/component/mixer-effects.test.tsx` and `tests/e2e/spec-007-mixer-effects.spec.ts` | All four cards fit each supported viewport. Captions, actions, tooltips, pinned focus, bypass, order, themes, and persistence match section 20.3. |
| Effect accent tuples | `tests/unit/engine/effect-catalog.test.ts`, `tests/unit/themes/token-discipline.test.ts`, and `tests/e2e/spec-007-mixer-effects.spec.ts` | Each built-in manifest matches the exact tuple in `THEMING.md`. Family-chip contrast is at least 4.5:1. Rack, user-theme, and high-contrast surfaces keep the required token behavior. |
| Master pedals, true-peak meter, and Bypass All | `tests/unit/engine/transport-timing-and-master.test.ts`, `tests/component/mixer-effects.test.tsx`, and `tests/e2e/spec-007-mixer-effects.spec.ts` | The Master view lists the live pedals with True Peak Limiter final and protected. Slot plates show and toggle active or bypassed state. Both edge handles support pointer reorder. The leading handle also supports keyboard reorder. Undo restores order, and the limiter handles are disabled. The meter exposes L/R and M/S dBTP values, latches a clip at or above 0 dBTP, and resets it. Master `Bypass All` bypasses user effects while the protected limiter stays active, then survives Undo, Redo, and reload. |

<!-- markdownlint-enable MD013 MD060 -->

### 24.4 Objective evidence thresholds

Use the deterministic fixtures and detailed procedures in `ARCHITECTURE.md`,
`PROJECT-FORMAT.md`, and `THEMING.md`. The following release thresholds are
normative:

- A same-build project save, reload, and offline render produce the same
  canonical manifest and event schedule at the same sample rate. For
  deterministic rendered samples, maximum absolute sample error is at most
  `1e-6`.
- Across 44.1 kHz and 48 kHz fixtures, scheduled event time differs by at most
  1 millisecond. Oscillator pitch differs by at most 1 cent after conversion to
  seconds and hertz.
- Two modules that receive the same event frame start rendered PCM within one
  audio sample of each other.
- Every audible parameter descriptor declares its smoothing curve and duration.
  A constant-input sweep fixture must match that control trajectory within
  `1e-6`. It must introduce no output discontinuity above `0.02` full scale at
  a control update boundary.
- Offline 48 kHz to 44.1 kHz resampling is deterministic. It keeps passband
  error within 0.1 dB from 20 Hz through 20 kHz. It keeps aliased or imaged
  test-tone energy at or below -90 dBFS.
- Automated deterministic checks run in the current stable Chrome release
  channel. The evidence records the exact version. Required real-audio checks
  run manually when automation cannot observe the physical result.
- Accessibility evidence checks the numeric requirements in section 24.1 at
  every supported viewport, in the `rack` theme and high-contrast mode.
- The first-sound procedure in section 21.8 passes all five runs in Chrome on
  the recorded release host.
- AC-077 runs the deterministic startup check in
  `tests/e2e/first-sound-release.spec.ts`.

### 24.5 Suggested file structure

The repository map in `AGENTS.md` and `ARCHITECTURE.md` owns the layer layout.

Keep audio processors, state logic, UI components, persistence, and theme tokens
in separate modules. Do not create one enormous component, engine file, or
global stylesheet.

### 24.6 Browser support

Support the current stable release of Chrome. Chrome is the only browser in
MVP support. Run every deterministic browser-specific audio, file, Canvas,
persistence, and component check in that release channel. Use documented manual
checks only for physical audio behavior that browser automation cannot observe.
Record the exact browser version in release evidence.

### 24.7 Documentation

Deliver:

- `docs/specs/spec-000-index.md` and its indexed child specifications.
- `ARCHITECTURE.md`
- `THEMING.md`
- `PROJECT-FORMAT.md`
- `README.md`
- One sanitized approved instrument design specification per module in
  `docs/instruments/`.
- One named historical research note per module in the non-shipping `/research`
  directory, with sources and only broad synthesis-family findings. It must not
  define copied factory voice lists, control ranges, curves, defaults, or sound
  targets.
- Effect plugin documentation.
- Keyboard shortcut reference.
- `docs/user-sample-policy.md`.
- Informational performance notes covering browser, sample rate, buffer setting
  where exposed, active module and effect load, observed glitches, and known
  hotspots. No fixed CPU threshold is an acceptance gate.
- Repository-wide case-insensitive naming and dependency audit.

README includes:

- Overview.
- Technology.
- Commands.
- Architecture.
- State.
- Audio.
- Persistence.
- Accessibility.
- Keyboard shortcuts.
- Known limitations.
- Adding an instrument.
- Adding an effect.
- Adding a theme.

Commands:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`
- `npm run typecheck`
- `npm run dead-code`
- `npm run lint:md`
- `npm run ci`

### 24.8 Build phases

Phase 0: Contract, legal boundary, research policy, state model, theme tokens,
project format, repository consistency checks, and independent architecture
review. Phase 0 ends with complete reviewed documents and passing documentation,
link, naming, and contract-consistency checks. It does not require a runnable
product application or product tests.

Phase 1: Application shell, controls, state foundation, AudioWorklet foundation,
transport, Silver Serpent, three-slot functional rack.

Phase 2: Remaining instruments, sample layers, eight-slot rack, overview,
internal voice mixers.

Phase 3: Named project Patterns, module-aware Piano Roll, live input, generators,
transforms, bounded full Undo.

Phase 4: Main mixer, per-voice Distortion, module pedalboards, send chains, master
chain, complete effect catalog.

Phase 5: Named-Pattern Playlist, Pattern automation, and Pattern/Song transport
modes.

Phase 6: The `rack` theme, user theme import, accessibility, default projects,
visual polish, performance measurements.

Phase 7: Persistence, recovery, project import/export, WAV and stem export,
final Chrome release matrix.

Phases 1 through 7 end with a runnable application and passing tests for their
completed scope. The dependency order remains normative. An implementation can
deliver a narrow, tested foundation from a later phase. Before delivery, read
and keep consistent its owning specification and all dependencies through that
phase. Such a slice does not complete its parent phase or a skipped phase.
User-facing status must name the exact implemented slice and its missing
parent-phase scope.

The current runnable foundation contains Phase 1 and narrow slices from later
phases. These slices include six instruments and the eight-slot rack. They also
include Pattern editing, live keyboard recording, generators, transforms, and
advanced event properties. The `spec-007` slice includes fixed mixer strips,
A–D sends, module pedalboards, send chains, the master chain, and the built-in
effect catalog. Playlist transport, appearance Settings, and browser project
persistence are also present. These slices do not complete their parent phases
or acceptance criteria. Remaining work includes advanced instrument editors,
assets and packs, export, accessibility acceptance, and final release evidence.

### 24.9 Close-out

Run a self-critique. Fix every acceptance-blocking gap before declaring the
product complete. Re-run affected tests after each fix. Record only remaining
non-blocking limitations, future work, and verified known issues in their owning
specification or issue.

Verification runs, evidence, and check results are not repository content. Write
them to an ignored temporary path and report them to the user. The repository
records what is required and its implementation status, not how a past run went.

---
