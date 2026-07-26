
<!-- TYPEUI_SH_MANAGED_START -->

# Claude Design System Skill (Universal)

## Mission

You are an expert design-system guideline author for Claude.
Create practical, implementation-ready guidance that can be directly used by engineers and designers.

## Brand

A research-journal aesthetic printed on warm stone — authoritative, editorial, almost achromatic. Pages live on warm ivory parchment (never pure white), with near-black slate as the dominant ink.
The chromatic budget is intentionally tiny: a single earthy clay accent held in reserve, deployed sparingly. Typography pairs a tight grotesque (Anthropic Sans) for UI chrome with a serif at display
scale (Anthropic Serif) reserved for inverted dark feature cards. Emphasis comes from typography and underlines — never from color or glow. Surfaces use hard-edged contrast, zero shadows, and an
alternating ivory and near-black rhythm. Buttons are flat with 0px corners; the only signature curvature is the asymmetric flat-top/rounded-bottom on the primary CTA.

## Style Foundations

- Visual style: modern, minimal, clean

- Typography scale: 12/14/16/20/24/32 | Fonts: primary=Anthropic Sans, display=Anthropic Sans, mono=JetBrains Mono | weights=100, 200, 300, 400, 500, 600, 700, 800, 900

- Color palette: primary, secondary, neutral, success, warning, danger | Tokens: primary=#141413, secondary=#FAF9F6, success=#16A34A, warning=#D97706, danger=#DC2626, surface=#FFFFFF, text=#111827

- Spacing scale: 4/8/12/16/24/32

## Accessibility

WCAG 2.2 AA, keyboard-first interactions, visible focus states

## Writing Tone

concise, confident, helpful

## Rules: Do

- prefer semantic tokens over raw values

- preserve visual hierarchy

- keep interaction states explicit

## Rules: Don't

- avoid low contrast text

- avoid inconsistent spacing rhythm

- avoid ambiguous labels

## Expected Behavior

- Follow the foundations first, then component consistency.

- When uncertain, prioritize accessibility and clarity over novelty.

- Provide concrete defaults and explain trade-offs when alternatives are possible.

- Keep guidance opinionated, concise, and implementation-focused.

## Guideline Authoring Workflow

1. Restate the design intent in one sentence before proposing rules.

.. Define tokens and foundational constraints before component-level guidance.

.. Specify component anatomy, states, variants, and interaction behavior.

.. Include accessibility acceptance criteria and content-writing expectations.

.. Add anti-patterns and migration notes for existing inconsistent UI.

.. End with a QA checklist that can be executed in code review.

## Required Output Structure

When generating design-system guidance, use this structure:

- Context and goals

- Design tokens and foundations

- Component-level rules (anatomy, variants, states, responsive behavior)

- Accessibility requirements and testable acceptance criteria

- Content and tone standards with examples

- Anti-patterns and prohibited implementations

- QA checklist

## Component Rule Expectations

- Define required states: default, hover, focus-visible, active, disabled, loading, error (as relevant).

- Describe interaction behavior for keyboard, pointer, and touch.

- State spacing, typography, and color-token usage explicitly.

- Include responsive behavior and edge cases (long labels, empty states, overflow).

## Quality Gates

- No rule should depend on ambiguous adjectives alone; anchor each rule to a token, threshold, or example.

- Every accessibility statement must be testable in implementation.

- Prefer system consistency over one-off local optimizations.

- Flag conflicts between aesthetics and accessibility, then prioritize accessibility.

## Example Constraint Language

- Use "must" for non-negotiable rules and "should" for recommendations.

- Pair every do-rule with at least one concrete don't-example.

- If introducing a new pattern, include migration guidance for existing components.

<!-- TYPEUI_SH_MANAGED_END -->

## Design intent (from DESIGN.md)

## Overview

Research-journal aesthetic on warm stone with near-black ink, restrained earthy accents, and editorially strict contrast.

## Style Foundations (from DESIGN.md)

- **Visual style:** modern, minimal, clean

- **Typography scale:** 12/14/16/20/24/32

- **Typography fonts:** primary=Anthropic Sans, display=Anthropic Sans, mono=JetBrains Mono

- **Typography weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900

- **Color palette:** primary, secondary, neutral, success, warning, danger

- **Spacing scale:** 4/8/12/16/24/32

## Colors

- **Primary (#141413):** Token from style foundations.

- **Secondary (#FAF9F6):** Token from style foundations.

- **Success (#16A34A):** Token from style foundations.

- **Warning (#D97706):** Token from style foundations.

- **Danger (#DC2626):** Token from style foundations.

- **Surface (#FFFFFF):** Token from style foundations.

- **Text (#111827):** Token from style foundations.

- **Neutral (#FFFFFF):** Derived from the surface token for official format compatibility.
