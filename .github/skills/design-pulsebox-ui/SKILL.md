---
name: design-pulsebox-ui
description: Use when the user wants Pulsebox interface work designed, built, audited, or fixed — rack layout, Web Components, themes, controls, or accessibility.
---

# Design Pulsebox UI

## Select a mode

- In audit mode, remain read-only. Report evidence-backed usability, layout,
  accessibility, theme, and interaction findings. Do not require implementation
  or visual-regression artifacts to complete the audit.
- In implementation mode, edit only when the user explicitly requests a design
  or fix. Keep contracts, source, tests, and user documentation aligned.
- In verification mode, remain read-only unless the user also requests repair.
  Exercise the built product and record objective browser evidence.

## Read first

1. Read repository root `AGENTS.md`.
2. Read the [specification index](../../../docs/specs/spec-000-index.md), then
   the applicable build-order specifications and dependencies in full.
3. Re-read sections 8, 10, and 22 in the
   [application shell and controls specification](../../../docs/specs/spec-003-application-shell-and-controls.md),
   section 11 in the
   [product and design foundations specification](../../../docs/specs/spec-001-product-and-design-foundations.md),
   and sections 24.1 and 24.3 in the
   [quality and delivery specification](../../../docs/specs/spec-010-quality-and-delivery.md)
   for the changed surface.
4. Read [docs/THEMING.md](../../../docs/THEMING.md).
5. Treat files under design/ as non-normative prototypes unless the user or
   specification explicitly adopts a detail.

## Preserve the product language

- Use the fixed rack, studio, mixer, effects, editor, and bottom-bar hierarchy.
- Keep the interface dense, tactile, dark, and precise.
- Use matte black and graphite surfaces, restrained status light, compact
  technical labels, modest depth, and original inline SVG icons.
- Avoid glassmorphism, translucent floating cards, excessive glow or gradients,
  generic dashboard cards, cartoon controls, fake wood, and large mobile pills.
- Keep module accents local. Never use color as the only signal.
- Use only the five built-in theme IDs: rack, mono, cosmic, analog, and rust.
  Keep rack as the default. High contrast layers over every theme.
- Implement themes only through the documented CSS token contract. Do not add
  theme-specific TypeScript or markup.

## Build native controls

- Use native Custom Elements and the pulse- prefix.
- Use Shadow DOM for reusable controls and isolated leaf components.
- Do not introduce a UI framework, JSX, virtual DOM, CSS framework, or
  third-party music control.
- Render structure once and patch state. Keep high-frequency meters, playheads,
  and curves isolated from structural DOM work.
- Make every visible operational control change state, audio, navigation, or a
  documented preference.
- Dispatch typed commands. Never edit the audio graph from a UI component.

## Verify the interaction contract

- Cover pointer and keyboard operation, focus, accessible names, tooltips,
  reduced motion, contrast, and non-color cues.
- Keep playback running during compatible editing, theme changes, navigation,
  and modal editor use.
- Verify 1536 x 1024, 1440 x 900, 1366 x 768, and 1280 x 720, plus the
  below-minimum notice. Reject overlap and page-level scrolling.
- Test every changed theme token in all five themes and high-contrast mode.
- Use deterministic state for screenshots and assert behavior or computed
  values in addition to pixels.
- Use the verify skill for production-build browser evidence.

## Completion

- Audit mode: finish with prioritized findings, evidence, affected contracts,
  and concrete verification or repair steps.
- Implementation mode: finish only when the owning specification,
  implementation, tests, user documentation, and required evidence agree.
- Verification mode: finish with the exact build, browsers, viewports, themes,
  assertions, and limitations exercised.

Report any browser or audibility claim that still needs a documented manual
check.
