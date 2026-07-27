# Pulsebox theming contract

**Status:** Normative contract with Phase 1 token and control implementation

**Contract version:** 1

**Owner:** UI layer

This document defines the complete theme boundary for the Pulsebox MVP. It
specializes section 11 of the
[product and design foundations specification](specs/spec-001-product-and-design-foundations.md),
section 23.1 of the
[persistence and export specification](specs/spec-009-persistence-and-export.md),
sections 24.1 and 24.3 of the
[quality and delivery specification](specs/spec-010-quality-and-delivery.md), and
acceptance criteria 39 through 41 and 67 of
[release acceptance](specs/spec-012-release-acceptance.md). Reconcile all
affected owners in the same accepted product change before implementation.

## 1. Scope and invariants

Themes change appearance only. They never change project data, audio, control
behavior, navigation, text, accessible names, or the application hierarchy.

The following rules are mandatory:

- Ship exactly the built-in theme IDs `rack`, `mono`, `cosmic`, `analog`, and
  `rust`. `rack` is the default for a new installation.
- Apply high contrast as an overlay on any built-in or valid user theme. It is
  not a sixth theme.
- Implement themes as CSS custom-property values owned by the UI layer.
- Do not add theme-specific TypeScript branches, HTML, SVG structure, audio
  behavior, or component structure.
- Switching theme or contrast mode must not rebuild the audio graph, stop
  playback, replace component DOM, move focus, or create an undo entry.
- Theme switching must not change computed geometry or create layout shift.
- Project manifests, browser project records, autosaves, recovery records, and
  `.pulsebox` packages must never contain theme or contrast settings.
- User theme import accepts the JSON contract in section 7 only. Raw CSS and CSS
  embedded in JSON are not supported.
- No theme may make color the only indication of selection, state, warning,
  clipping, mute, solo, bypass, or focus.

Built-in values are product-owned design data. A change to a built-in value or
to this token vocabulary is a product-contract change. It requires an update to
this document, the relevant tests, and the owning product specification when
user-visible behavior changes.

## 2. Built-in theme direction

| ID       | Label  | Required direction                                         |
| -------- | ------ | ---------------------------------------------------------- |
| `rack`   | Rack   | Graphite and steel studio hardware. This is the default.   |
| `mono`   | Mono   | Near-black, low-chroma, minimal, and sharply separated.    |
| `cosmic` | Cosmic | Deep navy with restrained cyan and violet detail.          |
| `analog` | Analog | Warm charcoal and silver-metal cues without fake wood.     |
| `rust`   | Rust   | Dark iron and restrained oxide detail without texture art. |

All five themes remain dark studio interfaces. Theme direction does not permit
glassmorphism, translucent floating cards, photorealistic texture, copied
hardware art, excessive glow, large pill containers, or decorative controls.
Gradients are not theme tokens and are not used for ordinary surfaces.

## 3. Token architecture

Every token is defined on the application theme host. Shadow-DOM components
consume inherited tokens and may map them to private component properties. They
must not redeclare different product values.

There are three token classes:

1. Palette tokens vary by theme and form the user-theme allowlist.
2. Foundation tokens are fixed across themes and are not user-authorable.
3. Module accent tokens are scoped by instrument identity and are not
   user-authorable.

No component may read the active theme ID to select styles. Components use
semantic tokens only. A missing token is an implementation error; production CSS
must include the `rack` value as its final fallback, for example:

```css
color: var(--pulse-color-text-primary, #f3f5f6);
```

### 3.1 Required palette tokens

Every built-in theme and imported user theme must provide every token in this
table. These names are the complete required user-theme allowlist.

