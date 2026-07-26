---
name: verify
description:
  Verify nontrivial Pulsebox changes in the production browser build with
  behavioral, layout, theme, accessibility, persistence, and rendered-audio
  evidence across supported browsers.
---

# Verify Pulsebox

## Prepare the real surface

1. Read AGENTS.md, the changed specification contract, package scripts, and
   Playwright configuration.
2. Build the production browser application and serve that output at the exact
   canonical origin `http://127.0.0.1:4173` using the repository command.
3. Use deterministic project state and assets. Do not use a static design
   prototype as product proof.
4. Close browsers and local servers reliably after the run.

If the build or serve commands do not exist, report verification as blocked. Do
not substitute the prototype or claim a browser pass.

## Drive the changed behavior

- Use Playwright browser contexts for current stable Chrome, Edge, and Firefox.
- Interact through the user-visible surface, including open Shadow DOM roots.
- Unlock Web Audio through a valid user gesture before testing audible actions.
- Verify keyboard and pointer paths, focus restoration, typed command effects,
  undo and redo, save and reload, and playback continuity as applicable.
- Verify 1536 x 1024, 1440 x 900, 1366 x 768, and 1280 x 720, plus the
  below-minimum notice.
- Verify rack, mono, cosmic, analog, and rust themes and high contrast for
  theme-sensitive work.

## Assert more than screenshots

- Assert application state, accessible names, focus, computed styles, CSS
  tokens, element geometry, Canvas pixels, and persisted values as applicable.
- Reject region overlap, page-level scrolling, layout shift during theme
  changes, dead controls, and color-only meaning.
- Use stable animation, playhead, and meter state before pixel comparison.
- Confirm that nonessential animation pauses when hidden.

## Audio evidence

Browser automation cannot prove a subjective listening claim. Use the narrowest
objective evidence available:

- engine and worklet message assertions;
- OfflineAudioContext or repository offline-render output;
- deterministic sample counts, timing, peaks, frequency, channel, and silence
  checks;
- 44.1 kHz and 48 kHz runs when pitch or timing can vary;
- WAV or stem parsing for export contracts.

Record a manual listening procedure for any remaining subjective claim. Never
present a screenshot or state transition as proof that sound is correct.

## Completion

Store temporary evidence under a run-specific ignored path. Report the build,
browsers, viewports, states, assertions, audio method, results, and remaining
manual checks. Complete only when every changed contract has direct evidence.
