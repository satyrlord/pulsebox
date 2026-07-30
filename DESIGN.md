---
name: Pulsebox
description: A dark, tactile modular groove workstation for the browser — graphite enclosures, recessed wells, and six accent colors that name the machines.
colors:
  app: "#0b0d0f"
  surface-panel: "#15191d"
  surface-control: "#242a30"
  surface-inset: "#080a0c"
  overlay: "#101317"
  text-primary: "#f3f5f6"
  text-secondary: "#bac2c8"
  text-muted: "#919ba3"
  border-default: "#6d7881"
  border-strong: "#aab4bc"
  accent: "#7ed9a3"
  on-accent: "#07110b"
  selection: "#244d38"
  control-track: "#6f7b84"
  control-fill: "#b0f2ca"
  control-thumb: "#e1e6e9"
  meter-track: "#20262b"
  meter-low: "#62d28a"
  meter-mid: "#f2c14e"
  meter-high: "#ff7667"
  status-success: "#62d28a"
  status-warning: "#f2c14e"
  status-danger: "#ff8178"
  status-info: "#6bb8ff"
  disabled: "#7b858d"
  focus-inner: "#ffffff"
  focus-outer: "#000000"
  module-bass: "#9BE564"
  module-six: "#FFB44A"
  module-boom: "#FF6B5F"
  module-nine: "#B890FF"
  module-sev: "#5AAEFF"
  module-five: "#4ADFC7"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.2
  headline:
    fontFamily: "system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.06em"
  readout:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  control: "4px"
  panel: "6px"
  dialog: "8px"
  round: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
components:
  button:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "24px"
  button-pressed:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
  button-disabled:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.disabled}"
  readout:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-primary}"
    typography: "{typography.readout}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  control-bay:
    backgroundColor: "{colors.surface-inset}"
    rounded: "{rounded.panel}"
    padding: "4px"
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
  overlay-notice:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
    padding: "8px 12px"
---

# Design System: Pulsebox

## 1. Overview

**Creative North Star: "The Powder-Coated Machine"**

Pulsebox is drawn as fabricated equipment. Matte black metal, raised switch
caps, recessed control bays, inset value wells. Every surface treatment answers
a manufacturing question — is this part mounted into the chassis, or does it sit
proud of it? — and the answer produces the shadow, the border, and the
highlight. Nothing floats. Nothing is styled for atmosphere.

The system runs at high density on a dark chassis (`#0b0d0f`), with a four-step
tonal ramp from app to panel to control to inset. Saturation is scarce and
purposeful: the six instrument accents are the only strongly chromatic colors in
the product, and they exist to answer "which machine am I touching?" Meters and
status carry the remaining color, and they carry it as information. Type is
small by design — 12px body, 10px labels — because operators read these strings
thousands of times and the panel has to hold eight modules at once.

This system explicitly rejects generic dashboard styling, card grids and stat
tiles, consumer-app softness, large pills and cartoon controls, glassmorphism,
floating translucent surfaces, excessive glow and gradients, photorealistic
texture, fake wood, and decorative waveform graphics. It also rejects marketing
conventions entirely: Pulsebox is an instrument, not a pitch.

**Key Characteristics:**

- Dark chassis with a four-step tonal ramp (app → panel → control → inset)
- Six instrument accents as the only saturated color, each paired with a short label
- Physical control metaphors: raised caps, recessed bays, inset readouts
- Compact type scale (10 / 12 / 14 / 16 / 20 px) with a monospace readout voice
- 4px spacing grid; 4px control radii, 6px panel radii
- Fast, short motion (80 / 140 / 220 ms) with a full reduced-motion path

## 2. Colors

A near-monochrome graphite system where saturation is reserved for identity,
level, and status.

### Primary

- **Signal Green** (`#7ed9a3`): The system accent. Fills engaged toggle states
  (`aria-pressed="true"`) and the default control ring where no module accent
  applies. Paired with **Deep Bottle** (`#07110b`) as its on-accent text so
  engaged controls stay legible.
