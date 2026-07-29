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

Pulsebox uses WCAG 2.2 Level AA success criteria as the measurement source for
supported desktop viewports, without claiming full WCAG conformance below the
product's 1280 × 720 editing boundary. Normal text has at least 4.5:1 contrast;
large text, essential graphics, control boundaries, state indicators, and focus
indicators have at least 3:1 contrast where the applicable criterion requires
it. Pointer targets are at least 24 × 24 CSS pixels or satisfy the WCAG 2.2
spacing exception. Focus is visible and not fully obscured.

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
Redo and evict the oldest Undo entries as needed; they do not fail merely
because history is full. Retained entries pin referenced immutable blobs. The
exact accounting and eviction contract is in `ARCHITECTURE.md`.

Exclude:

- Meter frames.
- Playhead movement.
- Hover.
- Focus.
- Temporary previews.
- Audio power.
- Save-status animation.
- Rack-module and ordinary panel collapse preferences.

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
- Monitor routing without program-path doubling.

Component tests:

- Knob keyboard behavior.
- Knob reset.
- Numeric entry.
- Fader keyboard behavior.
- Toggle ARIA.
- Step painting.
- Drum-trigger painting and pitched-note move and resize.
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
- Toggle and paint steps.
- Record computer-keyboard input.
- Generate a pattern.
- Edit a note.
- Edit automation.
- Change mixer controls.
- Change sends.
- Enable and reorder effects.
- Open detailed effect editor.
- Rename and reorder a named Pattern.
- Reorder the Playlist and change a row repeat count.
- Switch the header meter between L/R and M/S without changing audio.
- Toggle master-effects bypass while the protected limiter stays active.
- Save and reload.
- Crash recovery.
- Export and import.
- WAV export.
- Keyboard-only use.
- Supported layouts at 1536 × 1024, 1440 × 900, 1366 × 768, and 1280 × 720, plus
  the unsupported-size notice below either minimum dimension.
- Change theme from Settings during playback.
- Canonical-origin and strict-port launch behavior.
- First-run supplied-loop path from empty browser storage.
- Missing-pack degraded load and recovery.
- Storage persistence status and quota failure recovery.

Visual regression:

- 1536 × 1024.
- 1440 × 900.
- 1366 × 768.
- 1280 × 720.
- The `rack` theme.
- High-contrast mode.
- Deterministic meters and animation.

### 24.4 Objective evidence thresholds

Use the deterministic fixtures and detailed procedures in `ARCHITECTURE.md`,
`PROJECT-FORMAT.md`, and `THEMING.md`. The following release thresholds are
normative:

- A same-build project save, reload, and offline render at the same sample rate
  produces the same canonical manifest and event schedule. For deterministic
  rendered samples, maximum absolute sample error is at most `1e-6`.
- Across 44.1 kHz and 48 kHz fixtures, scheduled event time differs by at most 1
  millisecond and oscillator pitch differs by at most 1 cent after converting
  results to seconds and hertz.
- Every audible parameter descriptor declares its smoothing curve and duration.
  A constant-input sweep fixture must match that control trajectory within
  `1e-6` and introduce no output discontinuity above `0.02` full scale at a
  control update boundary.
- Offline 48 kHz to 44.1 kHz resampling is deterministic, keeps passband error
  within 0.1 dB from 20 Hz through 20 kHz, and keeps aliased or imaged test-tone
  energy at or below -90 dBFS.
- Automated deterministic checks run in the current stable Chrome release
  channel. The evidence records the exact version. Required real-audio checks
  run manually when automation cannot observe the physical result.
- Accessibility evidence checks the numeric requirements in section 24.1 at
  every supported viewport, in the `rack` theme and high-contrast mode.
- The first-sound procedure in section 21.8 passes all five runs in every
  supported browser on the recorded release host.
- Before final release, five people unfamiliar with Pulsebox attempt to start
  the supplied loop from fresh browser storage using only visible product
  guidance. At least four must produce audible playback within one minute
  without assistance. Record anonymized elapsed times and failure points.

### 24.5 Suggested file structure

```text
src/
  main.ts
  app/
  state/
  engine/
    worklets/
    transport/
    routing/
    modules/
    effects/
  components/
    transport/
    library/
    rack/
    mixer/
    effects/
    editor/
    song/
    controls/
  persistence/
  themes/
  styles/
  utilities/
tests/
  unit/
  component/
  e2e/
  visual/
docs/
  instruments/
research/  # non-shipping named source notes; excluded from production packages and public docs
```

Keep audio processors, state logic, UI components, persistence, and theme tokens
in separate modules. Do not create one enormous component, engine file, or
global stylesheet.

### 24.6 Browser support

Support the current stable release of Chrome. Other browsers are outside MVP
support. Run every deterministic browser-specific audio, file, Canvas,
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
- Repository-wide case-insensitive naming and dependency audit report under
  `docs/audits/`.

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

### 24.8 Build phases

Phase 0: Contract, legal boundary, research policy, state model, theme tokens,
project format, repository consistency checks, and independent architecture
review. Phase 0 ends with complete reviewed documents and passing documentation,
link, naming, and contract-consistency checks. It does not require a runnable
product application or product tests.

Phase 1: Application shell, controls, state spine, AudioWorklet spine,
transport, Acid Bass, three-slot functional rack. During Phase 1, the first
three slots of the durable eight-slot model are exposed. The development seed
loads Acid Bass in slot 01 and leaves slots 02 and 03 available for Add or
Duplicate. This seed is not the final default project or the secondary starter
template.

Phase 2: Remaining instruments, sample layers, eight-slot rack, overview,
internal voice mixers.

Phase 3: Named project Patterns, module-aware Piano Roll, live input, generators,
transforms, bounded full Undo.

Phase 4: Main mixer, voice inserts, module pedalboards, send chains, master
chain, complete effect catalog.

Phase 5: Named-Pattern Playlist, Pattern automation, and Pattern/Song transport
modes.

Phase 6: The `rack` theme, user theme import, accessibility, default projects,
visual polish, performance measurements.

Phase 7: Persistence, recovery, project import/export, WAV and stem export,
final browser matrix.

Phases 1 through 7 end with a runnable application and passing tests for their
completed scope. The dependency order remains normative, but an implementation
change may deliver a narrow, tested vertical foundation from a later phase once
the owning specification and every dependency through that phase have been
read and kept consistent. Such a slice does not mark its parent phase or any
skipped phase complete. User-facing status must name the exact implemented
slice and the missing parent-phase scope.

The current runnable foundation contains Phase 1 plus narrow slices for
Drumline Six, named Pattern storage, basic channel mixing, Playlist transport,
appearance Settings, and browser project persistence. These slices prove shared
contracts and integration seams. They do not complete Phases 2 through 7 or
their acceptance criteria.

### 24.9 Close-out

Run a self-critique. Fix every acceptance-blocking gap before declaring the
product complete. Re-run affected tests after each fix. Record only remaining
non-blocking limitations, future work, and verified known issues in their owning
specification or issue.

Verification runs, evidence, and check results are not repository content. Write
them to an ignored temporary path and report them to the user. The repository
records what is required and its implementation status, not how a past run went.

---
