import { describe, expect, it } from "vitest";

import { validatePluginManifest } from "../../../src/contracts/plugins";
import { DigitalDrumVoice } from "../../../src/engine/dsp/digital-drum-voice";
import {
  BoomEightDsp,
  DEFAULT_BOOM_PARAMETERS,
} from "../../../src/engine/modules/boom-eight/dsp-core";
import { BOOM_EIGHT_MANIFEST } from "../../../src/engine/modules/boom-eight/manifest";
import { BOOM_VOICE_IDS } from "../../../src/engine/modules/boom-eight/voices";
import {
  DEFAULT_DIGIT_FIVE_PARAMETERS,
  DigitFiveDsp,
} from "../../../src/engine/modules/digit-five/dsp-core";
import { DIGIT_FIVE_MANIFEST } from "../../../src/engine/modules/digit-five/manifest";
import { DIGIT_FIVE_VOICE_IDS } from "../../../src/engine/modules/digit-five/voices";
import {
  DEFAULT_DIGIT_SEVEN_PARAMETERS,
  DigitSevenDsp,
} from "../../../src/engine/modules/digit-seven/dsp-core";
import { DIGIT_SEVEN_MANIFEST } from "../../../src/engine/modules/digit-seven/manifest";
import { DIGIT_SEVEN_VOICE_IDS } from "../../../src/engine/modules/digit-seven/voices";
import {
  DEFAULT_HYBRID_PARAMETERS,
  HybridNineDsp,
} from "../../../src/engine/modules/hybrid-nine/dsp-core";
import { HYBRID_NINE_MANIFEST } from "../../../src/engine/modules/hybrid-nine/manifest";
import { HYBRID_VOICE_IDS } from "../../../src/engine/modules/hybrid-nine/voices";

const SAMPLE_RATE = 48_000;

it("drives the shared digital voice lifecycle through its concrete port", () => {
  const voice = new DigitalDrumVoice(
    "voice",
    SAMPLE_RATE,
    { baseFrequency: 180, decay: 0.2, seed: 7, body: "tonal", oneShotSeconds: 0.01 },
    { tune: 0, decay: 0.2, level: 0.8, pan: 0 },
    new Float32Array([1, 0.5, 0.25, 0]),
  );

  expect(voice.isActive()).toBe(false);
  voice.setParameters({ tune: 0, decay: 0.2, level: 0.8, pan: -0.5 });
  expect(voice.getPan()).toBe(-0.5);
  voice.trigger(0.75, true);
  expect(voice.isActive()).toBe(true);
  expect(Number.isFinite(voice.render(16, 1))).toBe(true);
  voice.choke();
  for (let frame = 0; frame < 4_000; frame += 1) voice.render(16, 1);
  expect(voice.isActive()).toBe(false);
});

/**
 * The four machines added alongside Drumline Six. They have different controls
 * and different voices, but they answer to one behavioural contract: bounded
 * output, deterministic rendering, working chokes, and no divergence under
 * hostile parameters. Testing that contract once keeps a new machine from
 * shipping with a gap that only the older modules' tests would have caught.
 */
interface MachineUnderTest {
  readonly name: string;
  readonly manifest: typeof BOOM_EIGHT_MANIFEST | typeof HYBRID_NINE_MANIFEST;
  readonly voiceIds: readonly string[];
  readonly moduleParameterCount: number;
  readonly voiceFieldCount: number;
  readonly create: (sampleRate: number) => MachineDsp;
  /** Voice pair the machine chokes, if it declares one. */
  readonly chokePair?: readonly [string, string];
}

/**
 * The common DSP surface, with voice IDs widened to `string`.
 *
 * Each machine's own type restricts them to its roster, which is what production
 * code needs. Here the machines are driven from a table, so the shared shape has
 * to accept any roster; the manifest test above is what proves each roster is
 * the declared one.
 */
interface MachineDsp {
  setParameters: (update: Record<string, unknown>, mode?: "immediate" | "smooth") => void;
  trigger: (voiceId: string, velocity?: number, accent?: boolean) => void;
  reset: () => void;
  process: (left: Float32Array, right?: Float32Array, start?: number, end?: number) => void;
}