- **Control Fill** (`#b0f2ca`): The lighter accent used for filled portions of
  control tracks, so a track's filled length reads at a glance against
  **Track Steel** (`#6f7b84`).

### Secondary — the module accents

Six identity colors, one per instrument. These name a machine; they never fill a
faceplate. Each appears on the name, a thin trim, selected-step LEDs, a small
control-ring detail, the mixer header, and the overview marker. Each has a muted
variant for filled areas, a brighter LED variant for lit indicators, and a ring
variant for control outlines.

- **Acid Green** (`#9BE564`) — `BASS`, Acid Bass
- **Amber Orange** (`#FFB44A`) — `SIX`, Drumline Six
- **Warm Red** (`#FF6B5F`) — `BOOM`, Boom Eight
- **Violet** (`#B890FF`) — `NINE`, Hybrid Nine
- **Electric Blue** (`#5AAEFF`) — `SEV`, Digit Seven
- **Turquoise** (`#4ADFC7`) — `FIVE`, Digit Five

### Tertiary — level and status

- **Meter Low** (`#62d28a`), **Meter Mid** (`#f2c14e`), **Meter High**
  (`#ff7667`): the level ramp, over **Meter Track** (`#20262b`).
- **Danger** (`#ff8178`), **Warning** (`#f2c14e`), **Success** (`#62d28a`),
  **Info** (`#6bb8ff`): status only. Never decoration.

### Neutral

- **Chassis Black** (`#0b0d0f`): the application background. The floor of the ramp.
- **Panel Graphite** (`#15191d`): module faceplates, mixer strips, settings surfaces.
- **Control Steel** (`#242a30`): the face of any raised control — buttons, inputs, selects.
- **Well Black** (`#080a0c`): recessed bays and value readouts. Darker than the
  chassis, which is what makes a well read as cut into the panel.
- **Overlay Slate** (`#101317`): the Undo notice and the Settings panel — the two
  surfaces that genuinely sit above the workspace.
- **Text Primary** (`#f3f5f6`), **Text Secondary** (`#bac2c8`), **Text Muted**
  (`#919ba3`): the readable ramp. Muted is for labels at 10px, never for prose.
- **Border Default** (`#6d7881`), **Border Strong** (`#aab4bc`): every part has a
  visible edge. Strong marks hover, engagement, and overlay boundaries.

### Named Rules

**The Named Machine Rule.** A module accent never appears without its short
label. Color identifies which of six machines you are touching; the label is
what makes that identification survive color blindness and the high-contrast
overlay. An accent alone is an incomplete identity.

**The Scarce Saturation Rule.** Chroma is a budget. Only three things spend it:
module identity, meter level, and status. A surface, a border, a label, or a
divider is never colored for effect.

**The High-Contrast Survival Rule.** Every state — selected, active, disabled,
error — must remain distinguishable when the high-contrast overlay flattens all
surfaces to black and all borders to white. If a state reads only as a fill
color, it is broken. Add an outline, a weight change, a glyph, or a position cue.

## 3. Typography

**UI Font:** system-ui, sans-serif
**Readout Font:** ui-monospace, monospace

**Character:** Two voices, cleanly split by job. The system sans handles
everything the user reads as language; the monospace handles everything the user
reads as a value. No loaded webfont — the system stack is deliberate, not a
placeholder, and it keeps the first paint instant on a client-side app that must
make sound immediately.

### Hierarchy

- **Title** (650, 20px, 1.2): The application mark and page-level headings. The
  centered transport mark is the only place `PULSEBOX` appears in uppercase.
- **Headline** (650, 16px, 1.2): Section and panel headings.
- **Body** (400, 12px, 1.4): The default. All prose, control labels above 10px,
  and menu text.
- **Label** (500, 10px, 1.2, 0.06em, uppercase): Control captions under knobs and
  faders. The floor of the system — nothing renders below 10px.
