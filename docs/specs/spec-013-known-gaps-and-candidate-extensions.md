# Pulsebox Known Gaps and Candidate Extensions

**Status:** Supporting traceability record  
**Spec ID:** `spec-013`  
**Read with:** [Specification index](spec-000-index.md) and the owning
specification named in each row.  
**Owns:** The list of known gaps between the approved specification set and the
implementation, and the list of candidate extensions that have no approved
requirement.

---

## 28. Known gaps and candidate extensions

This record does not own product behavior. Specifications 001 through 010 own
behavior. [Release acceptance](spec-012-release-acceptance.md) owns the MVP
gate.

### 28.1 Rules for this record

1. Each row has a stable gap ID from `G01` upward. Do not use an ID again.
2. Each row has one of these classes:
   - **Unimplemented.** An owning specification requires the behavior. The
     implementation does not supply it.
   - **Partial.** The implementation supplies only a part of the required
     behavior.
   - **Post-MVP.** An owning specification names the behavior as post-MVP work.
   - **Candidate.** No specification requires the behavior. It needs a direct
     product-owner decision before any work starts.
3. A Candidate row is not a requirement. Do not implement it from this record.
4. When the product owner accepts a Candidate row, write the requirement in its
   owning specification. Then remove the row from this record.
5. When an implementation closes an Unimplemented or Partial row, remove the row
   in the same change.
6. Every Candidate row must obey the originality rules in
   [Product and design foundations](spec-001-product-and-design-foundations.md).
   Sounds, samples, patterns, presets, control ranges, defaults, and
   coefficient data stay original.

<!-- markdownlint-disable MD013 -->

### 28.2 Approved requirements that are not complete

| ID | Class | Gap | Owner |
| -- | ----- | --- | ----- |
| `G01` | Unimplemented | Master WAV export. No offline render path exists. | `spec-009` section 23 |
| `G02` | Unimplemented | Stem export for each rack slot and each send return. | `spec-009` section 23 |
| `G03` | Partial | Automation recording. Record writes rack-module parameter movements only. It does not write mixer, send, effect, or master movements. The user can draw those lanes by hand. | `spec-008` section 18.2 |
| `G04` | Partial | Part length. The state command exists. Only the Stretch tool changes the length in the UI. | `spec-006` section 16 |
| `G05` | Partial | Drum-voice cycle length. The state command and the scheduler support it. No UI control sets it. | `spec-006` section 16 |
| `G06` | Partial | Copy or move of events between module parts. The state command exists. No UI control uses it. | `spec-006` section 16.2 |
| `G07` | Unimplemented | Pattern-level Copy and Paste. Duplicate is the only whole-Pattern copy action. | `spec-006` section 16.2 |
| `G08` | Unimplemented | Silver Serpent sub-oscillator level, second-oscillator detune, filter model, compact filter response, glide mode, detailed envelope, and accent response. | `spec-005` section 15.1 |
| `G09` | Unimplemented | Expanded editor for each instrument. The manifests declare the editor sections. No UI reads them. | `spec-005` section 15 |
| `G10` | Unimplemented | User-assignable choke groups, user and factory sample layers, per-voice metering, and per-voice step resolution for drum modules. | `spec-005` section 15.2 |
| `G11` | Unimplemented | Twin Engine waveform preview, sound selector, and send emphasis. | `spec-005` section 15.5 |

### 28.3 Post-MVP work

| ID | Class | Gap | Owner |
| -- | ----- | --- | ----- |
| `G20` | Post-MVP | Song loop markers. The Song has a start marker only. | `spec-008` section 18.1 |
| `G21` | Post-MVP | Song-level automation. Each automation lane belongs to one Pattern. | `spec-008` section 18.1 |
| `G22` | Post-MVP | Lane-based timeline. The Playlist chains whole Patterns. It cannot arrange each instrument independently. | `spec-008` section 18.1 |
| `G23` | Post-MVP | Selectable grid resolution, which includes 1/32 and triplet grids. The grid is fixed at 1/16. | `spec-004` section 17 |
| `G24` | Post-MVP | Per-Pattern Swing. Swing is one global value. | `spec-004` section 17 |
| `G25` | Post-MVP | Tempo automation and time-signature timelines. | `spec-004` section 17 |

