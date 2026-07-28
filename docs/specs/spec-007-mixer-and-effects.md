# Pulsebox Mixer and Effects Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-007`  
**Build order:** 7 of 10  
**Depends on:** [Pattern editing](spec-006-pattern-editing.md)  
**Owns:** Mixer, routing, Monitor, inserts, send chains, master chain, and
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
visible strips labeled `Empty`.

The active audio-path identity follows the module ID. Slot identity controls
placement and the corresponding strip position.

### 19.2 Visible mixer

The established visible mixer contains:

- Exactly eight visible instrument channel strips, including disabled `Empty`
  strips.
- One fixed compact strip geometry for every instrument channel.
- One master strip.
- Four A–D send buttons per instrument channel in a visible 2 × 2 grid.
- Meter.
- Vertical fader.
- Pan.
- Mute.
- Solo.
- Monitor control for single-channel pre-fader audition.
- Clip indicator.
- Module short label.
- Selection state.
- Insert-chain access.
- A clear indicator when any send is active.

The compact state keeps meter, fader, pan, mute, solo, module identity, and all
four send buttons visible. Selecting a channel does not change strip width or
create an expanded strip. Monitor, meter detail, and insert-chain editing use a
transient focus-managed channel detail surface. Opening that surface does not
resize the mixer or expose a duplicate effects bank.

Each send button is identified by both its visible letter and accessible name.
The buttons remain in A, B / C, D reading order. A button opens the standard
send-value surface for amount and pre-fader or post-fader mode. Zero amount is
shown as inactive; a non-zero amount is shown with a non-color active cue. Empty
channel send buttons remain visible but disabled.

Selecting a rack module selects its mixer channel. Selecting a mixer channel
selects the matching module.

Monitor performs exclusive single-channel pre-fader audition through a
non-exported monitor bus. The tap occurs after the module insert chain and
before the channel fader and send taps. While Monitor is active, the master
program continues to render internally but is not sent to the physical output.
Only the selected channel tap reaches the physical output, through monitor
safety gain and the protected limiter. Displayed master meters switch to the
monitor signal and show a visible Monitor state. This prevents the selected
channel from being doubled. Only one channel may be monitored at a time. Monitor
selection is transient session state and is not serialized, restored, included
in portable project files, or rendered into audio exports.

The master strip and all eight instrument strips remain visible whenever the
Mixer studio tab is active at a supported layout. Empty strips are disabled and
labeled `Empty`. There are no hidden mixer banks in the MVP. Effects and Master
replace the Mixer view inside the same compact studio column.

### 19.3 Internal drum-voice mixer

Drum voices have an internal mixer inside the expanded instrument editor.

Voice output flow:

1. Voice synthesis.
2. Voice sample layer.
3. Voice insert.
4. Voice pan and level.
5. Module sum.
6. Module insert chain.
7. Main channel fader.
8. Module send taps according to each send bus pre-fader or post-fader setting.
9. Master.

Voice-level send controls do not exist. The four send controls live only on the
parent rack-slot mixer channel.

### 19.4 Inserts

Approved hierarchy:

- One insert slot per drum voice.
- One eight-slot pedalboard per rack module.
- The module pedalboard is the same chain opened from the rack and the mixer
  channel detail surface.
- Four send-bus chains.
- One master chain with at least six slots.

Each compact A–D card summarizes one modular send-bus chain. It shows the
primary effect, four macros, chain count, bypass state, activity, Edit control,
and circular return Mix control.

### 19.4.1 Automating a mixer, send, effect, or master parameter

Mixer, send, effect, and master parameters are not owned by a rack module, so
they do not appear in the Piano Roll's module-scoped Parameter selector defined
in [pattern editing](spec-006-pattern-editing.md) section 16.3.1.

Each such parameter exposes an `Automate` action on its own control, reached
from the control's context menu and from the keyboard. The action arms the
parameter and opens its lane as the Piano Roll's active lane in the active
Pattern. Editing then follows the single-surface rule: the lane is drawn and
edited only in the Piano Roll.

Arming alone writes no project data and creates no undo entry. The lane record
is created by the first committed edit or by a recorded pass, exactly as for a
module parameter.

While a non-module parameter is armed, the Parameter selector shows it as the
active lane alongside its owning surface name, so the user can see that the
visible lane belongs to the mixer rather than to the selected module. Selecting
any entry from the module-scoped groups replaces it and disarms it.