| Token                           | Meaning                                   |
| ------------------------------- | ----------------------------------------- |
| `--pulse-color-app`             | Viewport and application background       |
| `--pulse-color-surface-panel`   | Main panel and rack enclosure             |
| `--pulse-color-surface-control` | Raised control and toolbar surface        |
| `--pulse-color-surface-inset`   | Recessed editor, grid, and sequencer well |
| `--pulse-color-text-primary`    | Primary text and operational values       |
| `--pulse-color-text-secondary`  | Secondary labels and supporting text      |
| `--pulse-color-border-default`  | Ordinary control and panel boundary       |
| `--pulse-color-border-strong`   | Selected and emphasized boundary          |
| `--pulse-color-accent`          | General active and selected accent        |
| `--pulse-color-on-accent`       | Text or icon drawn on the accent          |
| `--pulse-color-focus-inner`     | Inner band of the two-color focus ring    |
| `--pulse-color-focus-outer`     | Outer band of the two-color focus ring    |
| `--pulse-color-control-track`   | Knob, fader, and progress track           |
| `--pulse-color-control-fill`    | Active knob, fader, and progress fill     |
| `--pulse-color-meter-low`       | Ordinary meter range                      |
| `--pulse-color-meter-mid`       | Meter warning range                       |
| `--pulse-color-meter-high`      | Meter hot and clip range                  |
| `--pulse-color-status-danger`   | Error and destructive status              |
| `--pulse-color-status-warning`  | Warning and attention status              |
| `--pulse-color-status-success`  | Success and ready status                  |

### 3.2 Optional palette tokens

These names are the complete optional user-theme allowlist. If omitted, the
validated `rack` value is used. Any supplied optional value must still validate;
an invalid known token is never silently replaced.

| Token                           | Meaning                            |
| ------------------------------- | ---------------------------------- |
| `--pulse-color-overlay`         | Opaque modal and menu surface      |
| `--pulse-color-text-muted`      | Disabled or incidental text        |
| `--pulse-color-selection`       | Selection background               |
| `--pulse-color-control-thumb`   | Fader cap, knob marker, and handle |
| `--pulse-color-meter-track`     | Unlit meter background             |
| `--pulse-color-status-info`     | Informational status               |
| `--pulse-color-disabled`        | Disabled non-text component detail |
| `--pulse-color-scrollbar-track` | Visible scrollbar track            |
| `--pulse-color-scrollbar-thumb` | Visible scrollbar thumb            |
| `--pulse-shadow-control`        | Modest control depth               |
| `--pulse-shadow-panel`          | Modest panel depth                 |

No other token is user-authorable in contract version 1. Unknown token names are
ignored and included in the import report. They do not become CSS custom
properties.

### 3.3 Fixed foundation tokens

Foundation values are identical in every theme. They prevent a theme change from
moving content or changing text metrics. They are not accepted from user theme
JSON.

| Group              | Tokens and exact values                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Fonts              | `--pulse-font-ui: system-ui, sans-serif`; `--pulse-font-mono: ui-monospace, monospace`                                            |
| Type size          | `--pulse-type-10: 10px`; `--pulse-type-12: 12px`; `--pulse-type-14: 14px`; `--pulse-type-16: 16px`; `--pulse-type-20: 20px`       |
| Line height        | `--pulse-line-tight: 1.2`; `--pulse-line-normal: 1.4`; `--pulse-line-roomy: 1.6`                                                  |
| Weight             | `--pulse-weight-normal: 400`; `--pulse-weight-medium: 500`; `--pulse-weight-strong: 650`                                          |
| Spacing 0-4        | `--pulse-space-0: 0`; `--pulse-space-1: 4px`; `--pulse-space-2: 8px`; `--pulse-space-3: 12px`; `--pulse-space-4: 16px`            |
| Spacing 5-10       | `--pulse-space-5: 20px`; `--pulse-space-6: 24px`; `--pulse-space-8: 32px`; `--pulse-space-10: 40px`                               |
| Radius             | `--pulse-radius-control: 4px`; `--pulse-radius-panel: 6px`; `--pulse-radius-dialog: 8px`; `--pulse-radius-round: 999px`           |
| Border             | `--pulse-border-thin: 1px`; `--pulse-border-strong: 2px`                                                                          |
| Target and control | `--pulse-target-min: 24px`; `--pulse-control-compact: 24px`; `--pulse-control-standard: 32px`; `--pulse-scrollbar-size: 10px`     |
| Focus              | `--pulse-focus-width: 2px`; `--pulse-focus-gap: 1px`                                                                              |
| Motion             | `--pulse-duration-fast: 80ms`; `--pulse-duration-standard: 140ms`; `--pulse-duration-slow: 220ms`; `--pulse-motion-distance: 4px` |

