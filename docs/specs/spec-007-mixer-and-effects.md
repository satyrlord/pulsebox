# Pulsebox Mixer and Effects Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-007`  
**Build order:** 7 of 10  
**Depends on:** [Pattern editing](spec-006-pattern-editing.md)  
**Owns:** Mixer, routing, module pedalboards, send chains, master chain, and
effects.  
**Acceptance IDs:** `AC-018` through `AC-020`, `AC-022` through `AC-028`,
`AC-062`, `AC-068`, `AC-074` through `AC-076`, and `AC-085` in
[release acceptance](spec-012-release-acceptance.md).

---

## 19. Mixer and routing

### 19.1 Logical channels

The MVP has eight rack-slot mixer channels and one master channel.

Each of the eight rack slots has one matching instrument channel. Loading,
removing, swapping, or reordering a module updates that slot channel without
creating mixer banks or channels beyond eight. Empty rack slots retain disabled
visible strips identified by their two-digit slot number. Their accessible name
and state report that the slot is empty.

An empty strip carries the same controls as a loaded strip in their disabled
state. This keeps one strip geometry across the row, so loading a module changes
the state of a channel rather than its shape. Each control reports the empty
slot in its accessible name, stays out of the tab sequence, and changes nothing.
An empty strip meter reads zero and is hidden from assistive technology, because
an empty slot has no signal to report.

The active audio-path identity follows the module ID. Slot identity controls
placement and the corresponding strip position.

### 19.2 Visible mixer

The established visible mixer contains:

- Exactly eight visible instrument channel strips, including disabled empty
  strips identified by two-digit slot number.
- One fixed compact strip geometry for every instrument channel.
- One master strip carrying master level, metering, and master-effects bypass,
  with no A–D grid.
- Four A–D send buttons per instrument channel in a visible 2 × 2 grid.
- Meter.
- Vertical fader.
- Pan.
- Mute.
- Solo.
- Clip indicator.
- Module short label.
- Selection state.
- A clear indicator when any send is active.
- One icon-only `Bypass All` toggle for all Send FX in the Mixer view header.

A fader or pan move is audible while the gesture is in progress. The engine
ramps the live channel value during the drag. One command commits the final
value and creates one history entry. A muted or solo-silenced channel stays
silent while its fader moves.

The compact state keeps meter, fader, pan, mute, solo, module identity, and all
four send buttons visible. Selecting a channel does not change strip width or
create an expanded strip. A mixer channel has no secondary expansion surface.
The instrument rack is the only place that opens a module pedalboard.

Each send button has a visible letter and an accessible name.
The buttons remain in A, B / C, D reading order. A button opens the standard
send-value surface for amount. The send tap is always pre-fader. Zero amount is
inactive. A non-zero amount has a non-color active cue. Empty channel send
buttons remain visible but disabled.

Selecting a rack module selects its mixer channel. Selecting a mixer channel
selects the matching module.

The master strip and all eight instrument strips remain visible whenever the
Mixer studio tab is active at a supported layout. Empty strips are disabled,
show their two-digit slot number, and expose the Empty state accessibly. There
are no hidden mixer banks in the MVP. Effects and Master replace the Mixer view
inside the same compact studio column.

Sends are an instrument-channel concept. Send chains return to the mix bus. The
mix bus is never a send source. Section 20.6 defines its processing as the
serial master chain, not four parallel send chains. The master strip therefore
carries no A–D grid, including a noninteractive label set. Return levels belong
to the compact A–D cards in the Effects view.

Master processing belongs to the Master view.

The master strip is not an instrument channel and does not copy instrument-strip
geometry. The fixed compact strip geometry above governs the eight instrument
channels only. The master strip has no pan control or send grid. Its fader uses
the available height and is taller than an instrument fader. It starts below
the master label. It ends at the same bottom edge as the instrument faders.

Thus, all strips share a baseline. The design does not add padding to make the
two fader lengths equal. The longer master fader gives the frequently adjusted
master level more precise travel.

### 19.3 Internal drum-voice mixer

Drum voices have an internal mixer inside the expanded instrument editor.

Voice output flow:

1. Voice synthesis.
2. Voice sample layer.
3. Voice distortion.
4. Voice pan and level.
5. Module sum.
6. Rack Volume or Level before the module pedalboard.
7. Module pedalboard.
8. Fixed channel gate.
9. Pre-fader A-D send taps.
10. Main channel fader and pan.
11. Master.

Voice-level send controls do not exist. The four send controls live only on the
parent rack-slot mixer channel.

### 19.4 Pedalboards and effect chains

Approved hierarchy:

- One eight-slot pedalboard per rack module.
- The instrument rack is the only entry point for a module pedalboard.
- Four send-bus chains.
- One master chain with at least six slots.

Each loaded rack faceplate exposes one icon-only `Bypass All` toggle in its
Output group. It bypasses that module's complete pedalboard. The Mixer view
header exposes one icon-only `Bypass All` toggle that bypasses all four send
chains. The controls preserve every per-effect and per-send-chain bypass state.
Turning a group override off restores those states.

