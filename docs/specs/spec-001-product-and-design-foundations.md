# Pulsebox Product and Design Foundations Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-001`  
**Build order:** 1 of 10  
**Depends on:** [Specification index](spec-000-index.md)  
**Owns:** Product goal, naming, originality, product principles, visual
language, themes, and the MVP scope boundary.  
**Acceptance IDs:** `AC-006`, `AC-039` through `AC-041`, `AC-058`, and
`AC-067` in [release acceptance](spec-012-release-acceptance.md).

---

## 1. Product goal

Build **Pulsebox**, a production-quality, desktop-first modular groove
workstation for the browser.

Pulsebox is:

- Fully client-side.
- Runnable at the canonical local origin `http://127.0.0.1:4173`.
- A serious music-production application, not a static mockup.
- Built around a dense rack, an eight-channel studio mixer, a four-bus effects
  area, pattern editing, piano-roll editing, and song arrangement.
- Designed for fast results. A new user should be able to start the supplied
  loop within one minute.
- Designed so playback continues while modules, effects, patterns, themes, and
  project data change.
- Original in artwork, naming, control layout, code, sample content, and sound
  design.
- Limited to eight instrument slots in the MVP, with plugin contracts that do
  not hard-code any one instrument type.

Pulsebox is not:

- A marketing page.
- A collection of generic dashboard cards.
- A visual clone of any historical product.
- A MIDI application.
- A server-backed application.
- A sample-pack wrapper with decorative controls.

---

## 2. Naming and intellectual-property boundary

### 2.1 Product naming

Render `PULSEBOX` in uppercase only in:

- The centered application mark in the transport bar.
- The browser title.

Write `Pulsebox` in sentence case everywhere else, including:

- Documentation.
- Help text.
- Accessibility descriptions.
- Tooltips.
- Onboarding.
- Error messages.
- Project metadata.

Project files use the `.pulsebox` extension.

### 2.2 Instrument names

| Full name    | Code ID             | Type                                 | Short label |
| ------------ | ------------------- | ------------------------------------ | ----------- |
| Acid Bass    | `bass-mono`         | Monophonic analog-style bass synth   | `BASS`      |
| Drumline Six | `drum-analog-small` | Small analog-style drum machine      | `SIX`       |
| Boom Eight   | `drum-analog-large` | Large analog-style drum machine      | `BOOM`      |
| Hybrid Nine  | `drum-hybrid`       | Analog and sample hybrid machine     | `NINE`      |
| Digit Seven  | `drum-digital-a`    | Digital drum machine                 | `SEV`       |
| Digit Five   | `drum-digital-b`    | Digital drum machine with percussion | `FIVE`      |

Rules:

- Short labels are always uppercase.
- Short labels are no longer than four characters.
- Use short labels on faceplates, compact rack cards, rack-overview markers,
  mixer strips, and dense selectors.
- Use full names in the module browser, help text, accessible names, detailed editors,
  and documentation.
- Do not invent additional visible names for the six instruments.
- Internal stable IDs are not visible product names.

### 2.3 Originality rules

Production code, shipped assets, tests, public documentation, package metadata,
file names, factory project data, and user-facing strings must not contain:

- Real-world manufacturer names.
- Historical product titles or model numbers.
- Copied panel layouts.
- Copied color schemes.
- Copied type treatments.
- Copied icons.
- Copied presets.
- Extracted ROM or hardware samples.
- Community theme artwork.
- Traced or recolored reference art.

Named historical sources may appear only in the non-shipping `/research`
directory. That directory is excluded from production packages and public
product documentation. Research may be used to understand broad synthesis
families, but factory voice lists, control ranges, curves, defaults, sound
targets, panel arrangements, and shipped content must remain original.

The interface may use generic rack cues such as handles, screws, inset bays,
compact pedal enclosures, and dark powder-coated surfaces, but every arrangement
and drawing must be original.

All factory sounds, generated buffers, patterns, presets, graphics, and icons
must be newly created for Pulsebox.

---

## 3. Product principles

1. **Editing is not step-toggle-only.** Every sequencer supports painting,
   direct manipulation, computer-keyboard performance, and generation or
   transformation.
2. **The system is modular.** Instruments and effects use plugin contracts. Rack
   slots, insert chains, send chains, and the master chain are data-driven.
3. **Playback remains continuous.** Editing, saving, loading compatible data,
   switching themes, opening editors, and reordering modules must not produce a
   dropout or click.
4. **Undo is the safety system.** User edits go through a command layer.
   Continuous gestures coalesce into one history entry. Active history is
   bounded, expires oldest entries first, and never makes a valid new edit fail.
5. **Core controls remain visible.** Compact panels expose the controls needed
   for fast sound design. Expanded editors expose deeper parameters without
   replacing the underlying state.
6. **Visual feedback follows sound.** Audible parameter changes receive a useful
   visual response such as a meter, curve, envelope, playhead, waveform, or
   numerical value.
7. **No dead controls.** Every visible operational control must alter state,
   audio, navigation, or a documented preference.
8. **Mouse and computer keyboard are first-class.** No workflow depends on MIDI.
9. **Errors are actionable.** An error states what happened and how to recover.
10. **Accessibility is part of the component contract.** It is not a late
    retrofit.