const MACHINES: readonly MachineUnderTest[] = [
  {
    name: "Boom Eight",
    manifest: BOOM_EIGHT_MANIFEST,
    voiceIds: BOOM_VOICE_IDS,
    // tone, compression, level
    moduleParameterCount: 3,
    voiceFieldCount: 5,
    create: (rate) => new BoomEightDsp(rate) as unknown as MachineDsp,
    chokePair: ["closed-hat", "open-hat"],
  },
  {
    name: "Hybrid Nine",
    manifest: HYBRID_NINE_MANIFEST,
    voiceIds: HYBRID_VOICE_IDS,
    // filter, level
    moduleParameterCount: 2,
    voiceFieldCount: 7,
    create: (rate) => new HybridNineDsp(rate) as unknown as MachineDsp,
    chokePair: ["closed-hat", "open-hat"],
  },
  {
    name: "Digit Seven",
    manifest: DIGIT_SEVEN_MANIFEST as unknown as typeof BOOM_EIGHT_MANIFEST,
    voiceIds: DIGIT_SEVEN_VOICE_IDS,
    // compression, bits, rate, level, plus the lo-fi enable
    moduleParameterCount: 5,
    voiceFieldCount: 4,
    create: (rate) => new DigitSevenDsp(rate) as unknown as MachineDsp,
    chokePair: ["closed-hat", "open-hat"],
  },
  {
    name: "Digit Five",
    manifest: DIGIT_FIVE_MANIFEST as unknown as typeof BOOM_EIGHT_MANIFEST,
    voiceIds: DIGIT_FIVE_VOICE_IDS,
    // filter, bits, rate, level, plus the lo-fi enable
    moduleParameterCount: 5,
    voiceFieldCount: 5,
    create: (rate) => new DigitFiveDsp(rate) as unknown as MachineDsp,
    chokePair: ["conga", "bongo"],
  },
];

function render(
  machine: MachineUnderTest,
  configure: (dsp: MachineDsp) => void,
  frames = 4_096,
  blockSize = 128,
): { left: Float32Array; right: Float32Array } {
  const dsp = machine.create(SAMPLE_RATE);
  configure(dsp);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let offset = 0; offset < frames; offset += blockSize) {
    dsp.process(left, right, offset, Math.min(frames, offset + blockSize));
  }
  return { left, right };
}

function peak(samples: Float32Array): number {
  let highest = 0;
  for (const sample of samples) highest = Math.max(highest, Math.abs(sample));
  return highest;
}

function energy(samples: Float32Array, fromFrame = 0): number {
  let total = 0;
  for (let index = fromFrame; index < samples.length; index += 1) {
    total += (samples[index] ?? 0) ** 2;
  }
  return total;
}