`--pulse-radius-round` is allowed only for circular controls and compact switch
tracks. It does not authorize pill-shaped panels or buttons. Text below 10 CSS
pixels is prohibited. Operational values use `--pulse-type-12` or larger.

### 3.4 Module-scoped accent tokens

The rack module host sets all four tokens below. Descendant controls inherit
them. These values identify the module but never fill the whole faceplate.

| Module | `--module-accent` | `--module-accent-muted` | `--module-led` | `--module-control-ring` |
| ------ | ----------------- | ----------------------- | -------------- | ----------------------- |
| `BASS` | `#9BE564`         | `#496B36`               | `#B8FF7A`      | `#79B84D`               |
| `SIX`  | `#FFB44A`         | `#76552A`               | `#FFD078`      | `#D98E2F`               |
| `BOOM` | `#FF6B5F`         | `#763B37`               | `#FF9188`      | `#D84E45`               |
| `NINE` | `#B890FF`         | `#594776`               | `#CEB2FF`      | `#9670D8`               |
| `SEV`  | `#5AAEFF`         | `#315979`               | `#86C5FF`      | `#3E8ED8`               |
| `FIVE` | `#4ADFC7`         | `#2B6D63`               | `#7FF2DF`      | `#32B8A3`               |

Module identity also uses text, position, shape, or iconography. Components must
fall back to the general accent tokens when no module scope exists.

## 4. Built-in palette values

Every listed value is normative. Colors use opaque six-digit sRGB hex. The
shadow grammar is defined in section 8.

