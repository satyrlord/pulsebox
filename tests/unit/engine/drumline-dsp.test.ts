import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRUMLINE_PARAMETERS,
  DRUM_VOICE_IDS,
  DrumlineSixDsp,
  type DrumVoiceId,
} from "../../../src/engine/modules/drumline-six/dsp-core";
import { DRUMLINE_SIX_MANIFEST } from "../../../src/engine/modules/drumline-six/manifest";
import { validatePluginManifest } from "../../../src/contracts/plugins";

const SAMPLE_RATE = 48_000;

function render(
  configure: (dsp: DrumlineSixDsp) => void,
  frames = 4_096,
  blockSize = 128,
): { left: Float32Array; right: Float32Array } {
  const dsp = new DrumlineSixDsp(SAMPLE_RATE);
  configure(dsp);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let offset = 0; offset < frames; offset += blockSize) {
    const end = Math.min(frames, offset + blockSize);
    dsp.process(left, right, offset, end);
  }
  return { left, right };
}

function peak(samples: Float32Array): number {
  let highest = 0;
  for (const sample of samples) highest = Math.max(highest, Math.abs(sample));
  return highest;
}

/** Exact zeros are what a diverged filter writes once its NaN guard trips. */
function silentFraction(samples: Float32Array): number {
  let zeros = 0;
  for (const sample of samples) if (sample === 0) zeros += 1;
  return zeros / samples.length;
}

function energyAfter(samples: Float32Array, fromFrame: number): number {
  let total = 0;
  for (let index = fromFrame; index < samples.length; index += 1) {
    total += (samples[index] ?? 0) ** 2;
  }
  return total;
}

describe("Drumline Six manifest", () => {
  it("is a valid plugin manifest", () => {
    const validation = validatePluginManifest(DRUMLINE_SIX_MANIFEST);
    expect(validation.ok ? [] : validation.issues).toEqual([]);
  });

  it("declares one parameter per voice field plus the module controls", () => {
    // Six voices with five fields each, plus tone, drive, and level.
    expect(DRUMLINE_SIX_MANIFEST.parameters).toHaveLength(6 * 5 + 3);
    expect(DRUMLINE_SIX_MANIFEST.voices.map((voice) => voice.id)).toEqual([...DRUM_VOICE_IDS]);
  });

  it("defaults every declared parameter", () => {
    for (const parameter of DRUMLINE_SIX_MANIFEST.parameters) {
      expect(DRUMLINE_SIX_MANIFEST.defaultState[parameter.id]).toBe(parameter.defaultValue);
    }
  });

  it("ships no sample layer, so it carries no audio asset", () => {
    expect(DRUMLINE_SIX_MANIFEST.supportsSampleLayers).toBe(false);
  });
});

