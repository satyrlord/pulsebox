# Naming, dependency, and originality audit

**Date:** 2026-07-27

**Repository state:** Phase 1 runnable foundation

**Result:** pass for the current source, shipping text, build, and dependency
scope

## Scope

The audit covered product source, public documentation, agent instructions,
repository configuration, package metadata, lockfile, dependency tree, build
output, and file names. The `design/` and `research/` directories are
non-shipping evidence. No factory samples, presets, icons, or shipping binary
assets exist yet.

## Checks

- Searched case-insensitively for common manufacturer names, historical product
  names, and model-number patterns.
- Reviewed visible product naming and capitalization.
- Reviewed file and configuration paths for remnants from earlier products or
  prohibited native-wrapper architecture.
- Inspected the complete dependency tree for prohibited UI frameworks and the
  direct decoder chain for pinned versions and licenses.
- Built the production artifact and inspected its file list to confirm that
  `design/` and `research/` are excluded.
- Confirmed that policy documents may name prohibited technologies only to state
  the prohibition.

## Repairs and controls

- Removed the stale imported dead-code configuration that named an Electron,
  JSX, and nonexistent worklet source tree.
- Removed Electron main, preload, build, and distribution ignore entries.
- Removed stale broad ignores for codec, data, WAV, CSV, and build-configuration
  paths so future reviewed source, fixtures, factory audio, and tool contracts
  cannot be omitted silently.
- Normalized `Pulsebox` capitalization in agent entry documents.
- Moved the authoritative contracts under `docs/` and updated repository links.
- Added source-policy tests that reject prohibited frameworks, JSX, MIDI,
  service workers and PWA manifests, `ScriptProcessorNode`, executable
  main-thread DSP-core imports, direct UI audio handles, state-held browser
  objects, product API endpoints, layer violations, and shared-layer
  product-specific plugin branches.
- Added an exact package lock and static build launcher for the canonical
  strict-port origin.

## Current evidence

- No prohibited historical product or manufacturer name occurs in the current
  source, package metadata, public documents, or built artifact.
- The prohibited framework dependency query is empty.
- `npm audit` reports zero vulnerabilities across 174 installed dependencies.
- Bundled decoder packages are pinned to `@audio/decode-wav` 1.4.3,
  `@audio/decode-aiff` 1.2.3, and `@audio/decode-flac` 1.2.3. Their package
  metadata and the transitive `@wasm-audio-decoders/flac` 0.2.10 metadata
  declare the MIT license.
- `PULSEBOX` remains reserved for the application mark and browser title;
  documentation uses `Pulsebox`.
- The six approved instrument names and IDs remain those in the
  [product and design foundations specification](../specs/spec-001-product-and-design-foundations.md).
- The current build contains only `index.html`, CSS, the application module, and
  the Acid Bass worklet asset.

## Required future audit

Repeat this audit after any naming, dependency, research, sample, preset,
factory-project, asset, icon, or legal-boundary change. Future reports must also
record provenance for every shipping binary or generated asset and prove that
`research/` is excluded from the production package.