| Token                           | `rack`                       | `mono`    | `cosmic`                     | `analog`                     | `rust`                       |
| ------------------------------- | ---------------------------- | --------- | ---------------------------- | ---------------------------- | ---------------------------- |
| `--pulse-color-app`             | `#0B0D0F`                    | `#050505` | `#070A18`                    | `#171512`                    | `#130D0A`                    |
| `--pulse-color-surface-panel`   | `#15191D`                    | `#111111` | `#11162A`                    | `#26221D`                    | `#251813`                    |
| `--pulse-color-surface-control` | `#242A30`                    | `#202020` | `#1D2642`                    | `#39332C`                    | `#38231B`                    |
| `--pulse-color-surface-inset`   | `#080A0C`                    | `#000000` | `#050817`                    | `#100F0D`                    | `#0D0907`                    |
| `--pulse-color-text-primary`    | `#F3F5F6`                    | `#FFFFFF` | `#F3F5FF`                    | `#FFF9ED`                    | `#FFF4E8`                    |
| `--pulse-color-text-secondary`  | `#BAC2C8`                    | `#C8C8C8` | `#BCC6E8`                    | `#D0C5B6`                    | `#D8BFAF`                    |
| `--pulse-color-border-default`  | `#6D7881`                    | `#777777` | `#64729D`                    | `#867C70`                    | `#8D6B58`                    |
| `--pulse-color-border-strong`   | `#AAB4BC`                    | `#B8B8B8` | `#98A9D8`                    | `#B8AB9B`                    | `#C49378`                    |
| `--pulse-color-accent`          | `#7ED9A3`                    | `#E6E6E6` | `#66C7FF`                    | `#F0B65B`                    | `#E58A55`                    |
| `--pulse-color-on-accent`       | `#07110B`                    | `#080808` | `#03101A`                    | `#1A1003`                    | `#190A03`                    |
| `--pulse-color-focus-inner`     | `#FFFFFF`                    | `#FFFFFF` | `#FFFFFF`                    | `#FFFFFF`                    | `#FFFFFF`                    |
| `--pulse-color-focus-outer`     | `#000000`                    | `#000000` | `#000000`                    | `#000000`                    | `#000000`                    |
| `--pulse-color-control-track`   | `#6F7B84`                    | `#6A6A6A` | `#6A799F`                    | `#867C70`                    | `#8D6B58`                    |
| `--pulse-color-control-fill`    | `#B0F2CA`                    | `#FFFFFF` | `#A8E9FF`                    | `#FFE0A3`                    | `#FFC8A5`                    |
| `--pulse-color-meter-low`       | `#62D28A`                    | `#D4D4D4` | `#61D8B0`                    | `#86C878`                    | `#8DCE75`                    |
| `--pulse-color-meter-mid`       | `#F2C14E`                    | `#FFFFFF` | `#F2C85E`                    | `#EDBC58`                    | `#F0B956`                    |
| `--pulse-color-meter-high`      | `#FF7667`                    | `#FFFFFF` | `#FF7183`                    | `#F47762`                    | `#FF755B`                    |
| `--pulse-color-status-danger`   | `#FF8178`                    | `#FFFFFF` | `#FF8292`                    | `#F48170`                    | `#FF826B`                    |
| `--pulse-color-status-warning`  | `#F2C14E`                    | `#E8E8E8` | `#F2C85E`                    | `#EDBC58`                    | `#F0B956`                    |
| `--pulse-color-status-success`  | `#62D28A`                    | `#D4D4D4` | `#61D8B0`                    | `#86C878`                    | `#8DCE75`                    |
| `--pulse-color-overlay`         | `#101317`                    | `#0B0B0B` | `#0C1124`                    | `#201D19`                    | `#1C120E`                    |
| `--pulse-color-text-muted`      | `#919BA3`                    | `#999999` | `#929EC2`                    | `#AAA095`                    | `#A98E7E`                    |
| `--pulse-color-selection`       | `#244D38`                    | `#393939` | `#173F61`                    | `#5B431D`                    | `#62331E`                    |
| `--pulse-color-control-thumb`   | `#E1E6E9`                    | `#F2F2F2` | `#DDE5FF`                    | `#E8DED2`                    | `#E6C9B9`                    |
| `--pulse-color-meter-track`     | `#20262B`                    | `#292929` | `#202945`                    | `#40392F`                    | `#40291F`                    |
| `--pulse-color-status-info`     | `#6BB8FF`                    | `#D6D6D6` | `#73B8FF`                    | `#81BDE8`                    | `#78BCE7`                    |
| `--pulse-color-disabled`        | `#7B858D`                    | `#858585` | `#7F8CAF`                    | `#92887C`                    | `#9B7A68`                    |
| `--pulse-color-scrollbar-track` | `#111519`                    | `#0C0C0C` | `#0D1327`                    | `#211E1A`                    | `#1D120E`                    |
| `--pulse-color-scrollbar-thumb` | `#6D7881`                    | `#777777` | `#64729D`                    | `#867C70`                    | `#8D6B58`                    |
| `--pulse-shadow-control`        | `0px 1px 3px 0px #00000080`  | `none`    | `0px 1px 4px 0px #00000099`  | `0px 1px 3px 0px #00000080`  | `0px 1px 3px 0px #00000099`  |
| `--pulse-shadow-panel`          | `0px 4px 12px 0px #00000099` | `none`    | `0px 4px 14px 0px #000000A6` | `0px 4px 12px 0px #0000008C` | `0px 4px 12px 0px #000000A6` |

The built-in palette must pass the contrast matrix in section 10 before it can
ship. The table is not a claim that unimplemented UI already passes.

