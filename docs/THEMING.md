# Pulsebox theming contract

**Status:** Normative contract with Phase 1 token and control implementation

**Contract version:** 1

**Owner:** UI layer

This document defines the complete theme boundary for the Pulsebox MVP. It
specializes section 11 of the
[product and design foundations specification](specs/spec-001-product-and-design-foundations.md).
It also specializes section 23.1 of the
[persistence and export specification](specs/spec-009-persistence-and-export.md)
and sections 24.1 and 24.3 of the
[quality and delivery specification](specs/spec-010-quality-and-delivery.md).
The contract also covers acceptance criteria 39 through 41 and 67 of
[release acceptance](specs/spec-012-release-acceptance.md). Reconcile all
affected owners in the same accepted product change before implementation.

## 1. Scope and invariants

Themes change appearance only. They never change project data, audio, control
behavior, navigation, text, accessible names, or the application hierarchy.

The following rules are mandatory:

- Ship exactly one built-in theme ID, `rack`, per decision `D79`. It is the
  default for a new installation. Additional built-in themes are post-MVP
  token packs and are outside this contract.
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

| ID     | Label | Required direction                                       |
| ------ | ----- | -------------------------------------------------------- |
| `rack` | Rack  | Graphite and steel studio hardware. This is the default. |

The built-in theme remains a dark studio interface. Theme direction does not permit
glassmorphism, translucent floating cards, photorealistic texture, copied
hardware art, excessive glow, large pill containers, or decorative controls.
Gradients are not theme tokens and are not used for ordinary surfaces.

## 3. Token architecture

The application theme host defines every token. Components consume inherited
tokens and may map them to private component properties. They must not
redeclare different product values.

There are three token classes:

1. Palette tokens vary by theme and form the user-theme allowlist.
2. Foundation tokens are fixed across themes and are not user-authorable.
3. Module accent tokens are scoped by instrument identity and are not
   user-authorable.

No component may read the active theme ID to select styles. Components use
semantic tokens only. A missing token is an implementation error. Production CSS
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
validated `rack` value is used. Any supplied optional value must still validate.
An invalid known token is never silently replaced.

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
| Fonts              | `--pulse-font-ui: "Barlow", system-ui, sans-serif`; `--pulse-font-mono: "Share Tech Mono", ui-monospace, monospace`               |
| Type size          | `--pulse-type-10: 10px`; `--pulse-type-12: 12px`; `--pulse-type-14: 14px`; `--pulse-type-16: 16px`; `--pulse-type-20: 20px`       |
| Line height        | `--pulse-line-tight: 1.2`; `--pulse-line-normal: 1.4`; `--pulse-line-roomy: 1.6`                                                  |
| Weight             | `--pulse-weight-normal: 400`; `--pulse-weight-medium: 500`; `--pulse-weight-strong: 650`                                          |
| Spacing 0-4        | `--pulse-space-0: 0`; `--pulse-space-1: 4px`; `--pulse-space-2: 8px`; `--pulse-space-3: 12px`; `--pulse-space-4: 16px`            |
| Spacing 5-10       | `--pulse-space-5: 20px`; `--pulse-space-6: 24px`; `--pulse-space-8: 32px`; `--pulse-space-10: 40px`                               |
| Radius             | `--pulse-radius-control: 4px`; `--pulse-radius-panel: 6px`; `--pulse-radius-dialog: 8px`; `--pulse-radius-round: 999px`           |
| Border             | `--pulse-border-thin: 1px`; `--pulse-border-strong: 2px`                                                                          |
| Target and control | `--pulse-target-min: 24px`; `--pulse-control-compact: 24px`; `--pulse-control-standard: 32px`; `--pulse-scrollbar-size: 10px`     |
| Layer              | `--pulse-layer-modal: 70`                                                                                                         |
| Focus              | `--pulse-focus-width: 2px`; `--pulse-focus-gap: 1px`                                                                              |
| Motion             | `--pulse-duration-fast: 80ms`; `--pulse-duration-standard: 140ms`; `--pulse-duration-slow: 220ms`; `--pulse-motion-distance: 4px` |

`--pulse-radius-round` is allowed only for circular controls and compact switch
tracks. It does not authorize pill-shaped panels or buttons. Text below 10 CSS
pixels is prohibited. Operational values use `--pulse-type-12` or larger.

The UI layer also defines two fixed display tokens in `src/styles/global.css`:

```css
--type-display: "Barlow Semi Condensed", "Barlow", system-ui, sans-serif;
--type-brand: "Michroma", "Barlow Semi Condensed", system-ui, sans-serif;
```