- **Readout** (400, 12px, 1.2, 0.06em, monospace, tabular figures): Time, tempo,
  ticks, values, grid coordinates. Always in an inset well.

### Named Rules

**The Two Voices Rule.** Language is sans; values are mono. A number the user
compares, scrubs, or types is monospace with tabular figures, so digits do not
shift width as they change. A number inside a sentence is not.

**The Twelve Pixel Floor Rule.** Operational values render at 12px or larger.
10px is permitted only for static uppercase captions that name a control. Never
below 10px.

**The Sentence Case Rule.** Normal labels are sentence case. Uppercase is
reserved for short technical labels — module short labels, control captions, and
the application mark. Uppercase is a category marker, never emphasis.

## 4. Elevation

**Layered panel hierarchy.** Depth communicates nesting, not float. The system
reads as four mounted layers: chassis → panel → control → inset well. Each step
is a tonal move plus an edge, and the shadow's job is to say how a part is
mounted rather than how high it hovers.

Raised parts get a 1px inner top highlight (`inset 0 1px 0 0 #ffffff1a`) over a
modest drop shadow — the way light catches the top edge of a switch cap.
Recessed parts get an inner shadow (`inset 0 1px 3px 0 #00000073`) and a darker
fill than their surroundings. Pressing a raised part inverts it: the highlight
becomes an inset shadow, and the cap reads as depressed.

Only two surfaces in the product genuinely float — the Undo notice and the
Settings panel — and they are the only users of the panel drop shadow.

### Shadow Vocabulary

- **Control** (`0px 1px 3px 0px #00000080`): under a raised cap. Paired with the
  1px top highlight; neither is used alone.
- **Panel** (`0px 4px 12px 0px #00000099`): the two true overlays only. Not for
  module faceplates, mixer strips, or cards.
- **Recess** (`inset 0 1px 3px 0 #00000073`): control bays, value readouts, and
  the pressed state of any button.
- **Cap highlight** (`inset 0 1px 0 0 #ffffff1a`): the top edge of a raised part.

In high-contrast mode both drop shadows resolve to `none`. Depth is carried
entirely by the 2px operational outline, which is why every part needs a real
border rather than a shadow-only edge.

### Named Rules

**The Mounting Rule.** Before styling a surface, answer whether it is mounted
into the chassis or proud of it. Recessed takes a darker fill and an inner
shadow. Raised takes a lighter fill, a top highlight, and a control shadow.
A surface that is neither gets no shadow at all.

**The Two Overlays Rule.** The panel drop shadow belongs to the Undo notice and
the Settings panel. Anything else reaching for it is a card pretending to float,
which this system does not do.

## 5. Components

### Buttons

- **Shape:** Slightly softened corners (4px control radius), 24px minimum height,
  8px inline padding.
- **Default:** Control Steel face (`#242a30`) with a Border Default edge, a 1px
  inner top highlight, and the control drop shadow. Reads as a raised cap.
- **Hover:** Border shifts to Border Strong (`#aab4bc`). No fill change, no lift.
- **Pressed (`:active`):** Highlight and drop shadow are replaced by the recess
  inset shadow. The cap goes down.
- **Engaged (`aria-pressed="true"`):** Signal Green fill with Deep Bottle text, a
  Border Strong edge, and 650 weight. Three simultaneous cues — fill, border, and
  weight — so engagement survives high contrast.
- **Disabled:** Muted text (`#7b858d`), no shadow, default cursor. The face color
  does not change; the loss of depth is the signal.
- **Focus:** A 2px white inner ring with a 1px gap, wrapped in a black outer ring.
  The double ring is what keeps focus visible on both the near-black chassis and
  the light accent fills.

### Knobs