/**
 * Narrows an indexed lookup that the test's own table guarantees is present.
 * `noUncheckedIndexedAccess` widens every index to `| undefined`, and the
 * repository forbids the `!` operator, so the check is made explicit instead.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Test fixture is missing ${what}.`);
  return value;
}

describe.each(MACHINES)("$name manifest", (machine) => {
  it("is a valid plugin manifest", () => {
    const validation = validatePluginManifest(machine.manifest);
    expect(validation.ok ? [] : validation.issues).toEqual([]);
  });

  it("declares one parameter per voice field plus the module controls", () => {
    expect(machine.manifest.parameters).toHaveLength(
      machine.voiceIds.length * machine.voiceFieldCount + machine.moduleParameterCount,
    );
    expect(machine.manifest.voices.map((voice) => voice.id)).toEqual([...machine.voiceIds]);
  });

  it("defaults every declared parameter", () => {
    for (const parameter of machine.manifest.parameters) {
      expect(machine.manifest.defaultState[parameter.id]).toBe(parameter.defaultValue);
    }
  });

  it("ships no decoded audio asset", () => {
    expect(machine.manifest.supportsSampleLayers).toBe(false);
  });
});

describe.each(MACHINES)("$name DSP", (machine) => {
  const firstVoice = required(machine.voiceIds[0], "a first voice");

  it("rejects a nonsense sample rate rather than rendering garbage", () => {
    expect(() => machine.create(0)).toThrow(RangeError);
    expect(() => machine.create(Number.NaN)).toThrow(RangeError);
  });

  it("renders silence until a voice is triggered", () => {
    const { left, right } = render(machine, () => undefined, 512);
    expect(peak(left)).toBe(0);
    expect(peak(right)).toBe(0);
  });

  it("renders audible sound after a trigger", () => {
    const { left } = render(machine, (dsp) => {
      dsp.trigger(firstVoice, 1, false);
    });
    expect(peak(left)).toBeGreaterThan(0.01);
  });

  it("keeps every sample finite and inside the output ceiling", () => {
    const { left, right } = render(machine, (dsp) => {
      for (const voiceId of machine.voiceIds) dsp.trigger(voiceId, 1, true);
    });
    for (const samples of [left, right]) {
      for (const sample of samples) {
        expect(Number.isFinite(sample)).toBe(true);
        expect(Math.abs(sample)).toBeLessThanOrEqual(0.98);
      }
    }
  });

  it("renders identically for identical input, so a render is reproducible", () => {
    const first = render(machine, (dsp) => {
      dsp.trigger(firstVoice, 0.8, false);
    });
    const second = render(machine, (dsp) => {
      dsp.trigger(firstVoice, 0.8, false);
    });
    expect([...first.left]).toEqual([...second.left]);
    expect([...first.right]).toEqual([...second.right]);
  });

  it("decays continuously rather than sustaining", () => {
    const seconds = 6;
    const { left } = render(
      machine,
      (dsp) => {
        // Every voice at once, so the longest tail on the machine is covered
        // rather than only the first voice's.
        for (const voiceId of machine.voiceIds) dsp.trigger(voiceId, 1, false);
      },
      SAMPLE_RATE * seconds,
    );

    // Each successive second must carry less energy than the one before it.
    // Asserting the shape rather than a fixed silence deadline keeps the test
    // honest for a long voice such as a ride, whose exponential envelope is
    // inaudible long before it reaches the amplitude floor that ends it.
    const perSecond = Array.from({ length: seconds }, (_, index) => {
      const from = SAMPLE_RATE * index;
      return energy(left.subarray(from, from + SAMPLE_RATE));
    });
    expect(perSecond[0]).toBeGreaterThan(0);
    for (let index = 1; index < perSecond.length; index += 1) {
      const previous = required(perSecond[index - 1], "a previous second");
      const current = required(perSecond[index], "a second");
      // Never louder than the second before. A machine that has already
      // reached exact silence stays there, so the comparison is not strict.
      expect(current, `second ${index}`).toBeLessThanOrEqual(previous);
      if (previous > 0) expect(current, `second ${index}`).toBeLessThan(previous);
    }
    // And the tail is inaudible by the end, whatever its exact floor: -60 dBFS
    // against a full-scale hit, which no listener recovers as sound.
    expect(peak(left.subarray(SAMPLE_RATE * (seconds - 1)))).toBeLessThan(3e-3);
  });

  it("silences every voice on reset", () => {
    const dsp = machine.create(SAMPLE_RATE);
    for (const voiceId of machine.voiceIds) dsp.trigger(voiceId, 1, false);
    dsp.reset();
    const left = new Float32Array(512);
    dsp.process(left, undefined, 0, left.length);
    expect(peak(left)).toBe(0);
  });

  it("survives hostile parameters without diverging", () => {
    const { left } = render(machine, (dsp) => {
      // Every module control pushed past its declared range at once. The DSP
      // clamps rather than trusting the caller, so nothing can go non-finite.
      dsp.setParameters(
        {
          level: 99,
          tone: -50,
          filter: -50,
          drive: 99,
          compression: 99,
          bits: 99,
          rate: -12,
        },
        "immediate",
      );
      for (const voiceId of machine.voiceIds) dsp.trigger(voiceId, 1, true);
    });
    for (const sample of left) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(0.98);
    }
  });

  /**
   * A partial voice update must merge into that voice rather than replace it.
   * A shallow table spread would drop every field the caller omitted, so a
   * voice retuned by one field would silently lose its level and fall silent.
   */
  it("keeps the other fields of a voice when one field is updated", () => {
    const { left } = render(machine, (dsp) => {
      dsp.setParameters({ voices: { [firstVoice]: { tune: 2 } } }, "immediate");
      dsp.trigger(firstVoice, 1, false);
    });
    expect(peak(left)).toBeGreaterThan(0.01);
  });

  it("retriggers a voice from the start rather than layering it", () => {
    const dsp = machine.create(SAMPLE_RATE);
    const left = new Float32Array(2_048);
    dsp.trigger(firstVoice, 1, false);
    dsp.process(left, undefined, 0, 512);
    dsp.trigger(firstVoice, 1, false);
    dsp.process(left, undefined, 512, left.length);
    expect(peak(left)).toBeLessThanOrEqual(0.98);
  });

  if (machine.chokePair !== undefined) {
    const [closed, open] = machine.chokePair;
    it(`chokes ${open} when ${closed} is triggered`, () => {
      const frames = SAMPLE_RATE;
      const chokeAt = 2_048;

      /**
       * Renders the long voice, optionally interrupted by its choke partner.
       *
       * The partner is muted to silence so only the choked voice contributes
       * to the output. Otherwise the partner's own attack dominates the shared
       * mix and the comparison measures that attack rather than the choke.
       */
      const renderTail = (withChoke: boolean) => {
        const dsp = machine.create(SAMPLE_RATE);
        dsp.setParameters({ voices: { [closed]: { level: 0 } } }, "immediate");
        const left = new Float32Array(frames);
        dsp.trigger(open, 1, false);
        dsp.process(left, undefined, 0, chokeAt);
        if (withChoke) dsp.trigger(closed, 1, false);
        dsp.process(left, undefined, chokeAt, frames);
        return left;
      };

      // Measured over the window where the choked voice would still have been
      // ringing, which is where a working choke shows up.
      const from = chokeAt + Math.floor(SAMPLE_RATE * 0.01);
      const to = chokeAt + Math.floor(SAMPLE_RATE * 0.12);
      const freeTail = energy(renderTail(false).subarray(from, to));
      const chokedTail = energy(renderTail(true).subarray(from, to));
      expect(freeTail).toBeGreaterThan(0);
      expect(chokedTail).toBeLessThan(freeTail);
    });
  }
});

