---
name: design-pulsebox-ui
description: >
  Design, audit, implement, or repair the Pulsebox interface. Use for React UI,
  rack layout, controls, themes, interaction, responsive behavior, or accessibility.
---

# Design the Pulsebox UI

## 1. Select the branch

1. For evidence-backed findings without edits, use audit mode.
   Completion criterion: The scope and evidence sources are explicit.
2. For an authorized design or repair, use implementation mode.
   Completion criterion: The expected behavior and edit scope are explicit.
3. For production-build evidence without repair, use verification mode.
   Completion criterion: The target contracts and browsers are explicit.

## 2. Read the UI contract

1. Read the repository root `AGENTS.md` and the
   [specification index](../../../docs/specs/spec-000-index.md).
   Completion criterion: You know the owning specification and dependencies.
2. Read sections 8, 10, and 22 of
   [spec-003](../../../docs/specs/spec-003-application-shell-and-controls.md).
   Completion criterion: You know the composition, component, and control rules.
3. Read section 11 of
   [spec-001](../../../docs/specs/spec-001-product-and-design-foundations.md).
   Completion criterion: You know the visual language and theme boundary.
4. Read sections 24.1 and 24.3 of
   [spec-010](../../../docs/specs/spec-010-quality-and-delivery.md).
   Completion criterion: You know the accessibility and test requirements.
5. Read [THEMING.md](../../../docs/THEMING.md).
   Completion criterion: You know the token ownership and user-theme rules.

Use `docs/design/claude-mock-up.html` as the approved composition target. Treat
other files under `docs/design/` as non-normative evidence.

## 3. Preserve the product language

- Use the specified rack, studio, mixer, effects, editor, and bottom-bar hierarchy.
- Keep the interface dense, tactile, dark, and precise.
- Use matte surfaces, compact labels, modest depth, and original inline SVG.
- Exclude glass effects, floating cards, excess glow, fake wood, and mobile pills.
- Use color with a second state cue.
- Use only the built-in `rack` theme.
- Apply high contrast as an overlay.
- Apply user themes only through the documented token contract.

Completion criterion: Each visual choice has a contract or approved target.

## 4. Implement React controls

If the skill is in implementation mode, run this stage.

1. Use the repository React component model for the complete UI layer.
   Completion criterion: No second component model exists.
2. Name components in PascalCase and add a kebab-case `data-component` hook.
   Completion criterion: Each rendered component root has the required test hook.
3. Reserve the `pulse-` prefix for CSS properties and storage keys.
   Completion criterion: No component name uses that prefix.
4. Dispatch typed commands for committed edits.
   Completion criterion: No UI component edits the audio graph.
5. Isolate meters, playheads, curves, and other frequent updates.
   Completion criterion: They do not rerender the structural component tree.
6. Clean up listeners, observers, timers, and animation frames.
   Completion criterion: Component removal leaves no active resource.

## 5. Audit or verify the interaction contract

In audit mode, use these items as review checks. Do not require new browser or
visual artifacts. In implementation and verification modes, execute each
applicable check.

1. Test pointer, keyboard, focus, accessible names, and reduced motion.
   Completion criterion: Each changed control supports all applicable input paths.
2. Test 1536 by 1024, 1440 by 900, 1366 by 768, and 1280 by 720.
   Completion criterion: No supported viewport has overlap or page scrolling.
3. Test the below-minimum notice.
   Completion criterion: The editable workspace is absent below either minimum dimension.
4. Test the `rack` theme, high contrast, and affected user-theme tokens.
   Completion criterion: State does not depend on color alone.
5. Use deterministic state for geometry and visual evidence.
   Completion criterion: Behavior and computed values support each screenshot claim.

Invoke `verify` for production-build browser evidence.

## Completion criterion

In audit mode, account for every finding with evidence, priority, owner, and a
verification or repair step.

In implementation mode, make contracts, source, tests, and user documentation
agree. Supply direct evidence for every changed UI contract.

In verification mode, report the exact build, browser versions, viewports,
themes, assertions, results, and limitations.