## 5. High-contrast overlay

High contrast overrides the resolved built-in or user palette after import
validation. It does not mutate the saved user theme. It uses these exact values:

| Token                           | Overlay value |
| ------------------------------- | ------------- |
| `--pulse-color-app`             | `#000000`     |
| `--pulse-color-surface-panel`   | `#000000`     |
| `--pulse-color-surface-control` | `#111111`     |
| `--pulse-color-surface-inset`   | `#000000`     |
| `--pulse-color-overlay`         | `#000000`     |
| `--pulse-color-text-primary`    | `#FFFFFF`     |
| `--pulse-color-text-secondary`  | `#FFFFFF`     |
| `--pulse-color-text-muted`      | `#D6D6D6`     |
| `--pulse-color-selection`       | `#005A66`     |
| `--pulse-color-border-default`  | `#FFFFFF`     |
| `--pulse-color-border-strong`   | `#FFFFFF`     |
| `--pulse-color-accent`          | `#00E5FF`     |
| `--pulse-color-on-accent`       | `#000000`     |
| `--pulse-color-focus-inner`     | `#FFFF00`     |
| `--pulse-color-focus-outer`     | `#000000`     |
| `--pulse-color-control-track`   | `#6A6A6A`     |
| `--pulse-color-control-fill`    | `#00E5FF`     |
| `--pulse-color-control-thumb`   | `#FFFFFF`     |
| `--pulse-color-meter-track`     | `#262626`     |
| `--pulse-color-meter-low`       | `#00FF80`     |
| `--pulse-color-meter-mid`       | `#FFFF00`     |
| `--pulse-color-meter-high`      | `#FF5C5C`     |
| `--pulse-color-status-danger`   | `#FF6B6B`     |
| `--pulse-color-status-warning`  | `#FFFF00`     |
| `--pulse-color-status-success`  | `#00FF80`     |
| `--pulse-color-status-info`     | `#66CCFF`     |
| `--pulse-color-disabled`        | `#B8B8B8`     |
| `--pulse-color-scrollbar-track` | `#000000`     |
| `--pulse-color-scrollbar-thumb` | `#FFFFFF`     |
| `--pulse-shadow-control`        | `none`        |
| `--pulse-shadow-panel`          | `none`        |

The overlay also forces a solid `2px` boundary on operational controls and
selected regions. It keeps every foundation size unchanged. Module accents may
remain as secondary detail, but selected state, activity, and module identity
must also have a text, shape, boundary, or icon cue using overlay colors.

## 6. Component consumption rules

- The application host sets one `data-theme` value for a built-in theme or
  `user`, plus one independent `data-high-contrast` boolean state.
- Only the central theme service may write palette properties onto the host.
- Components use semantic tokens. They do not use literal theme palette colors
  except for the required `rack` fallback beside `var()`.
- Reusable Shadow-DOM controls inherit public tokens. Private component tokens
  may alias public tokens but may not create a hidden, theme-specific palette.
- Canvas renderers receive a resolved semantic palette from the UI theme
  service. They must invalidate cached colors on a theme-change event without
  replacing the canvas or restarting animation unnecessarily.
- Inline SVG uses `currentColor` or semantic tokens. It does not embed a
  theme-specific fill or stroke palette.
- Layout, font families, font sizes, line heights, spacing, border widths,
  radii, control sizes, and animation timings use foundation tokens only.
- Status and module colors always have a non-color cue. Meters use position,
  numerical values where exposed, and labeled peak or clip state.
- `prefers-reduced-motion: reduce` sets all nonessential transition and
  animation durations to `0ms`. Playheads and meters may continue only where
  needed to represent current audio or position.
- Hidden documents pause nonessential theme and visual animation.

Theme application is one UI patch. It must not dispatch a project command, touch
engine state, or enter undo history.

## 7. User theme JSON format

The only accepted import shape is:

```json
{
  "formatVersion": 1,
  "name": "Night Shift",
  "tokens": {
    "--pulse-color-app": "#090B10",
    "--pulse-color-surface-panel": "#151923"
  }
}
```

The abbreviated example is not itself valid because required tokens are omitted.
An export of a valid user theme always includes all required tokens.

### 7.1 Structural limits

- Input must be valid UTF-8 JSON with no byte-order mark and no trailing data.
- Maximum input size is 16,384 UTF-8 bytes before parsing.
- The root must be a plain JSON object with exactly `formatVersion`, `name`, and
  `tokens`. No field is optional. Unknown root fields reject the import.
- `formatVersion` must be the JSON integer `1`.
- `name` must contain 1 through 40 Unicode scalar values after trimming. It must
  not contain control characters, bidi controls, line separators, markup, or an
  isolated surrogate.
- `tokens` must be a plain JSON object with at most 40 entries, counting known
  and unknown names.
- A token name contains at most 64 ASCII characters. A token value contains at
  most 96 ASCII characters.
- Total characters across every string are limited to 8,192.
- Maximum nesting depth is three: root, `tokens`, and scalar token values.
- Arrays, `null`, booleans, and numbers are invalid token values.
- Duplicate object keys at any level reject the import. Validation must detect
  them before ordinary `JSON.parse` can collapse them.
- The keys `__proto__`, `prototype`, and `constructor`, compared exactly, are
  forbidden at every level.

Imported values are data, never source text. The validator must not assign an
unvalidated key or value to `style`, a stylesheet, `innerHTML`, or a CSS object.

### 7.2 Token handling and report

Validation proceeds in this order:

1. Enforce byte, encoding, JSON, duplicate-key, depth, and root-shape limits.
2. Partition token entries into required, optional, and unknown names.
3. Report every unknown name in sorted code-point order and ignore its value.
4. Reject if a required name is missing.
5. Validate every known value with section 8 and its token-specific range.
6. Resolve omitted optional values from `rack`.
7. Run every contrast and computed-style check in section 10.
8. Canonicalize the accepted theme and persist it before changing the host.

The result report contains the imported name, format version, sorted ignored
tokens, every error with its JSON path and reason, and whether the theme was
applied. Reports show all independently detectable errors, not only the first.
They never echo more than the first 96 characters of an invalid value.

Validation and application are atomic. Any structural error, missing required
token, invalid known value, failed contrast pair, or persistence failure leaves
the active theme, contrast mode, stored preference, focus, and DOM unchanged.
Unknown tokens alone do not reject a theme.

## 8. Value grammar

Validation uses the grammar below, not `CSS.supports()` and not browser CSS
error recovery. Leading or trailing whitespace is removed before validation.
Internal whitespace is accepted only where the selected grammar requires one
ASCII space. Accepted values are serialized in canonical form.

Before type parsing, reject any value that contains, case-insensitively:

- `url(`, `var(`, `env(`, `attr(`, `image(`, `image-set(`, `cross-fade(`, or
  `element(`;
- a semicolon, brace, backslash, comment opener, or comment closer;
- a quote, control character, newline, carriage return, or non-ASCII byte.

This rejection prevents external resources, variable indirection, property
injection, comments, escapes, and executable or parser-dependent CSS.

### 8.1 Color

All `--pulse-color-*` values use exactly `#RRGGBB`, where each component is two
hexadecimal digits. Alpha, named colors, system colors, functions, shorthand
hex, and `transparent` are invalid. Canonical form uses uppercase hex.

### 8.2 Length

Foundation lengths use either `0` or an unsigned base-10 integer followed by
`px`. Signs, fractions, exponent notation, calculations, percentages, and other
units are invalid. The global range is 0 through 999 pixels. The exact
foundation values in section 3.3 are the only accepted production values.

### 8.3 Unitless number

