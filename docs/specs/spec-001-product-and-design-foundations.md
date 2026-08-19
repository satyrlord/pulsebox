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

Build **Pulsebox**, a desktop-first modular groove
workstation for the browser.

Pulsebox requirements:

- Fully client-side.
- Runnable at the canonical local origin `http://127.0.0.1:4173`.
- A music-production application with working controls.
- Built around a dense rack, an eight-channel studio mixer, a four-bus effects
  area, pattern editing, piano-roll editing, and song arrangement.
- A new user can start the supplied loop within one minute.
- Playback continues while modules, effects, patterns, themes, and project data
  change.
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

| Full name      | Code ID             | Type                                 | Short label |
| -------------- | ------------------- | ------------------------------------ | ----------- |
| Silver Serpent | `bass-mono`         | Monophonic analog-style bass synth   | `ACID`      |
| Tin Soldier    | `drum-analog-small` | Small analog-style drum machine      | `SNAP`      |
| Soft Thunder   | `drum-analog-large` | Large analog-style drum machine      | `BOOM`      |
| Twin Engine    | `drum-hybrid`       | Analog and sample hybrid machine     | `MESH`      |
| Gray Ghost     | `drum-digital-a`    | Digital drum machine                 | `BITS`      |
| Dusty Mosaic   | `drum-digital-b`    | Digital drum machine with percussion | `PERC`      |

Rules:

- Short labels are always uppercase.
- Short labels are no longer than four characters.
- Use short labels as the primary identity on compact rack cards, rack-overview
  markers, mixer strips, and dense selectors.
- A loaded rack faceplate shows only the module icon as its identity. It shows
  no short label, full name, or slot number. The slot number stays in the
  accessible name and in the rack overview. An empty faceplate keeps its slot
  number and `Empty` label, because it has no icon.
- Rack-overview cards show only the short label.
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
directory. Production packages and public product documentation exclude that
directory. Research can explain broad synthesis families. Factory
voice lists, control ranges, curves, defaults, sound targets, panel
arrangements, and shipped content must remain original.

The interface may use generic rack cues. These cues include handles, screws,
inset bays, compact pedal enclosures, and dark powder-coated surfaces. Every
arrangement and drawing must be original.

All factory sounds, generated buffers, patterns, presets, graphics, and icons
must be newly created for Pulsebox.

---

## 3. Product principles

1. **Editing includes more than step toggles.** Every sequencer lets you place,
   directly manipulate, perform with the computer keyboard, generate, and
   transform events.
2. **The system is modular.** Instruments and effects use plugin contracts. Rack
   slots, module pedalboards, send chains, and the master chain are data-driven.
3. **Playback remains continuous.** Playback continues without a dropout or
   click while you edit, save, load compatible data, switch themes, open
   editors, and reorder modules.
4. **Undo recovers user edits.** User edits go through a command layer.
   Continuous gestures coalesce into one history entry. The store limits active
   history. It expires the oldest entries first and never rejects a valid new
   edit.
5. **Core controls remain visible.** Compact panels expose the controls needed
   for fast sound design. Expanded editors expose deeper parameters without
   replacing the underlying state.
6. **Audible changes have visual feedback.** Audible parameter changes show a
   meter, curve, envelope, playhead, waveform, or numerical value.
7. **No dead controls.** Every visible operational control must alter state,
   audio, navigation, or a documented preference.
8. **Mouse and computer keyboard are first-class.** No workflow depends on MIDI.
9. **Errors are actionable.** An error states what happened and how to recover.
10. **Accessibility is part of the component contract.** It is not a late
    retrofit.

Pulsebox uses no destructive confirmation dialogs. It applies destructive edits
immediately. It preserves complete recovery data while the bounded history entry
remains. It shows a non-blocking notification with an operable Undo action and
an ARIA live announcement. When the history budget is full, the store expires
the oldest retained entries before it commits the new action.

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

