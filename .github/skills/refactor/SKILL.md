---
name: refactor
description: Make a narrow, behavior-preserving Pulsebox cleanup that reduces complexity without changing approved product behavior or public contracts.
---

# Refactor Pulsebox

Read AGENTS.md, the owning specification sections, the affected implementation,
and its tests. Keep the change narrow and validate after each coherent step.
Do not mix a refactor with a feature or drive-by cleanup.

Protect these Pulsebox seams:

- Engine, state, and UI ownership. Do not move DOM into engine or state, live
  AudioNodes into state, or audio-graph edits into UI components.
- Typed commands and undo. Preserve inverse data and gesture coalescing.
- Plugin contracts and stable IDs. Do not replace registry-driven behavior
  with product-specific branches or positional references.
- Custom Element lifecycle. Preserve registration, Shadow DOM styling, typed
  composed events, focus behavior, and cleanup on disconnect.
- AudioWorklet processing. Preserve host-supplied frame counts, bounded memory,
  message ordering, parameter smoothing, and offline-render parity.
- Persistence. Preserve schema versions, migrations, import validation,
  embedded assets, and global-versus-project preference boundaries.
- Themes. Preserve the token contract and avoid theme-specific TypeScript or
  markup.

Add a focused regression test before a risky structural change. Use
dead-code-audit for broad reachability cleanup and add-feature if an approved
contract must change.

Complete only when behavior and contracts are unchanged, complexity is
measurably lower, all affected checks pass, and every changed line serves the
refactor.
