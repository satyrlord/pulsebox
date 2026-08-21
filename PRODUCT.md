# Product

## Register

product

## Platform

web

## Single-owner use

Pulsebox is for one browser-first beatmaker who has never operated a hardware
groovebox. You make music in a browser tab, at a desktop, usually on headphones.
You may know software but not rack conventions. The dense short labels
(`ACID`, `SNAP`, `BOOM`) and panel logic have to teach themselves through sound
and response rather than through documentation.

The job is sound design and pattern work: build a groove, shape it, keep it.
Success on first use is not pressing Play on the supplied song. It is
**changing a sound and hearing the change** — the first deliberate edit, where
turning a control produces an audible result that you caused on purpose.

## Product Purpose

Pulsebox is a modular groove workstation that runs entirely client-side in the
browser. Eight rack slots, an eight-channel mixer, pattern editing, and song
arrangement, with no server, no account, and nothing to install.

It exists because serious instrument depth and zero-friction access have been
mutually exclusive. Real workstations demand installation, licensing, and setup;
browser music tools trade depth for reach. Pulsebox refuses the trade.

Success means that you open a tab and operate a real instrument — one that
keeps playing while you edit, save, load, reorder modules, and switch
appearance.

## Positioning

Hardware-grade depth, zero install: the density and immediacy of a physical
groove workstation, in a browser tab, with nothing to install and no account.

## Brand Personality

**Tactile and alive.** Controls respond, meters move, status lighting reads at a
glance. The interface should feel like touching equipment, not operating a
document.

Three words: tactile, dense, honest.

The voice is technical and plain. Labels are terse because operators read them a
thousand times, never because terseness looks professional. Errors state what
happened and how to recover. Nothing is decorative that could be operational.

The reference quality — drawn from an era of software instruments the user
named, recorded here as behavior rather than as a product — is **one machine,
entirely on screen**. No document metaphor, no window juggling; the whole
instrument is a single fixed surface learned spatially. It makes sound
immediately, with no project wizard and no routing to configure first. Its
density is playful rather than intimidating: packed with controls that reward
poking at things.

## Anti-references

- Generic dashboard styling: card grids, stat tiles, floating panels.
- Consumer-app softness: large pills, rounded friendliness, cartoon controls.
- Glassmorphism, floating translucent surfaces, excessive glow and gradients.
- Photorealistic textures, fake wood, decorative waveform graphics.
- A visual clone of any historical product. Spec-001 §2.3 governs; named
  historical sources live only in the non-shipping `research/` directory.
- Marketing-page conventions of any kind. Pulsebox is an instrument, not a pitch.

## Design Principles

1. **No dead controls.** Every visible operational control alters state, audio,
   navigation, or a documented preference. A control that does nothing is a lie
   about what the machine can do.
2. **Audible changes are visible changes.** Any parameter the ear can detect must
   show a meter, curve, envelope, playhead, waveform, or value. This is how an
   interface teaches a first-time operator who lacks hardware literacy.
3. **The machine never stops to do bookkeeping.** Playback continues through
   edits, saves, loads, module reorders, and theme changes. Interruption is a
   defect, not a cost.
4. **Density is earned, never decorative.** Compact panels expose what fast sound
   design needs; expanded editors go deeper without replacing the underlying
   state. Anything on screen that is not doing work is removed.

   Work is not only state change. Visual detail is doing work when it shows that
   a control is grabbable, marks where one part ends and the next begins, tells
   the user which machine they are touching, or confirms that an action landed.
   Raised caps, recessed bays, inset readouts, edges, and the response of a
   control under the pointer are structural, not ornamental. Remove the detail
   that carries none of these — not the detail that makes the panel readable and
   tactile.
5. **Recovery instead of confirmation.** Destructive edits apply immediately,
   retain full recovery data, and produce a non-blocking Undo notice. The product
   ships no confirmation dialogs.
6. **Accessibility is part of the component contract.** It is designed into each
   control, not retrofitted before release.

## Accessibility & Inclusion

WCAG 2.2 Level AA is measurable guidance for supported desktop viewports.
Pulsebox does not claim full conformance below its documented 1280 × 720 editing
boundary.

On record beyond the baseline:

- **Never color alone.** The six module accents and every selection, status, and
  disabled state pair color with a short label or another non-color cue that
  survives the high-contrast overlay.
- **Reduced motion is respected without losing feedback.** Meters, LEDs, and
  playheads carry information the product depends on. A reduced-motion path must
  preserve that signal rather than remove it.

A high-contrast mode applies over the built-in `rack` theme or any valid user
theme.