### 19.5 Solo and mute

- Channel mute silences the module main path and all four sends, regardless of
  whether a send tap is configured pre-fader or post-fader.
- Voice mute silences one drum voice before the module sum.
- Module solo participates in global mixer solo.
- Voice solo is local to its drum module and does not place the parent mixer
  channel into global solo.
- Multiple module solos are additive. When any channel is soloed, only soloed
  channels and their sends feed the mix.
- Shared send returns remain audible only for signal contributed by the
  surviving soloed channels.
- Solo behavior is deterministic and tested.
- Muting and soloing do not rebuild the graph.

### 19.6 Mixer-strip modularity

The channel-strip structure is fixed. Its insert processing, metering options,
and processing modules are swappable through the shared effect plugin system.
There are no replaceable channel-strip types in the MVP.

### 19.7 Output routing

Every rack module exposes output routing to the main output and the four send
buses. The project model may reserve future routing destinations, but the MVP
does not provide fixed subgroups or an arbitrary routing graph.

---

## 20. Effects

Use one effect plugin system for voice inserts, module pedalboards, send chains,
and the master chain.

### 20.1 Effect locations

1. Per-drum-voice insert: one slot.
2. Per-module pedalboard: at least eight slots.
3. Four send buses: each contains a chain.
4. Master chain: at least six slots.
5. Protected limiter: final master slot by default.

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

Effect variants or modes provide the compact default identities:

- Delay in Analog echo mode.
- Reverb in Plate mode.
- Distortion in Drive mode.
- Stereo width as its own effect.

The reverb detailed editor retains the previously designed shimmer capability.

### 20.3 Compact A–D Effects view

The Effects studio tab contains four compact A–D cards. Each card summarizes one
send-bus effect chain. The Effects view replaces the Mixer view inside the same
compact studio column; it is never duplicated beside or below the mixer.

Default primary effects:

- A: Analog echo.
- B: Plate reverb.
- C: Stereo width.
- D: Drive.

Each compact slot contains:

- Bus letter.
- Primary effect name.
- Four macros from the pinned focus effect's declared compact controls.
- Circular return Mix control.
- Chain bypass.
- Edit button placed in the established unused space.
- Activity or status.
- Accent.
- Selection state.
- Chain-count indicator.

The Add effect row appends a plugin to the selected send chain. The detailed
editor manages ordering, replacement, per-plugin bypass, and per-plugin wet/dry
mix.

The user pins one effect in the chain as the compact card focus. The first
effect is pinned by default. The four macros use the pinned plugin's declared
compact controls. If the focused effect is removed, focus moves to the next
surviving effect, then the previous effect, or to an empty-card state when the
chain has no effects.

The circular control keeps the visible label `Mix` but acts as the send-chain
return level from silence to unity. The source remains dry on its main path, and
each plugin retains its own wet/dry control inside the chain.

Edit opens the established 760 × 680 detailed editor without stopping playback.

### 20.4 Pedalboard

- Pedals flow left to right.
- Reorder by pointer drag and keyboard commands.
- Bypass per pedal.
- Wet and dry mix per pedal.
- Compact view with two or three important controls.
- Expanded editor.
- No click or dropout while reordering.
- Stable effect IDs.
- Automation follows the effect instance when moved.

### 20.5 Send buses

- Four buses A through D.
- Independent amount per channel.
- Pre-fader or post-fader per channel and bus.
- Default post-fader.
- Each instrument strip exposes A–D as a 2 × 2 button grid in A, B / C, D
  reading order.
- Activating a send button opens its amount and pre/post value surface; the
  compact button itself shows disabled, zero, and non-zero states without
  relying on color alone.
- Effect chains receive sends and return to master.
- Routing prevents feedback loops.
- Send return level is automatable.

### 20.6 Master chain

- Serial.
- At least six slots.
- Compressor and EQ available by default.
- Limiter in the last slot.
- Limiter protected from removal.
- Limiter may be bypassed.
- One master-effects bypass toggles all user master effects while leaving master
  gain and the protected limiter active.
- Master-effects bypass is project-owned, undoable, playback-safe, and visually
  distinct from the limiter's own detailed bypass.
- Peak reset.
- Metering before and after the chain.

### 20.7 DSP requirements

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

Compressor:

- Threshold.
- Ratio.
- Attack.
- Release.
- Makeup.
- Visible gain reduction.

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