Each group override is project-owned, undoable in one step, and playback-safe.
It uses the same click-safe chain switch as the individual chain bypass. It is
a command, not an automation parameter, and creates no automation lane. Each
icon-only button has an accessible label, a plain tooltip, `aria-pressed`, and
a non-color pressed-state boundary.

Each compact A–D card summarizes one modular send-bus chain. It shows the
primary effect, up to four macros, chain count, bypass state, activity, Edit control,
and circular Return Level control.

### 19.4.1 Automating a mixer, send, effect, or master parameter

A rack module does not own mixer, send, effect, or master parameters. Thus,
these parameters do not appear in the Piano Roll's module-scoped Parameter
selector. [Pattern editing](spec-006-pattern-editing.md) section 16.3.1 defines
that selector.

Each such parameter exposes an `Automate` action on its own control, reached
from the control's context menu and from the keyboard. The action arms the
parameter and opens its lane as the Piano Roll's active lane in the active
Pattern. Editing then follows the single-surface rule. The user draws and edits
the lane only in the Piano Roll.

Arming alone writes no project data and creates no undo entry. Arming
rejects a parameter that its surface does not support. The first committed
edit or recorded pass creates the lane record. This behavior matches a module
parameter.

While the user arms a non-module parameter, the Parameter selector shows it as the
active lane. The selector also shows its owning surface name. Thus, the user can
distinguish a mixer lane from a lane for the selected module. Selecting an entry
from the module-scoped groups replaces and disarms the non-module parameter.

### 19.5 Solo and mute

- Channel mute silences the module main path and all four sends.
- Voice mute silences one drum voice before the module sum.
- Module solo participates in global mixer solo.
- Voice solo is local to its drum module and does not place the parent mixer
  channel into global solo.
- Multiple module solos are additive. When any channel has Solo on, only
  channels with Solo on and their sends feed the mix.
- Shared send returns remain audible only for signal contributed by the
  surviving soloed channels.
- Tests verify deterministic Solo behavior.
- Muting and soloing do not rebuild the graph.

### 19.6 Mixer-strip modularity

The channel-strip structure is fixed. A channel has no swappable processing
surface. Module processing belongs to the rack pedalboard.

### 19.7 Output routing

Every rack module uses one fixed main output path and four fixed A-D send buses.
Rack Volume or Level controls the input before the pedalboard. The pedalboard
contains up to eight serial effect stages. Each stage processes its input, uses
an equal-power Mix to combine the stage input with its effect result, applies
its post-mix Gain, and sends that result to the next stage. There is no
chain-wide Mix or continuously summed chain-wide dry copy. A click-free chain
bypass can switch to dry at unity.

The module `Bypass All` override switches around the complete pedalboard at
unity. It does not change the bypass state of any pedal.

After the pedalboard, the channel gate feeds the fixed pre-fader A-D send taps.
The dry channel then continues through its fader and pan to the master chain.
Each send passes through its fixed send chain. Its return joins the main mix
independently of the dry channel. The project model may reserve future routing
destinations, but the MVP does not provide fixed subgroups or an arbitrary
routing graph.

---

## 20. Effects

Use one effect plugin system for module pedalboards, send chains, and the master
chain.

### 20.1 Effect locations

1. Per-module pedalboard: at least eight slots.
2. Four send buses: each contains a chain.
3. Master chain: at least six slots.
4. Protected limiter: final master slot by default. Its only placement is
   `master-chain`.

### 20.2 Effect catalog

Build:

- Lo-fi.
- Pattern controlled filter.
- Distortion.
- Compressor.
- Delay.
- Reverb.
- Chorus.
- Phaser.
- Parametric EQ.
- Transient shaper.
- Stereo width.
- Limiter.

The built-in catalog contains all listed effects. Module, send, and master
chains can use each effect that its manifest permits. Each drum voice also has a
simple Distortion rotary control. This control is not an effect plugin slot.

Effect variants or modes provide the compact default identities:

- Delay in Analog echo mode.
- Reverb in Plate mode.
- Distortion in Drive mode.
- Stereo width as its own effect.

The reverb detailed editor has the shimmer capability.

### 20.3 Compact A–D Effects view

The Effects studio tab contains four compact A–D cards. Each card summarizes one
send-bus effect chain. The Effects view replaces the Mixer view inside the same
compact studio column. The application never shows it beside or below the mixer.

Default primary effects follow
[rack and instruments](spec-005-rack-and-instruments.md) section 9.1.

Each compact slot contains:

- Bus letter.
- Primary effect name.
- Up to four macros from the pinned focus effect's declared compact controls.
- Circular Return Level control.
- Chain bypass.
- Edit button placed in the established unused space.
- Activity or status.
- Accent.
- Selection state.
- Chain-count indicator.