Uppercase panel labels and engraved captions use `--type-display`. Only the
transport-bar application mark uses `--type-brand`. Both tokens are foundation
values and are not user-authorable.

The product bundles exactly four typefaces: Barlow, Barlow Semi Condensed,
Michroma, and Share Tech Mono. Rules for bundled typefaces:

- Each face is licensed under the SIL Open Font License. Its license text
  ships in `src/styles/fonts/` beside the font files.
- The build bundles every font file as a `woff2` asset. Shipped CSS must not
  load a font from a network host.
- Every font stack ends in a generic system fallback, so missing glyphs and a
  failed asset resolve to a system face.
- A change to this typeface set is a product-contract change. It requires an
  update to this document and the typography tests. It also requires a new
  naming and originality audit.

### 3.4 Module-scoped accent tokens

The rack module host sets four fixed accent values for each instrument or effect.
The manifest field names stay the same, but instrument and effect scopes stay
separate. Descendant controls inherit the values from the active scope.

Instrument scope identifies the machine but never fills a full instrument
faceplate.

| Module | `--module-accent` | `--module-accent-muted` | `--module-led` | `--module-control-ring` |
| ------ | ----------------- | ----------------------- | -------------- | ----------------------- |
| `ACID` | `#F2D530`         | `#6E6118`               | `#FFE95E`      | `#C7A81F`               |
| `SNAP` | `#6FDE76`         | `#33663A`               | `#98F19E`      | `#4FB558`               |
| `BOOM` | `#FF6B5F`         | `#763B37`               | `#FF9188`      | `#D84E45`               |
| `MESH` | `#B890FF`         | `#594776`               | `#CEB2FF`      | `#9670D8`               |
| `BITS` | `#A9C7E8`         | `#4E5D70`               | `#CFE3F6`      | `#86A6C8`               |
| `PERC` | `#4ADFC7`         | `#2B6D63`               | `#7FF2DF`      | `#32B8A3`               |

This table owns the exact tuple for each built-in effect. Each effect manifest
must declare the values in its row:

| Plugin ID | Effect | `accent` | `accentMuted` | `led` | `controlRing` |
| --------- | ------ | -------- | ------------- | ----- | ------------- |
| `lo-fi` | Lo-fi | `#B58B43` | `#594522` | `#E4B766` | `#927035` |
| `pattern-filter` | Pattern Filter | `#50A384` | `#285243` | `#7ED6B4` | `#3F846B` |
| `distortion` | Distortion | `#DC7A4B` | `#6D3D26` | `#FFAA79` | `#B85E35` |
| `compressor` | Compressor | `#4E8DB8` | `#27475C` | `#78B9E3` | `#3D7194` |
| `delay` | Analog Echo | `#B66B46` | `#5B3624` | `#E99970` | `#914F31` |
| `reverb` | Plate Reverb | `#7A6AB5` | `#3E365B` | `#A99AE0` | `#615393` |
| `chorus` | Chorus | `#4D9FA9` | `#285156` | `#7DD2DA` | `#3D7F87` |
| `phaser` | Phaser | `#8C72B7` | `#463A5C` | `#BBA0E5` | `#705992` |
| `parametric-eq` | Parametric EQ | `#65A052` | `#33512A` | `#91D47B` | `#507F41` |
| `transient-shaper` | Transient Shaper | `#BE704F` | `#603928` | `#EBA07E` | `#985A3F` |
| `stereo-width` | Stereo Width | `#4E99B3` | `#284D5A` | `#7BC9E1` | `#3E7B90` |
| `limiter` | Limiter | `#C85151` | `#652929` | `#F17E7E` | `#9E4040` |

The muted effect value may provide a low-strength tint on an effect faceplate.
No instrument accent may fill a full instrument faceplate. Shared UI consumes
either scope generically and does not branch on plugin ID or short label.
Module identity also uses text, position, shape, or iconography. Components must
fall back to the general accent tokens when no module scope exists.

## 4. Built-in palette values

Every listed value is normative. Colors use opaque six-digit sRGB hex. Section
8 defines the shadow grammar.