### 28.4 Candidate extensions

No specification requires these rows. Each row needs a product decision.

#### 28.4.1 Silver Serpent voice behavior

| ID | Class | Candidate | Current behavior |
| -- | ----- | --------- | ---------------- |
| `G30` | Candidate | Separate filter envelope and amplitude envelope. | One decay envelope drives the cutoff and the amplitude. |
| `G31` | Candidate | No envelope retrigger on a slid note. The pitch glides and the envelope continues. | The envelope starts again on each note, which includes a slid note. |
| `G32` | Candidate | Accent response that changes the envelope. An accented note uses a short fixed decay. A smoothed accent envelope adds to the cutoff and increases across consecutive accents. Its depth decreases as Resonance increases. | Accent adds a fixed cutoff offset and a fixed gain offset. |
| `G33` | Candidate | Steeper low-pass response of approximately 18 dB per octave. | The filter is a 12 dB per octave state-variable low-pass. |
| `G34` | Candidate | Fixed high-pass stage after the filter to remove low-frequency offset. | The output has no high-pass stage. |
| `G35` | Candidate | Per-step octave-up and octave-down switches. | The Piano Roll shows a fixed 25-note range. The Tune control and the Transpose tool move the pitch. |
| `G36` | Candidate | Pattern bank for each instrument. | Patterns are project-wide. One Pattern holds a part for every module. |

#### 28.4.2 Drum modules

| ID | Class | Candidate | Current behavior |
| -- | ----- | --------- | ---------------- |
| `G40` | Candidate | More Soft Thunder voices: clap, cowbell, cymbal, and mid tom. | The module has kick, sub kick, snare, rim, low tom, high tom, closed hat, and open hat. |
| `G41` | Candidate | More Twin Engine voices: mid tom and crash. | The module has kick, snare, clap, rim, low tom, high tom, closed hat, open hat, and ride. |
| `G42` | Candidate | Snare noise-amount control. | No drum module has this control. |
| `G43` | Candidate | Per-voice tone control. | Tone is one module-level control on Soft Thunder. |
| `G44` | Candidate | Module-level accent amount control. | Accent adds a fixed gain to the trigger. |
| `G45` | Candidate | Flam interval control. | Flam has a grace-hit count. The interval is fixed. |

#### 28.4.3 Effects

| ID | Class | Candidate | Current behavior |
| -- | ----- | --------- | ---------------- |
| `G50` | Candidate | Pattern Filter step patterns. The effect owns a set of original step patterns with lengths of 8, 16, or 32 steps. | The effect has no pattern of its own. A Piano Roll automation lane moves the cutoff. |
| `G51` | Candidate | Pattern Filter envelope. Each active step starts an envelope with Amount and Decay controls. | The effect has no envelope. |
| `G52` | Candidate | Pattern Filter band-pass mode. | The effect is low-pass only. |
| `G53` | Candidate | Analog Echo triplet and dotted beat times. | Beat time uses 1/16-beat increments. |
| `G54` | Candidate | Analog Echo pan control for the wet signal. | The effect has a ping-pong switch and no pan control. |
| `G55` | Candidate | Distortion shape control that selects the transfer curve continuously. | The effect has three fixed models. |
| `G56` | Candidate | Compressor hold stage in the level detector. | The detector has attack and release only. |

<!-- markdownlint-enable MD013 -->

### 28.5 Maintenance

- Keep each row current with the implementation. This record states the current
  condition only.
- Do not record how a person or tool found a gap.
- Do not record check results in this file.
- When an owning specification changes the class of a row, move the row to the
  applicable table.