Each card shows the complete visible caption for every compact parameter. It
does not shorten a caption with an ellipsis. The controls and actions use the
available card width before the card adds height. The Effects view owns a
vertical scroll port with a visible scrollbar. The user can reach all four
cards at each supported viewport without page scrolling or horizontal studio
scrolling.

The Add effect row appends a plugin to the selected send chain. The detailed
editor manages ordering, replacement, per-effect bypass, per-effect Mix, and
per-effect Gain.

The user pins one effect in the chain as the compact card focus. By default, the
application pins the first effect. The macros use the pinned plugin's
declared compact controls. After the user removes the focused effect, focus
moves to the next effect. If no next effect exists, focus moves to the previous
effect. An empty chain uses the empty-card state.

The circular control has the visible label `Return Level`. It sets the
send-chain return level from silence to unity. The source remains dry on its
main path. Return Level is not an effect Mix control.

Edit opens the established 760 × 680 detailed editor without stopping playback.
Closing the editor restores focus to its opener.

### 20.4 Pedalboard

- Pedals flow left to right.
- Reorder by pointer drag and keyboard commands.
- Bypass per pedal.
- One equal-power Mix per effect.
- One post-mix Gain per effect.
- Compact view with two or three important controls.
- Expanded editor.
- No click or dropout while reordering.
- Stable effect IDs.
- Automation follows the effect instance when moved.
- The Output-group `Bypass All` toggle bypasses the complete pedalboard and
  preserves every pedal bypass state.

### 20.5 Send buses

- Four buses A through D.
- Independent amount per channel.
- Fixed pre-fader tap per channel and bus.
- Each instrument strip exposes A–D as a 2 × 2 button grid in A, B / C, D
  reading order.
- Activating a send button opens its amount surface. The compact button shows
  disabled, zero, and non-zero states without color-only meaning.
- Effect chains receive sends and return to master.
- The master strip exposes no send or return control. Each chain's return level
  is the circular `Return Level` control on its compact A-D card in the Effects
  view.
- Routing prevents feedback loops.
- Send return level is automatable.
- The Mixer `Bypass All` toggle bypasses all four send chains and preserves
  each chain's own bypass state.

### 20.6 Master chain

- Serial.
- At least six slots.
- Compressor and EQ available by default.
- Limiter in the last slot.
- Limiter is protected from removal or movement and is master-chain-only.
- The user may bypass the limiter.
- One master-effects bypass toggles all user master effects while leaving master
  gain and the protected limiter active.
- Master-effects bypass is project-owned, undoable, playback-safe, and visually
  distinct from the limiter's own detailed bypass.
- Peak reset.
- Metering before and after the chain.

### 20.7 DSP requirements

Every effect stage has this fixed order:

`input -> effect DSP wet result -> equal-power Mix -> post-mix Gain -> next stage`

Mix is a required automatable 0 through 1 parameter. It uses the equal-power
dry coefficient `cos(mix * pi / 2)` and wet coefficient `sin(mix * pi / 2)`.
Gain is a required automatable post-mix parameter from -24 dB through +24 dB.
It defaults to 0 dB and uses a 0.1 dB step. The engine smooths both audible
changes. Bypass is click-free and passes the stage input at unity. It is
independent of Mix and Gain.

The shared automation IDs are `mix` and `gain`. An effect plugin cannot use
these IDs for plugin-owned parameters.

Lo-fi:

- Bit-depth reduction.
- Sample-rate reduction.
- Anti-alias filtering.
- Adjustable character.
- Shared DSP core with the built-in digital-instrument lo-fi stage.

Pattern controlled filter:

- Tempo-locked editable cutoff pattern.
- Fully editable lane.
- No preset-only workflow.

Distortion:

- Multiple original models.
- Safe level compensation.

The first fixed Drive mode uses a `3.2` transfer drive and its reciprocal output
gain. It does not increase the absolute magnitude of an input sample.

Compressor:

- Threshold.
- Ratio.
- Attack.
- Release.
- Makeup.
- Visible gain reduction.

Limiter:

- Compact controls are Ceiling, Input, and Release.
- Ceiling is the output level nothing passes.
- Input sets the level driven into the limiter.
- Visible gain reduction.
- Deeper limiter controls live in its detailed editor.

Delay:

- Tempo sync.
- Free time.
- Feedback filtering.
- Ping-pong.
- Smooth time changes.
- Original implementation.

Reverb:

- Pre-delay.
- Decay.
- Damping.
- Mix.
- Plate mode.
- Shimmer in detailed editor.
- Stable impulse or algorithm allocation.

Chorus and phaser:

- Tempo-aware modulation where applicable.
- Stable stereo behavior.

Parametric EQ:

- Visible editable response curve.
- Stable bands and IDs.

Transient shaper:

- Attack and sustain shaping.
- Safe output compensation.

Stereo width:

- Mid-side or dual-channel processing.
- High-pass and low-pass controls.
- Safe mono behavior.

---