describe("digital machines expose a defeatable lo-fi stage", () => {
  it("starts enabled on both digital machines, per decision D05", () => {
    expect(DEFAULT_DIGIT_SEVEN_PARAMETERS.lofiEnabled).toBe(true);
    expect(DEFAULT_DIGIT_FIVE_PARAMETERS.lofiEnabled).toBe(true);
  });

  it("changes the rendered signal when disabled", () => {
    const withStage = render(required(MACHINES[2], "a machine"), (dsp) => {
      dsp.setParameters({ bits: 0.9, rate: 0.8, lofiEnabled: true }, "immediate");
      dsp.trigger("kick", 1, false);
    });
    const withoutStage = render(required(MACHINES[2], "a machine"), (dsp) => {
      dsp.setParameters({ bits: 0.9, rate: 0.8, lofiEnabled: false }, "immediate");
      dsp.trigger("kick", 1, false);
    });
    expect([...withStage.left]).not.toEqual([...withoutStage.left]);
  });

  it("keeps the stored control values while disabled, so re-enabling restores them", () => {
    const dsp = new DigitFiveDsp(SAMPLE_RATE);
    dsp.setParameters({ bits: 0.77, rate: 0.66, lofiEnabled: false }, "immediate");
    const snapshot = dsp.getParameterSnapshot();
    expect(snapshot.bits).toBeCloseTo(0.77, 5);
    expect(snapshot.rate).toBeCloseTo(0.66, 5);
    expect(snapshot.lofiEnabled).toBe(false);
  });
});

describe("Hybrid Nine blends a synth layer against a generated one-shot", () => {
  it("defaults to a blended balance, per decision D05", () => {
    for (const voiceId of HYBRID_VOICE_IDS) {
      expect(DEFAULT_HYBRID_PARAMETERS.voices[voiceId].blend).toBeCloseTo(0.5, 5);
    }
  });

  it("renders a different signal at each end of the blend", () => {
    const synthOnly = render(required(MACHINES[1], "a machine"), (dsp) => {
      dsp.setParameters({ voices: { kick: { blend: 0 } } }, "immediate");
      dsp.trigger("kick", 1, false);
    });
    const oneShotOnly = render(required(MACHINES[1], "a machine"), (dsp) => {
      dsp.setParameters({ voices: { kick: { blend: 1 } } }, "immediate");
      dsp.trigger("kick", 1, false);
    });
    expect([...synthOnly.left]).not.toEqual([...oneShotOnly.left]);
    expect(peak(synthOnly.left)).toBeGreaterThan(0.01);
    expect(peak(oneShotOnly.left)).toBeGreaterThan(0.01);
  });

  it("moves the attack of the one-shot layer when Start is advanced", () => {
    const fromZero = render(required(MACHINES[1], "a machine"), (dsp) => {
      dsp.setParameters({ voices: { kick: { blend: 1, start: 0 } } }, "immediate");
      dsp.trigger("kick", 1, false);
    });
    const fromLater = render(required(MACHINES[1], "a machine"), (dsp) => {
      dsp.setParameters({ voices: { kick: { blend: 1, start: 0.5 } } }, "immediate");
      dsp.trigger("kick", 1, false);
    });
    expect([...fromZero.left]).not.toEqual([...fromLater.left]);
  });
});

describe("Boom Eight bus compression", () => {
  it("reduces peak level as compression is raised", () => {
    const clean = render(required(MACHINES[0], "a machine"), (dsp) => {
      dsp.setParameters({ compression: 0, level: 1 }, "immediate");
      for (const voiceId of BOOM_VOICE_IDS) dsp.trigger(voiceId, 1, true);
    });
    const compressed = render(required(MACHINES[0], "a machine"), (dsp) => {
      dsp.setParameters({ compression: 1, level: 1 }, "immediate");
      for (const voiceId of BOOM_VOICE_IDS) dsp.trigger(voiceId, 1, true);
    });
    // Both stay bounded, and compression changes the signal rather than being
    // an inert control.
    expect([...clean.left]).not.toEqual([...compressed.left]);
    expect(peak(compressed.left)).toBeLessThanOrEqual(0.98);
  });

  it("pans the two toms to opposite sides by default", () => {
    expect(DEFAULT_BOOM_PARAMETERS.voices["low-tom"].pan).toBeLessThan(0);
    expect(DEFAULT_BOOM_PARAMETERS.voices["high-tom"].pan).toBeGreaterThan(0);
  });
});