| Token                           | `rack`                       |
| ------------------------------- | ---------------------------- |
| `--pulse-color-app`             | `#0B0D0F`                    |
| `--pulse-color-surface-panel`   | `#15191D`                    |
| `--pulse-color-surface-control` | `#242A30`                    |
| `--pulse-color-surface-inset`   | `#080A0C`                    |
| `--pulse-color-text-primary`    | `#F3F5F6`                    |
| `--pulse-color-text-secondary`  | `#BAC2C8`                    |
| `--pulse-color-border-default`  | `#6D7881`                    |
| `--pulse-color-border-strong`   | `#AAB4BC`                    |
| `--pulse-color-accent`          | `#7ED9A3`                    |
| `--pulse-color-on-accent`       | `#07110B`                    |
| `--pulse-color-focus-inner`     | `#FFFFFF`                    |
| `--pulse-color-focus-outer`     | `#000000`                    |
| `--pulse-color-control-track`   | `#6F7B84`                    |
| `--pulse-color-control-fill`    | `#B0F2CA`                    |
| `--pulse-color-meter-low`       | `#62D28A`                    |
| `--pulse-color-meter-mid`       | `#F2C14E`                    |
| `--pulse-color-meter-high`      | `#FF7667`                    |
| `--pulse-color-status-danger`   | `#FF8178`                    |
| `--pulse-color-status-warning`  | `#F2C14E`                    |
| `--pulse-color-status-success`  | `#62D28A`                    |
| `--pulse-color-overlay`         | `#101317`                    |
| `--pulse-color-text-muted`      | `#919BA3`                    |
| `--pulse-color-selection`       | `#244D38`                    |
| `--pulse-color-control-thumb`   | `#E1E6E9`                    |
| `--pulse-color-meter-track`     | `#20262B`                    |
| `--pulse-color-status-info`     | `#6BB8FF`                    |
| `--pulse-color-disabled`        | `#7B858D`                    |
| `--pulse-color-scrollbar-track` | `#111519`                    |
| `--pulse-color-scrollbar-thumb` | `#6D7881`                    |
| `--pulse-shadow-control`        | `0px 1px 3px 0px #00000080`  |
| `--pulse-shadow-panel`          | `0px 4px 12px 0px #00000099` |

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
remain as secondary detail. Selected state, activity, and module identity must
also have a text, shape, boundary, or icon cue that uses overlay colors.

## 6. Component consumption rules

- The application host sets one `data-theme` value for a built-in theme or
  `user`, plus one independent `data-high-contrast` boolean state.
- Only the central theme service may write palette properties onto the host.
- Built-in themes and the high-contrast overlay are stylesheet rules selected by
  that host state. The service sets the state and writes no inline palette
  property for them. An inline property outranks an attribute selector, so
  painting a built-in palette inline would freeze the palette and make every
  later theme change a no-op.
- An imported user theme has no stylesheet rule, so the service writes its
  canonical tokens inline. High contrast is resolved into that inline write,
  because the overlay rule cannot outrank an inline property.
- Components use semantic tokens. They do not use literal theme palette colors
  except for the required `rack` fallback beside `var()`.
- Reusable controls inherit public tokens. Private component tokens may alias
  public tokens but may not create a hidden, theme-specific palette.
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

### 6.1 Stylesheet delivery

Production styles are Vite-bundled global stylesheets and CSS Modules. The
theme host is `document.documentElement`, and no component uses Shadow DOM.
Constructable stylesheets would duplicate this pipeline without a benefit, so
the product does not use them. This is a recorded deviation from section 11.5
of the product and design foundations specification, which permits them where
supported. Revisit this decision only if a component adopts Shadow DOM.

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

The result report contains the imported name, format version, and sorted ignored
tokens. It also contains each error with its JSON path and reason. The report
states whether the theme was applied. Reports show all independently detectable errors, not only the first.
They never echo more than the first 96 characters of an invalid value.

Validation and application are atomic. The active theme, contrast mode, stored
preference, focus, and DOM remain unchanged after any validation error. This
rule also applies after a failed contrast pair or persistence failure.
Unknown tokens alone do not reject a theme.

## 8. Value grammar

Validation uses the grammar below, not `CSS.supports()` and not browser CSS
error recovery. Before validation, the validator removes leading or trailing
whitespace.
Internal whitespace is accepted only where the selected grammar requires one
ASCII space. The validator serializes accepted values in canonical form.

Before type parsing, reject any value that contains, case-insensitively:

- `url(`, `var(`, `env(`, `attr(`, `image(`, `image-set(`, `cross-fade(`, or
  `element(`.
- a semicolon, brace, backslash, comment opener, or comment closer.
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

The Settings page exposes theme selection, high-contrast selection, user-theme
import, and user-theme deletion.
The application header has no appearance selector. This placement rule does not
change the preference envelope or theme-service ownership.

On startup, missing or invalid preference data resolves to `rack`, high contrast
off, and no user theme. The UI reports corrupt stored data once per session and
replaces it only after the user makes a valid appearance choice. Projects never
supply a fallback theme.

