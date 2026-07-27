# Phase 1 verification evidence

**Date:** 2026-07-27  
**Scope:** Phase 1 runnable foundation and 2026-07-27 audit repairs  
**Baseline commit:** `8061152db5561a03171f0ab51f7333c9af3e72bb`

Verification was performed against the current dirty working tree. The baseline
commit predates the Phase 1 source and these repairs, so the commit alone cannot
reproduce the results.

## Environment

- Microsoft Windows 11 Pro 10.0.26200.
- Node.js 24.18.0 and npm 12.0.1.
- Google Chrome 150.0.7871.187.
- Microsoft Edge 150.0.4078.99.
- Firefox 153.0.
- Browser audio contexts reported 48 kHz and `running` after activation.
- Browser viewport matrix: 1536 x 1024, 1440 x 900, 1366 x 768, 1280 x 720,
  plus 1279 x 719 for the unsupported-size behavior.
- Default rack theme and the deterministic built-in theme/high-contrast
  component fixture were exercised.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed with zero warnings. |
| `npm run typecheck` | Passed. |
| `npm run test` | Passed: 17 files and 86 tests. |
| `npm run test:e2e` | Passed: 60 of 60 cases in Chrome, Edge, and Firefox against the built artifact. |
| `npm run build` | Passed; emitted the client CSS/module and Acid Bass worklet. |
| `npm audit --json` | Passed with 0 vulnerabilities across 174 dependencies. |
| Markdown lint | Passed with 0 issues across 94 files. |
| Relative Markdown links | Passed as part of `npm run test`. |
| Naming/originality scan | Passed with no prohibited-name match in shipping source, tests, scripts, configuration, or public documentation. |
| Repository skill validation | All 13 skills passed structural validation; the `.github` and `.agents` views matched for all 28 files. |
| `git diff --check` | Passed. |

Focused protocol evidence passed 21 tests after the browser diagnosis and
independent review. It covers envelope validation, missing `TextEncoder`,
handshake, sequencing, acknowledgements, stale and duplicate messages, gaps,
malformed input, backpressure, queue bounds, lifecycle, disposal, authoritative
store revisions, minimal engine projection, and one bounded recovery.

The Phase 0 project-format fixture catalog passed its completeness checks: all
required valid, rejection, repair/degradation, and storage/recovery definitions
have unique stable IDs and expected outcomes. Concrete archives and persistence
implementations remain Phase 7 work.

## Browser evidence

A cross-browser Playwright run against the canonical
`http://127.0.0.1:4173` origin passed all 57 cases in Chrome, Edge, and Firefox.
The run covered the Phase 1 shell, command Undo, the removal Undo notice, real
AudioWorklet activation and resume, failed audio activation, hidden-document
animation behavior, component semantics, themes, target geometry, supported
viewports, and the below-minimum notice.

A later full `npm run test:e2e` run completed the outstanding production-artifact
check. It built the client, started the repository static launcher on the
canonical port, and passed 60 of 60 cases across Chrome, Edge, and Firefox. The
three added cases cover the wheel-burst coalescing boundary. This closes the
earlier gap where only the development server had been exercised.

After the final fault-recovery repair, a current-source Play activation smoke
again reached `Audio active` in Chrome, Edge, and Firefox.

The first browser run found two repaired defects:

- worklet payload sizing depended on `TextEncoder`, which is absent in the
  AudioWorklet global scope; an exact UTF-8 byte counter and unit regression now
  cover that environment;
- the Undo-notice test selected every live region instead of the notice itself;
  it now uses the owned notice selector.

The first fully parallel matrix also exposed Firefox audio-context contention.
The exact case passed five serial repetitions. Playwright now keeps tests within
each file serial while still running files and browser projects concurrently;
the resulting six-worker matrix passed 57 of 57.

## Independent review

The required clean-context review found three acceptance blockers. All three
were repaired before this report was finalized:

- an untracked GitHub Pages workflow conflicted with the local-only product
  boundary; it was removed and the artifact policy now rejects Pages deployment
  actions;
- the worklet adapter had generated a session-local revision instead of using
  accepted store revisions; the composition boundary now queues minimal typed
  engine deltas, reserves bounded full projection for initial state and project
  replacement, and has a store-to-worklet recovery regression. Follow-up review
  also required fault recovery to restore the last acknowledged revision and
  snapshot first, then send at most one current authoritative snapshot before
  resuming. Tests cover both failure before acknowledgement and recovery when
  acknowledged and current state already agree;
- module removal retained stale collapse preference; removal now clears it and
  a collapsed, removed, then undone module is verified to return expanded.

## Post-review protocol repairs

A follow-up review found that the adapter and the processor were each tested
only against hand-written mocks, so the two halves of one protocol had drifted
apart. Pairing the real controller with the real processor exposed three
defects, all repaired:

- the controller required an acknowledgement's revision to equal the revision of
  the envelope it acknowledged, but the processor stamps acknowledgements with
  its own current revision. Every contract-mandated `stale` acknowledgement was
  therefore misread as a fault, which tore down and rebuilt the live worklet
  mid-playback and produced an audible dropout. The controller now faults only
  on an acknowledgement of a sequence it never sent;
- a `stale` acknowledgement recorded the ignored envelope's values as the
  acknowledged snapshot, so fault recovery could restore a value the processor
  had deliberately discarded. Stale acknowledgements now clear their envelopes
  without recording state;
- `dispose()` dereferenced its node after posting, but the processor can confirm
  disposal re-entrantly inside that call and clear the node first, throwing a
  `TypeError`. Disposal now captures the node before posting.

`tests/unit/engine/acid-bass-endpoint-pairing.test.ts` wires the two endpoints
together through a structured-clone transport and is the regression seam for all
three. The two stale-revision cases were confirmed to fail against the previous
controller logic and pass after the repair.

## Remaining verification

- The Phase 1 browser checks used 48 kHz. The required 44.1 kHz live-audio run,
  rendered-audio tolerance suite, and physical listening checks remain release
  evidence, as already stated in the product contracts.
- The protocol recovery paths have deterministic unit coverage, but an induced
  real-browser `processorerror` recovery check is not yet automated.

The largest remaining blind spot is rendered-audio behavior: every audio check
here is structural or protocol-level, so no dropout-free or listening claim is
made by this report. No performance claim is made either.