A unitless number is `0`, a positive integer, or a positive decimal with one or
two fractional digits. Signs, exponent notation, `NaN`, and infinity are
invalid. Line height is limited to 1 through 2. Opacity, when a component
derives it internally, is limited to 0 through 1 and is not a user token.

### 8.4 Time

Time is an unsigned base-10 integer followed by `ms`, limited to 0 through 500
milliseconds. Seconds, fractions, negative time, and calculations are invalid.
User themes cannot provide time tokens.

### 8.5 Shadow

A shadow value is `none` or one or two comma-separated layers. Each layer has
this exact form:

```text
[inset ]<x>px <y>px <blur>px <spread>px #RRGGBBAA
```

`x` and `y` are base-10 integers from -16 through 16. `blur` is an integer from
0 through 32. `spread` is an integer from -8 through 16. One ASCII space
separates fields, and one ASCII space follows a comma. The eight-digit color is
the only place alpha is allowed. A shadow cannot contain more than two layers.

## 9. Preference ownership and failure behavior

Appearance is one global local-storage preference. The UI layer owns the key
`pulsebox.ui.appearance.v1`. Its canonical JSON value is:

```json
{
  "version": 1,
  "theme": "rack",
  "highContrast": false,
  "userTheme": null
}
```

`theme` is one built-in ID or `user`. `userTheme` is `null` unless a validated
canonical user-theme object is installed. The entire stored value is limited to
16,384 UTF-8 bytes. No other layer reads or writes this key.

On startup, missing or invalid preference data resolves to `rack`, high contrast
off, and no user theme. The UI reports corrupt stored data once per session and
replaces it only after the user makes a valid appearance choice. Projects never
supply a fallback theme.

The service writes one complete envelope for a preference change. It updates the
in-memory resolved palette and host only after `localStorage.setItem` succeeds.
If storage is unavailable or quota is exceeded, it keeps the current appearance
and shows a non-blocking error that says the preference was not changed and how
to retry. Cross-tab `storage` events apply a valid newer appearance envelope as
a UI-only update. Invalid cross-tab data is ignored and reported without
changing appearance.

Deleting the installed user theme while it is active first commits an envelope
with `rack` selected and `userTheme: null`, then applies `rack`. Theme import,
selection, contrast changes, and deletion never mark a project dirty.

## 10. Accessibility contract

These are numeric, WCAG 2.2-derived Pulsebox release checks. They do not by
themselves claim full WCAG conformance. Semantic structure, keyboard behavior,
names, reading order, zoom, errors, motion, and assistive-technology behavior
need separate evidence.

- Normal text and operational values have a contrast ratio of at least 4.5:1
  against every background on which they appear.
- Large text, if used at least 24 CSS pixels normal weight or about 18.66 CSS
  pixels bold, has a contrast ratio of at least 3:1.
- Visible boundaries, icons needed to identify a control, selected indicators,
  meter segments, and other essential non-text UI have at least 3:1 contrast
  against adjacent colors in every state.
- Text or icons on `--pulse-color-accent` have at least 4.5:1 contrast through
  `--pulse-color-on-accent`.
- Every keyboard focus indicator is a persistent two-band perimeter while
  focused. Each band is 2 CSS pixels. The qualifying band has at least 3:1
  contrast between focused and unfocused pixels and an area at least equal to a
  2 CSS pixel perimeter of the component. Inner and outer bands also contrast
  with one another by at least 3:1.
- Pointer targets contain a 24 by 24 CSS pixel square. If visible control art is
  smaller, a pseudo-element or wrapper expands the hit area without changing
  layout. Do not use the spacing exception as the normal control design.
- Focus is never fully obscured by sticky bars, menus, overlays, or internal
  scrolling. Scrolling a focused item brings the complete indicator into view.
- Status, meter, selection, module identity, and disabled state have a non-color
  cue. High contrast retains those cues.

Theme validation uses this exact semantic contrast matrix:

