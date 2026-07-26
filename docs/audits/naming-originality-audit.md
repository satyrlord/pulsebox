# Phase 0 naming and originality audit

**Date:** 2026-07-26  
**Repository state:** specification and non-normative prototype stage  
**Result:** pass for the current shipping-text and dependency scope

## Scope

The audit covered repository public documentation, agent instructions,
repository configuration, package metadata, and file names. The `design/`
directory was classified as non-shipping prototype evidence under `AGENTS.md`.
No production source, factory projects, samples, presets, icons, or shipping
visual assets exist yet.

## Checks

- Searched case-insensitively for common manufacturer names, historical product
  names, and model-number patterns.
- Reviewed visible product naming and capitalization.
- Reviewed file and configuration paths for remnants from earlier products or
  prohibited native-wrapper architecture.
- Confirmed that no dependency manifest or lock exists at the contract-only
  stage.
- Confirmed that policy documents may name prohibited technologies only to state
  the prohibition.

## Repairs made

- Removed the stale imported dead-code configuration that named an Electron,
  JSX, and nonexistent worklet source tree.
- Removed Electron main, preload, build, and distribution ignore entries.
- Normalized `Pulsebox` capitalization in agent entry documents.
- Renamed the authoritative specification to `SPEC.md` and updated repository
  links.

## Current evidence

- No prohibited historical product or manufacturer name occurs in a current
  shipping candidate.
- No shipping dependency manifest or lock exists.
- `PULSEBOX` remains reserved for the application mark and browser title;
  documentation uses `Pulsebox`.
- The six approved instrument names and IDs remain those in `SPEC.md`.

## Required future audit

Repeat this audit after any naming, dependency, research, sample, preset,
factory-project, asset, icon, or legal-boundary change. Future reports must also
record provenance for every shipping binary or generated asset and prove that
`research/` is excluded from the production package.