- `ACID`: acid yellow.
- `SNAP`: soldier green.
- `BOOM`: warm red.
- `MESH`: violet.
- `BITS`: ghost blue.
- `PERC`: turquoise.

Accents identify modules. They do not become full panel colors.

Each instrument also declares one original SVG icon in its manifest. The icon
is a maker's mark for the instrument: an acid smiley for `ACID`, a marching
snare for `SNAP`, a thundercloud for `BOOM`, meshed gears for `MESH`, a ghost
for `BITS`, and mosaic tiles for `PERC`. The module browser thumbnail renders
it beside the short label and full name. Icons are original drawings and follow
the section 2.3 originality rules.

Use each accent for:

- Name.
- Thin trim.
- Selected-step LEDs.
- Small control-ring detail.
- Mixer header.
- Overview marker.

Never rely on color alone. Pair every accent with the module short label or the
module icon, whose shape is a non-color cue. Give selection, status, and
disabled states a non-color cue that survives the high-contrast overlay.

`THEMING.md` section 3.4 owns the normative token values for these six accents.
A plugin declares its own accent in its manifest `moduleAccent`, which must match
that table.

### 11.3 Typography and icons

- Normal text uses the bundled UI typeface with a system sans-serif fallback.
- Time, tempo, ticks, values, and grid coordinates use the bundled monospace
  typeface with a system monospace fallback.
- Uppercase panel labels use the bundled condensed display typeface. Only the
  application mark uses the bundled brand typeface.
- Bundled typefaces are open-license fonts. Their license text ships with the
  font files. `THEMING.md` section 3.3 owns the exact families and stacks.
- Shipped CSS loads no font from a network host.
- Normal labels use sentence case.
- Short technical labels may use uppercase.
- Avoid text smaller than about 10 CSS pixels.
- Operational values are at least 12 CSS pixels.
- Draw original inline SVG icons with `currentColor`.
- No emoji UI icons.
- No icon font.
- Every icon-only control has an accessible label and tooltip.

### 11.4 Built-in theme

Ship exactly one original token-based built-in theme, per decision `D79`:

| Theme ID | Visible label | Direction                                    |
| -------- | ------------- | -------------------------------------------- |
| `rack`   | Rack          | Studio hardware, graphite and steel, default |

Also provide a high-contrast mode. The user can apply it over the built-in theme
or a valid user theme. Additional built-in themes are post-MVP token packs and
are not part of this contract.

Rules:

- Themes are CSS custom-property sets.
- No theme-specific TypeScript.
- No theme-specific markup.
- A theme change does not rebuild the audio graph or interrupt playback.
- Every module and effect must work in every theme.
- Focus rings and meters remain readable.
- A theme change causes no layout shift.
- Document the token contract in `THEMING.md`.
- Themes change appearance only. Sample packs and user samples change sound
  independently.

User themes import through the bounded, allowlisted JSON token schema in
`THEMING.md` only. The theme validator rejects raw CSS and values that can load
resources or inject declarations. It ignores unknown tokens and reports them.
If a required token is invalid, the validator rejects the complete theme. The
active theme does not change.

Store theme and high-contrast settings in local storage as global UI
preferences. Projects never change the user's appearance settings and do not
serialize a theme override. New installations start with the `rack` theme.
When the Settings page exists, show theme and high-contrast selection only on
that page. The application header never contains a theme selector.

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
- If the browser supports them, use constructable stylesheets with a small
  fallback.

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
- Additional built-in themes beyond `rack`.
- Editable layouts below 1280 × 720 CSS pixels, compact-desktop rescue layouts,
  and full touch-first mobile design.
- More than eight rack slots in the MVP. Sixteen slots remain an explicit
  post-MVP target.
- Marking projects. The Pin control is removed. A Favourite feature is a
  post-MVP target. It is a separate feature from Pin and it will define its own
  behavior, ordering, and interface.
- Native desktop wrappers.
- PWA installation and service workers.
- Marketplace or online sample store.
- Line and curve automation in the MVP.