| Foreground tokens                        | Background tokens                   | Minimum |
| ---------------------------------------- | ----------------------------------- | ------- |
| Text primary, text secondary, text muted | App, panel, control, inset, overlay | 4.5:1   |
| On-accent                                | Accent                              | 4.5:1   |
| Border default                           | Panel, control                      | 3:1     |
| Border strong                            | Panel, control, selection           | 3:1     |
| Control track                            | Control surface                     | 3:1     |
| Control fill, control thumb              | Control track                       | 3:1     |
| Meter low, meter mid, meter high         | Meter track                         | 3:1     |
| Danger, warning, success, info           | Panel, inset                        | 3:1     |
| Scrollbar thumb                          | Scrollbar track                     | 3:1     |
| Focus inner                              | Focus outer                         | 3:1     |

For each app, panel, control, inset, overlay, and accent background, at least
one focus-ring color must also reach 3:1. The validator expands optional
fallbacks before calculating these pairs. It uses unrounded ratios for pass or
fail and rounds only displayed reports.

The numeric contrast checks use the sRGB relative-luminance and contrast-ratio
algorithm defined by WCAG 2.2. The relevant primary criteria are
[Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum),
[Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast),
[Focus Appearance](https://www.w3.org/TR/WCAG22/#focus-appearance), and
[Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum).

## 11. Deterministic verification

No theme passes by visual opinion alone. Use deterministic fixtures with fixed
project state, fonts, meters, playhead position, animation time, viewport,
device scale factor, and color profile.

### 11.1 Unit evidence

Unit tests must cover:

- every valid grammar boundary and one-below or one-above invalid boundary;
- malformed UTF-8, oversize input, duplicate keys, depth, entry count, string
  limits, forbidden keys, trailing data, and unknown root fields;
- every forbidden CSS construct with mixed case and whitespace variants;
- missing required, invalid required, invalid optional, omitted optional, and
  unknown token behavior;
- deterministic canonicalization and complete sorted reporting;
- contrast calculation against published reference color pairs;
- atomic rejection with an unchanged active and stored appearance;
- corrupt preference fallback and cross-tab preference validation;
- proof that project serialization and `.pulsebox` export contain no theme,
  contrast, or user-theme field.

### 11.2 Component and browser evidence

For each built-in theme, a valid user theme, and each with high contrast on:

- assert all public tokens resolve to the expected computed value;
- assert text, non-text, focus, accent-content, and meter contrast pairs;
- keyboard through every shared control and assert visible, unobscured focus;
- measure every operational pointer target as at least 24 by 24 CSS pixels;
- switch appearance during active playback and assert transport continuity, the
  same audio graph identity, the same focused element, and no project or
  undo-state change;
- compare bounding boxes before and after switching and require zero change in
  `x`, `y`, width, and height at CSS-pixel precision;
- assert no page-level scrolling, clipped menus, or overlap at 1536 by 1024,
  1440 by 900, 1366 by 768, and 1280 by 720 CSS pixels;
- assert the specified unsupported-size notice and limited actions below either
  minimum dimension;
- run in current stable Chrome, Edge, and Firefox for the production build.

Visual regressions cover all five themes and the high-contrast overlay at all
four supported viewports. Screenshots use deterministic meters and animation.
Pixel snapshots supplement, but do not replace, computed-value and behavior
assertions.

### 11.3 Acceptance evidence record

The release evidence for each browser records:

- browser name and exact version;
- operating system, viewport, device scale factor, and color profile;
- production-build identifier;
- theme ID, contrast state, and token-contract version;
- unit, component, browser, contrast, target-size, and visual result;
- screenshot or artifact paths and any manual procedure used;
- failures, skipped checks, and the reason for each skip.

Acceptance criteria 39 through 41 and 67 pass only when this evidence is
complete, all required checks pass, and the implementation matches this
contract. Phase 1 implements the five built-in token sets, high contrast, and
the current control primitives. Full-shell theme switching and final visual
evidence across later MVP components remain future work.
