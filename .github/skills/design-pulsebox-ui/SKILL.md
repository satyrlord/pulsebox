---
name: design-pulsebox-ui
description: Design, implement, audit, or verify Pulsebox interface work against the approved rack layout, native Web Component model, five themes, responsive sizes, accessibility rules, and playback-safe interaction contract.
---

# Design Pulsebox UI

## Read first

1. Read AGENTS.md.
2. Read the full approved product specification.
3. Re-read sections 8, 10, 11, 22, 24.1, and 24.3 for the changed surface.
4. Read THEMING.md when it exists.
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

Finish only when the owning specification, implementation, component tests,
Playwright coverage, and visual evidence agree. Report any browser or
audibility claim that still needs a documented manual check.
