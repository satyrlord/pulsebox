---
name: verify
description: >
  Verify Pulsebox in the production browser build. Use for browser, interaction,
  layout, theme, accessibility, persistence, export, or objective audio evidence.
---

# Verify Pulsebox

Remain read-only unless the user also requests repair.

## 1. Prepare the production surface

1. Read `AGENTS.md`, each changed contract, `package.json`, and Playwright configuration.
   Finish when you know the required browsers, viewports, states, and assertions.
2. Build and serve the production output with repository commands.
   Finish when the app responds at exactly `http://127.0.0.1:4173`.
3. Create deterministic project state, assets, meters, and animation.
   Finish when repeated runs start from the same observable state.
4. Record the exact browser version for Chrome.
   Finish when the release channel has a version in the evidence.

If a build or serve command is absent, report the affected proof as blocked.
Do not use a design prototype as product evidence.

## 2. Drive the changed behavior

1. Use the configured Playwright project for the required browser.
   Finish when Chrome exercises every deterministic path.
2. Interact through visible controls and valid user gestures.
   Finish when you test pointer, keyboard, focus, and audio unlock paths.
3. Verify commands, undo, redo, save, reload, and playback when applicable.
   Finish when each changed state transition has a direct assertion.
4. Test all required supported viewports and the below-minimum state.
   Finish when geometry, scrolling, and unsupported-size behavior pass.
5. Test `rack`, high contrast, and affected user-theme behavior.
   Finish when theme changes preserve focus, geometry, state, and playback.

## 3. Assert observable results

Use the narrowest applicable evidence:

- application state and persisted values
- accessible names, roles, focus, and keyboard results
- computed styles, CSS tokens, element geometry, and Canvas pixels
- overlap, page scrolling, and layout shift checks
- stable screenshots with deterministic visual state
- hidden-document animation behavior

Finish this stage when every changed browser contract has a direct assertion.
A screenshot alone does not prove interaction or state.

## 4. Collect audio evidence

1. Use engine or worklet messages for protocol behavior.
   Finish when the message assertion proves the changed contract.
2. Use offline rendering for objective audio output.
   Finish when sample count, timing, peak, frequency, channel, or silence checks pass.
3. Run 44.1 kHz and 48 kHz when pitch or timing can vary.
   Finish when both sample rates meet the same contract.
4. Parse WAV or stem output for export behavior.
   Finish when the file structure and audio values meet the contract.
5. Record a manual listening procedure for subjective claims.
   Finish when no automated result claims to prove sound quality.

## 5. Close the run

1. Store temporary evidence only under an ignored run-specific path.
   Finish when no evidence file enters the repository tree.
2. Close each browser and local server.
   Finish when no verification process remains active.
3. Report build, browser versions, viewports, states, assertions, and results.
   Finish when every changed contract has evidence or an explicit blocker.

## Completion criterion

Complete verification only when every changed contract has direct evidence.
Report all failed, blocked, subjective, or manual checks. Do not claim more than
the recorded browser and audio evidence proves.