Deep effect editors use the already established 760 × 680 editor format.
Playback continues underneath. The editor restores focus when closed.

Pulsebox uses no destructive confirmation dialogs. Destructive edits happen
immediately, preserve complete recovery data while their bounded history entry
is retained, and produce a non-blocking notification with an operable Undo
action and an ARIA live announcement. When the history budget is full, the
oldest retained entries expire before the new action commits.

---

## 11. Visual language and themes

### 11.1 Default visual direction

Create a dark, tactile, high-density studio interface using:

- Matte black and graphite enclosures.
- Slightly raised control surfaces.
- Recessed sequencer wells.
- Compact pedal-like effects.
- Restrained status lighting.
- Technical labels.
- Borders, highlights, and modest shadows for depth.
- Modern software precision.

Avoid:

- Excessive glow.
- Glassmorphism.
- Floating translucent cards.
- Consumer-app softness.
- Cartoon controls.
- Photorealistic textures.
- Fake wood.
- Large mobile-style pills.
- Decorative waveform graphics.
- Excessive gradients.
- Generic dashboard styling.

### 11.2 Instrument accents

- `BASS`: acid green.
- `SIX`: amber orange.
- `BOOM`: warm red.
- `NINE`: violet.
- `SEV`: electric blue.
- `FIVE`: turquoise.

Accents identify modules. They do not become full panel colors.

Use each accent for:

- Name.
- Thin trim.
- Selected-step LEDs.
- Small control-ring detail.
- Mixer header.
- Overview marker.

Never rely on color alone.

### 11.3 Typography and icons

- System UI sans-serif for normal text.
- System monospace for time, tempo, ticks, values, and grid coordinates.
- No loaded legacy-style font.
- Normal labels use sentence case.
- Short technical labels may use uppercase.
- Avoid text smaller than about 10 CSS pixels.
- Operational values are at least 12 CSS pixels.
- Draw original inline SVG icons with `currentColor`.
- No emoji UI icons.
- No icon font.
- Every icon-only control has an accessible label and tooltip.

### 11.4 Built-in themes

Ship five original token-based themes:

| Theme ID | Visible label | Direction                                             |
| -------- | ------------- | ----------------------------------------------------- |
| `rack`   | Rack          | Studio hardware, graphite and steel, default          |
| `mono`   | Mono          | Near-black, minimal, high contrast                    |
| `cosmic` | Cosmic        | Deep blue, restrained luminous detail                 |
| `analog` | Analog        | Warm silver and tactile metal                         |
| `rust`   | Rust          | Industrial, angular, weathered without copied artwork |

Also provide a high-contrast mode that can be layered over a theme.

Rules:

- Themes are CSS custom-property sets.
- No theme-specific TypeScript.
- No theme-specific markup.
- Switching themes does not rebuild the audio graph or interrupt playback.
- Every module and effect must work in every theme.
- Focus rings and meters remain readable.
- Theme switching causes no layout shift.
- Document the token contract in `THEMING.md`.
- Themes change appearance only. Sample packs and user samples change sound
  independently.

User themes import through the bounded, allowlisted JSON token schema in
`THEMING.md` only. Raw CSS and values capable of loading resources or injecting
additional declarations are rejected. Unknown tokens are ignored with a report.
Any invalid required token rejects the complete theme without changing the
active theme.

Theme and high-contrast settings are global UI preferences stored in local
storage. Projects never change the user's appearance settings and do not
serialize a theme override. New installations start with the `rack` theme.
Theme and high-contrast selection appears only on the Settings page when that
page is implemented. The application header never contains a theme selector.

### 11.5 CSS implementation

Use custom properties for:

- Surfaces.
- Text.
- Accents.
- Meter colors.
- Control tracks and fills.
- Borders.
- Shadows.
- Focus rings.
- Spacing.
- Radii.
- Type scale.
- Control sizes.
- Animation durations.

Use:

- A spacing scale based on about 4 pixels.
- Small-control radii of about 3 to 4 pixels.
- Panel radii of about 5 to 8 pixels.
- `box-sizing: border-box` throughout.
- Logical properties where practical.
- Subtle visible scrollbars.
- Container queries where they simplify adaptation, with media-query fallbacks.
- Constructable stylesheets where supported, with a small fallback.

Module-scoped variables include:

- `--module-accent`
- `--module-accent-muted`
- `--module-led`
- `--module-control-ring`

Do not hide scrollbars completely. Do not use large pill containers except for
deliberately compact switches.

---

## 27. Out of scope

The following are out of scope for version 1.0:

- Application server, API, or server-backed feature. The local static-file
  launcher is delivery tooling only.
- Accounts.
- Cloud sync.
- Collaboration.
- Plugin hosting.
- Microphone or line-input recording.
- MIDI of any kind.
- Eleven additional built-in themes.
- Editable layouts below 1280 × 720 CSS pixels, compact-desktop rescue layouts,
  and full touch-first mobile design.
- More than eight rack slots in the MVP. Sixteen slots remain an explicit
  post-MVP target.
- Native desktop wrappers.
- PWA installation and service workers.
- Marketplace or online sample store.
- Line and curve automation in the MVP.
