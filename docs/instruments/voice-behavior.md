# Instrument voice behavior

**Status:** Normative instrument reference

This document records the voice contract that
[the audio engine and transport specification](../specs/spec-004-audio-engine-and-transport.md)
section 21.4 requires for each instrument. The registered manifest under
`src/engine/modules/<plugin-id>/manifest.ts` is the machine-checked source of
these values. When a manifest changes, update this table in the same change.

| Instrument | Maximum voices | Steal priority | Release | Choke policy | Retrigger policy |
| ---------- | -------------- | -------------- | ------- | ------------ | ---------------- |
| Silver Serpent (`bass-mono`) | 1 | oldest | 25 ms | none | legato |
| Tin Soldier (`drum-analog-small`) | 6 | oldest | 4 ms | group | restart |
| Soft Thunder (`drum-analog-large`) | 8 | oldest | 5 ms | group | restart |
| Twin Engine (`drum-hybrid`) | 9 | oldest | 4 ms | group | restart |
| Gray Ghost (`drum-digital-a`) | 7 | oldest | 4 ms | group | restart |
| Dusty Mosaic (`drum-digital-b`) | 8 | oldest | 4 ms | group | restart |

Rules:

- A steal or choke applies the declared release ramp. It never cuts a voice to
  zero in one sample.
- `group` choke means one voice can silence another voice in its declared choke
  group. The closed hat chokes the open hat in each drum machine.
- `restart` retrigger restarts the same fixed voice from its start with the new
  velocity. `legato` retrigger glides the single bass voice without a restart.
- Each drum machine assigns one fixed voice per drum. Two triggers can only
  contend for the same voice, so the retrigger policy is the steal path.
- The transient audition voice uses a separate adapter. A transport note cannot
  steal a held audition.
