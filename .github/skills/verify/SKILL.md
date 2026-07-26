---
name: verify
description: Verifies nontrivial MixJam renderer changes against the built Chromium surface using pixels, computed styles, and canvas sampling.
---

# Verify MixJam Renderer

Verify renderer changes against the production bundle. Unit tests stub canvas,
so theme, CSS, drawing, and tracker behavior need evidence from real Chromium.

## Build and Drive

1. Remove `ELECTRON_RUN_AS_NODE` from the command environment.
2. Run `npm run build` and require a clean exit.
3. Create `tmp/verify-<slug>.mjs` inside the repository so Playwright resolves
   the local `node_modules`. Launch `out/main/index.js` with Playwright's
   `_electron`, then use `electronApp.firstWindow()` as the page.
4. Drive only the changed states and write screenshots plus a short evidence
   report under `tmp/verify-<slug>/`.
5. Close the Electron application in a `finally` block.

## Seed Without Real Folders

Inject a mock `window.backendAPI` with `page.addInitScript`, then reload the
first window so the mock runs before the renderer bootstraps. Copy its shape
from `tests/e2e/fixtures.ts` and compare it with
`src/shared/backend-api.ts`. Assert the feature fed by each mocked method; app
boot alone does not prove the mock is complete.

## Drive the Tracker

- Switch theme with
  `page.locator('.theme-selector').selectOption('<key>')`.
- Place a clip by dispatching `DragEvent('drop')` on
  `.tracker-lane-canvas`. Attach a `DataTransfer` whose
  `application/mixjam-sample` value is serialized `FooterSampleDetail`.
- Use a duration that makes the clip wide enough for stable pixel sampling.
- Start playback before asserting the playhead because it renders only while
  playing.

## Assert the Surface

- Read theme tokens through `getComputedStyle(document.documentElement)`.
- Sample canvas pixels through `getImageData`; ignore pixels with alpha below
  250 before comparing exact lowercased theme colors.
- Compare resolved DOM colors as computed `rgb(...)`, not unresolved CSS
  variables.
- Assert behavior or computed values in addition to screenshots.
- Account for the observed `devicePixelRatio` when sampling coordinates.

## Completion Criterion

Verification is complete when the production build passes, the relevant user
states are driven in Electron's Chromium renderer, every changed visual or interaction contract has
an objective assertion, screenshots and an evidence report exist under the
run-specific `tmp/verify-<slug>/` directory, and the Electron application is
closed. Report exact failed assertions without claiming verification passed.
