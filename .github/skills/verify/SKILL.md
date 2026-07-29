---
name: verify
description: >
  Verify Pulsebox in the production browser build. Use for browser, interaction,
  layout, theme, accessibility, persistence, export, or objective audio evidence.
---

# Verify Pulsebox

If the user does not request repair, remain read-only.

## 1. Prepare the production build

1. Read `AGENTS.md`, each changed contract, `package.json`, and Playwright configuration.
   Completion criterion: You know the required browsers, viewports, states, and assertions.
2. Build the production output with a repository command.
   Completion criterion: The production output exists.
3. Serve the output with a repository command.
   Completion criterion: The app responds at exactly `http://127.0.0.1:4173`.
4. Create deterministic project state, assets, meters, and animation.
   Completion criterion: Repeated runs start from the same observable state.
5. Record the exact browser version for Chrome.
   Completion criterion: The release channel has a version in the evidence.

If a build or serve command is absent, report the affected proof as blocked.
Do not use a design prototype as product evidence.

## 2. Test the changed behavior

1. Use the configured Playwright project for the required browser.
   Completion criterion: Chrome exercises every deterministic path.
2. Interact through visible controls and valid user gestures.
   Completion criterion: You test pointer, keyboard, focus, and audio unlock paths.
3. If commands, undo, redo, save, reload, or playback apply, verify them.
   Completion criterion: Each changed state transition has a direct assertion.
4. Test all required supported viewports and the below-minimum state.
   Completion criterion: Geometry, scrolling, and unsupported-size behavior pass.
5. Test `rack`, high contrast, and affected user-theme behavior.
   Completion criterion: Theme changes preserve focus, geometry, state, and playback.

## 3. Assert observable results

Use the narrowest applicable evidence:

- application state and persisted values
- accessible names, roles, focus, and keyboard results
- computed styles, CSS tokens, element geometry, and Canvas pixels
- overlap, page scrolling, and layout shift checks
- stable screenshots with deterministic visual state
- hidden-document animation behavior

Completion criterion: Every changed browser contract has a direct assertion.
A screenshot alone does not prove interaction or state.

## 4. Collect audio evidence

1. Use engine or worklet messages for protocol behavior.
   Completion criterion: The message assertion proves the changed contract.
2. Use offline rendering for objective audio output.
   Completion criterion: Sample count, timing, peak, frequency, channel, or silence checks pass.
3. If pitch or timing can vary, run 44.1 kHz and 48 kHz.
   Completion criterion: Both sample rates meet the same contract.
4. Parse WAV or stem output for export behavior.
   Completion criterion: The file structure and audio values meet the contract.
5. Record a manual listening procedure for subjective claims.
   Completion criterion: No automated result claims to prove sound quality.

## 5. Close the run

1. Store temporary evidence only under an ignored run-specific path.
   Completion criterion: No evidence file enters the repository tree.
2. Close each browser and local server.
   Completion criterion: No verification process remains active.
3. Report build, browser versions, viewports, states, assertions, and results.
   Completion criterion: Every changed contract has evidence or an explicit blocker.

## Completion criterion

Verification is complete after every changed contract has direct evidence.
Report all failed, blocked, subjective, or manual checks. Do not claim more than
the recorded browser and audio evidence proves.
