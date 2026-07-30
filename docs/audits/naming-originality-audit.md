# Naming, dependency, and originality audit

**Date:** 2026-07-28

**Repository state:** Phase 1 runnable foundation with the theme, appearance,
and user-theme import implementation

**Result:** pass for the current source, shipping text, build, and dependency
scope

## Scope

The audit covered product source, public documentation, agent instructions,
repository configuration, package metadata, lockfile, dependency tree, build
output, and file names. The `research/` directory is non-shipping evidence. No
factory samples, presets, or icons exist yet. The only shipping binary assets
are the bundled typeface files under `src/styles/fonts/`.

## Checks

- Searched case-insensitively for common manufacturer names, historical product
  names, and model-number patterns.
- Reviewed visible product naming and capitalization.
- Reviewed file and configuration paths for remnants from earlier products or
  prohibited native-wrapper architecture.
- Inspected the complete dependency tree and the direct decoder chain for pinned
  versions and licenses.
- Built the production artifact and inspected its file list to confirm that
  `research/` is excluded.
- Confirmed that policy documents may name prohibited technologies only to state
  the prohibition.

## Repairs and controls

- Removed the stale imported dead-code configuration that named an Electron,
  JSX, and nonexistent worklet source tree.
- Removed Electron main, preload, build, and distribution ignore entries.
- Removed stale broad ignores for codec, data, WAV, CSV, and build-configuration
  paths.
- These removals prevent silent omission of source, fixtures, factory audio, and
  tool contracts.
- Normalized `Pulsebox` capitalization in agent entry documents.
- Moved the authoritative contracts under `docs/` and updated repository links.
- Added source-policy tests that reject prohibited frameworks, JSX, MIDI,
  service workers, PWA manifests, and `ScriptProcessorNode`.
- The tests also reject main-thread DSP-core imports, direct UI audio handles,
  state-held browser objects, and product API endpoints.
- The tests reject layer violations and shared-layer product-specific plugin
  branches.
- Added an exact package lock and static build launcher for the canonical
  strict-port origin.

## Current evidence

- No prohibited historical product or manufacturer name occurs in the current
  source, package metadata, public documents, or built artifact.
- `npm audit` reports zero vulnerabilities across 174 installed dependencies.
- Bundled decoder packages are pinned to `@audio/decode-wav` 1.4.3,
  `@audio/decode-aiff` 1.2.3, and `@audio/decode-flac` 1.2.3. Their package
  metadata and the transitive `@wasm-audio-decoders/flac` 0.2.10 metadata
  declare the MIT license.
- The decoder packages are not unused dependencies. They implement the
  `SampleDecoder` engine port that `docs/ARCHITECTURE.md` requires, and they
  ship in the decoder worker chunk of the production build. README.md claims
  this decoder foundation as a runnable later-phase slice. The sample-import
  UI arrives with the persistence and export specification.
- Shipping binary asset provenance: the bundled typefaces Barlow, Barlow Semi
  Condensed, Michroma, and Share Tech Mono come from Google Fonts as `woff2`
  files in `src/styles/fonts/`. Each family uses the SIL Open Font License.
  The license text for each family ships beside its font files. The typography
  tests verify the family allowlist, the local bundled sources, and the
  license texts. These faces are licensed third-party fonts, not Pulsebox
  artwork, and they copy no historical product type treatment.
- `PULSEBOX` remains reserved for the application mark and browser title.
  Documentation uses `Pulsebox`.
- The six approved instrument names and IDs remain those in the
  [product and design foundations specification](../specs/spec-001-product-and-design-foundations.md).
- The current build contains only `index.html`, CSS, the application module, the
  Acid Bass worklet asset, and the sample decoder worker.
- The built-in `rack` theme palette and the high-contrast overlay are original
  token values authored for Pulsebox. They carry no copied color scheme, no
  hardware artwork, and no community theme data.
- The theme identifier and visible label are the approved `rack` set per
  decision `D79`. The theme name refers to no real product.

## Required future audit

Repeat this audit after any naming, dependency, research, sample, preset,
factory-project, asset, icon, or legal-boundary change. Future reports must also
record provenance for every shipping binary or generated asset and prove that
`research/` is excluded from the production package.