describe("DrumlineSixDsp", () => {
  it("renders silence until a voice is triggered", () => {
    const { left } = render(() => undefined, 1_024);
    expect(peak(left)).toBe(0);
  });

  it.each([...DRUM_VOICE_IDS])("produces audible output for %s", (voiceId) => {
    const { left } = render((dsp) => {
      dsp.trigger(voiceId);
    });
    expect(peak(left)).toBeGreaterThan(0.001);
  });

  it("is deterministic: identical triggers render identical samples", () => {
    const first = render((dsp) => {
      dsp.trigger("snare", 0.8, true);
    });
    const second = render((dsp) => {
      dsp.trigger("snare", 0.8, true);
    });
    expect([...second.left]).toEqual([...first.left]);
    expect([...second.right]).toEqual([...first.right]);
  });

  it("renders the same output regardless of host block size", () => {
    const small = render(
      (dsp) => {
        dsp.trigger("kick");
      },
      2_048,
      37,
    );
    const large = render(
      (dsp) => {
        dsp.trigger("kick");
      },
      2_048,
      512,
    );
    expect([...large.left]).toEqual([...small.left]);
  });

  it("re-seeds noise on every trigger so a repeated hit is identical", () => {
    const dsp = new DrumlineSixDsp(SAMPLE_RATE);
    const first = new Float32Array(2_048);
    const second = new Float32Array(2_048);

    dsp.trigger("closed-hat");
    dsp.process(first);
    dsp.reset();
    dsp.trigger("closed-hat");
    dsp.process(second);

    expect([...second]).toEqual([...first]);
  });

  it("lets the closed hat choke the open hat", () => {
    const chokeFrame = 480;
    const open = render((dsp) => {
      dsp.trigger("open-hat");
    });
    const choked = render((dsp) => {
      dsp.trigger("open-hat");
    });

    // Re-render the choked case with the closed hat landing part-way through.
    const dsp = new DrumlineSixDsp(SAMPLE_RATE);
    dsp.trigger("open-hat");
    const buffer = new Float32Array(choked.left.length);
    dsp.process(buffer, undefined, 0, chokeFrame);
    dsp.trigger("closed-hat");
    dsp.process(buffer, undefined, chokeFrame, buffer.length);

    const tailFrom = chokeFrame + 2_400;
    expect(energyAfter(buffer, tailFrom)).toBeLessThan(energyAfter(open.left, tailFrom) * 0.5);
  });

  it("scales output with velocity and lifts it with accent", () => {
    const quiet = render((dsp) => {
      dsp.trigger("kick", 0.3);
    });
    const loud = render((dsp) => {
      dsp.trigger("kick", 1);
    });
    const accented = render((dsp) => {
      dsp.trigger("kick", 1, true);
    });

    expect(peak(quiet.left)).toBeLessThan(peak(loud.left));
    expect(peak(accented.left)).toBeGreaterThan(peak(loud.left));
  });

  it("pans a voice across the stereo field", () => {
    const left = render((dsp) => {
      dsp.setParameters({
        voices: {
          ...DEFAULT_DRUMLINE_PARAMETERS.voices,
          kick: { ...DEFAULT_DRUMLINE_PARAMETERS.voices.kick, pan: -1 },
        },
      });
      dsp.trigger("kick");
    });

    expect(peak(left.left)).toBeGreaterThan(peak(left.right) * 4);
  });

  it("keeps output bounded at maximum drive and level", () => {
    const { left, right } = render((dsp) => {
      dsp.setParameters({ drive: 1, level: 1, tone: 1 });
      for (const voiceId of DRUM_VOICE_IDS) dsp.trigger(voiceId, 1, true);
    });

    // The clamp is applied before the Float32Array store, so the ceiling is the
    // nearest float to 0.98 rather than 0.98 exactly.
    expect(peak(left)).toBeLessThanOrEqual(Math.fround(0.98));
    expect(peak(right)).toBeLessThanOrEqual(Math.fround(0.98));
    expect([...left].every((sample) => Number.isFinite(sample))).toBe(true);
    // Bounded and finite are both satisfied by silence, so assert the module is
    // still producing signal. A diverged filter reads as a run of exact zeros.
    expect(peak(left)).toBeGreaterThan(0.05);
    expect(silentFraction(left)).toBeLessThan(0.1);
  });

  it("stays audible across the whole Tone range", () => {
    // Tone drives the mix-bus filter. A conditionally stable topology diverges
    // above its cutoff limit and latches the module silent, so every setting the
    // faceplate knob can reach is checked rather than only the default.
    for (const tone of [0, 0.25, 0.5, 0.78, 0.85, 0.95, 1]) {
      const { left } = render((dsp) => {
        dsp.setParameters({ tone });
        dsp.trigger("kick", 1, false);
      }, 24_000);

      expect(peak(left), `tone ${String(tone)} must stay audible`).toBeGreaterThan(0.05);
      expect(silentFraction(left), `tone ${String(tone)} must not go silent`).toBeLessThan(0.1);
    }
  });

  it("recovers after the loudest reachable settings", () => {
    const dsp = new DrumlineSixDsp(SAMPLE_RATE);
    dsp.setParameters({ drive: 1, level: 1, tone: 1 });
    for (const voiceId of DRUM_VOICE_IDS) dsp.trigger(voiceId, 1, true);
    dsp.process(new Float32Array(24_000), new Float32Array(24_000));

    // Turning a control back must restore the sound. A latched non-finite filter
    // state would leave the instrument silent for the rest of the session.
    dsp.setParameters({ drive: 0.18, level: 0.72, tone: 0.5 });
    dsp.trigger("snare", 1, false);
    const after = new Float32Array(24_000);
    dsp.process(after, undefined, 0, after.length);

    expect(peak(after)).toBeGreaterThan(0.05);
  });

  it("renders a voice at the same level on both supported sample rates", () => {
    // Live behaviour is required at 44.1 kHz and 48 kHz. A filter running past
    // its stability limit is rate-dependent, so equal levels are the evidence
    // that neither rate is operating outside it.
    for (const voiceId of DRUM_VOICE_IDS) {
      const levels = [44_100, 48_000].map((rate) => {
        const dsp = new DrumlineSixDsp(rate);
        dsp.trigger(voiceId, 1, false);
        const buffer = new Float32Array(Math.round(rate * 0.5));
        dsp.process(buffer, undefined, 0, buffer.length);
        return peak(buffer);
      });

      const decibels = Math.abs(20 * Math.log10((levels[0] ?? 0) / (levels[1] ?? 1)));
      expect(decibels, `${voiceId} must match within 1.5 dB across rates`).toBeLessThan(1.5);
    }
  });

  it("decays away rather than ringing forever", () => {
    const { left } = render((dsp) => {
      dsp.trigger("rim");
    }, 48_000);

    // The voice itself stops, but the shared tone filter keeps a decaying tail.
    // Half a second after a 60 ms hit that tail must be at least 60 dB down.
    const tail = peak(left.subarray(24_000));
    expect(tail).toBeLessThan(peak(left) / 1_000);
  });

  it("ignores an unknown voice", () => {
    const { left } = render((dsp) => {
      dsp.trigger("not-a-voice" as DrumVoiceId);
    });
    expect(peak(left)).toBe(0);
  });

  it("ramps an incremental level change and applies a snapshot instantly", () => {
    // A knob drag arrives as incremental changes. Stepping the mix-bus gain
    // between blocks is an audible click, so the value has to glide.
    const smooth = new DrumlineSixDsp(SAMPLE_RATE);
    smooth.setParameters({ level: 1 }, "immediate");
    smooth.trigger("kick", 1, false);
    const settle = new Float32Array(512);
    smooth.process(settle, undefined, 0, settle.length);

    smooth.setParameters({ level: 0 }, "smooth");
    const ramped = new Float32Array(8);
    smooth.process(ramped, undefined, 0, ramped.length);
    // Still audible a handful of frames after the change, because it is gliding.
    expect(peak(ramped)).toBeGreaterThan(0);

    const instant = new DrumlineSixDsp(SAMPLE_RATE);
    instant.setParameters({ level: 1 }, "immediate");
    instant.trigger("kick", 1, false);
    instant.process(new Float32Array(512), undefined, 0, 512);
    instant.setParameters({ level: 0 }, "immediate");
    const stepped = new Float32Array(8);
    instant.process(stepped, undefined, 0, stepped.length);

    // The snapshot path replaces state outright, so it lands without a ramp.
    expect(peak(stepped)).toBeLessThan(peak(ramped));
  });

  it("clamps parameters to their declared range", () => {
    const dsp = new DrumlineSixDsp(SAMPLE_RATE);
    dsp.setParameters({ level: 9, drive: -4, tone: 12 });
    const snapshot = dsp.getParameterSnapshot();
    expect(snapshot.level).toBe(1);
    expect(snapshot.drive).toBe(0);
    expect(snapshot.tone).toBe(1);
  });

  it("rejects an invalid sample rate", () => {
    expect(() => new DrumlineSixDsp(0)).toThrow(RangeError);
    expect(() => new DrumlineSixDsp(Number.NaN)).toThrow(RangeError);
  });
});