The service writes one complete envelope for a preference change. It updates the
in-memory resolved palette and host only after `localStorage.setItem` succeeds.
If storage is unavailable or quota is exceeded, the service keeps the current
appearance. It shows a non-blocking error that says the preference was not
changed and tells the user how to retry. Cross-tab `storage` events apply a valid
newer appearance envelope as a UI-only update. The service ignores and reports
invalid cross-tab data without changing appearance.

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
- Large text has a contrast ratio of at least 3:1. Large text is at least 24 CSS
  pixels at normal weight or about 18.66 CSS pixels in bold.
- Visible boundaries, selected indicators, and meter segments have at least 3:1
  contrast against adjacent colors in every state.
- Icons that identify a control and other essential non-text UI have the same
  minimum contrast.
- Text or icons on `--pulse-color-accent` have at least 4.5:1 contrast through
  `--pulse-color-on-accent`.
- Every keyboard focus indicator is a persistent two-band perimeter while
  focused. Each band is 2 CSS pixels. The qualifying band has at least 3:1
  contrast between focused and unfocused pixels. Its area is at least equal to
  a 2 CSS pixel perimeter of the component. Inner and outer bands also contrast
  with one another by at least 3:1.
- Pointer targets contain a 24 by 24 CSS pixel square. If visible control art is
  smaller, a pseudo-element or wrapper expands the hit area without changing
  layout. Do not use the spacing exception as the normal control design. The
  Piano Roll is the one exception (decision `D98`): its keybed keys and event
  targets are at least 24 by 16 CSS pixels. Its grid rows are 16 CSS pixels
  tall, so more note rows stay visible.
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

- every valid grammar boundary and one-below or one-above invalid boundary.
- malformed UTF-8, oversize input, duplicate keys, depth, entry count, string
  limits, forbidden keys, trailing data, and unknown root fields.
- every forbidden CSS construct with mixed case and whitespace variants.
- missing required, invalid required, invalid optional, omitted optional, and
  unknown token behavior.
- deterministic canonicalization and complete sorted reporting.
- contrast calculation against published reference color pairs.
- the rack-theme family-chip contrast for every built-in effect manifest. The
  fixture applies the documented 90 percent effect-accent and 10 percent
  primary-ink mix and records the minimum ratio.
- atomic rejection with an unchanged active and stored appearance.
- corrupt preference fallback and cross-tab preference validation.
- proof that project serialization and `.pulsebox` export contain no theme,
  contrast, or user-theme field.

### 11.2 Component and browser evidence

For each built-in theme, a valid user theme, and each with high contrast on:

- assert all public tokens resolve to the expected computed value.
- assert text, non-text, focus, accent-content, and meter contrast pairs.
- assert the deterministic family-chip contrast result for every built-in effect
  tuple.
- keyboard through every shared control and assert visible, unobscured focus.
- measure every operational pointer target as at least 24 by 24 CSS pixels.
  The Piano Roll keybed keys and event targets measure at least 24 by 16 CSS
  pixels, per decision `D98`.
- switch appearance during active playback and assert transport continuity, the
  same audio graph identity, the same focused element, and no project or
  undo-state change.
- compare bounding boxes before and after switching and require zero change in
  `x`, `y`, width, and height at CSS-pixel precision.
- assert no page-level scrolling, clipped menus, or overlap at 1536 by 1024,
  1440 by 900, 1366 by 768, and 1280 by 720 CSS pixels.
- assert the specified unsupported-size notice and limited actions below either
  minimum dimension.
- run in current stable Chrome for the production build.

Visual regressions cover the `rack` theme, a valid user theme, and the
high-contrast overlay at all four supported viewports. Screenshots use deterministic meters and animation.
Pixel snapshots supplement, but do not replace, computed-value and behavior
assertions.

### 11.3 Acceptance evidence record

The release evidence for each browser records:

- browser name and exact version.
- operating system, viewport, device scale factor, and color profile.
- production-build identifier.
- theme ID, contrast state, and token-contract version.
- unit, component, browser, contrast, target-size, and visual result.
- screenshot or artifact paths and any manual procedure used.
- failures, skipped checks, and the reason for each skip.

Acceptance criteria 39 through 41 and 67 pass only when this evidence is
complete, all required checks pass, and the implementation matches this
contract.

The current implementation provides the `rack` built-in token set and the
high-contrast overlay. It provides the appearance preference envelope with its
cross-tab and storage-failure behavior. It also provides the bounded user-theme
import validator, numeric contrast checks, and current control primitives. A
Settings control selects high contrast. Settings also exposes user-theme import
and deletion. Visual regression snapshots across later MVP components remain
future work.