The signature control. A 44px SVG dial: a Track Steel arc, a fill arc in the
module's control-ring color, a dark cap with a lighter edge stroke, and a pointer
line in the module's LED color. Vertical drag (`cursor: ns-resize`), with a
monospace tooltip above the dial during the gesture. Dragging brightens the cap
stroke to the full module accent. The caption below is a 10px uppercase muted
label; a keyboard-reachable numeric field carries the exact value.

### Faders

A vertical SVG slot in Well Black with a filled region in the module's muted
accent, a raised cap with a control-ring stroke, and a cap line in the full
accent. The operable target is the surface plus 4px inline padding, meeting the
24px minimum. A monospace readout sits below in an inset well.

### LEDs

An 8px circle with a 1px edge. Unlit is near-black; lit takes the module LED
color as fill and the control-ring color as border. Two properties change, not
one — the border shift is what keeps lit state legible in high contrast.

### Control bays

Related switches group into a recessed bay: a Border Default edge, 6px panel
radius, 4px padding, Well Black fill, and the recess inset shadow. This is how
the transport and history clusters read as one mounted group rather than a row of
loose buttons.

### Value readouts

Inset wells: Well Black fill, thin border, recess shadow, monospace with 0.06em
tracking, right-aligned, with a fixed minimum width so digits do not reflow as
the value changes.

### Overlay notice

The Undo notice: fixed to the lower right, Overlay Slate fill, Border Strong
edge, panel drop shadow, 8px/12px padding. It never blocks input, and it always
carries an operable Undo action plus an ARIA live announcement. This product
ships no confirmation dialogs; the notice is the recovery path.

### Scrollbars

Thin (10px) and always visible. Scrollbar Thumb over Scrollbar Track, with a 2px
track-colored border insetting the thumb. Hiding a scrollbar is prohibited — in a
dense workspace, the presence of overflow is information.

## 6. Do's and Don'ts

### Do:

- **Do** pair every module accent with its uppercase short label (`BASS`, `SIX`,
  `BOOM`, `NINE`, `SEV`, `FIVE`). Color alone is never an identity.
- **Do** give every state a second, non-color cue — border weight, font weight,
  outline, glyph, or position — so it survives the high-contrast overlay.
- **Do** decide "recessed or raised" before styling any surface, then apply the
  matching shadow from the Mounting Rule.
- **Do** use monospace with tabular figures for every value the user reads,
  compares, or edits.
- **Do** keep operational values at 12px or larger; use 10px only for static
  uppercase captions.
- **Do** build on the 4px spacing grid and the 4px / 6px / 8px radius steps.
- **Do** keep transitions at 80–220ms and provide the reduced-motion path — meters,
  LEDs, and playheads must keep signaling when motion is reduced, not go dark.
- **Do** keep every scrollbar visible.

### Don't:

- **Don't** use generic dashboard styling: card grids, stat tiles, or floating
  panels. Pulsebox is a rack, not a dashboard.
- **Don't** apply consumer-app softness — large pills, rounded friendliness, or
  cartoon controls. Pills are permitted only for deliberately compact switches.
- **Don't** use glassmorphism, floating translucent surfaces, excessive glow, or
  excessive gradients.
- **Don't** add photorealistic textures, fake wood, or decorative waveform
  graphics. Repeating stripe textures are noise, not material.
- **Don't** use a colored side stripe (`border-left` or `border-right` above 1px)
  as an accent on any panel, row, or callout. Use a full border, a background
  tint, or the short label instead.
- **Don't** reach for the panel drop shadow outside the Undo notice and the
  Settings panel.
- **Don't** let a module accent fill a faceplate. Accents are name, thin trim,
  LED, ring detail, mixer header, and overview marker — nothing wider.
- **Don't** ship a visible control that does nothing. A dead control is a lie
  about what the machine can do.
- **Don't** introduce a loaded webfont, an icon font, or emoji icons. Icons are
  original inline SVG using `currentColor`.
- **Don't** add a confirmation dialog. Apply the edit, retain recovery data, and
  show the Undo notice.
- **Don't** import marketing-page conventions of any kind.
