/**
 * Digit Seven: seven digital drum voices through a compressed, crushed mix bus.
 *
 * Decision `D05` makes the digital machines sample-heavy with their lo-fi stage
 * enabled, so voices play stored one-shots generated at construction and the
 * bit and rate reducers start active. Section 15.6 requires that the stage can
 * be disabled, which `lofiEnabled` does without discarding the two control
 * values, so re-enabling it restores the user's settings.
 *
 * Determinism: every table is rendered from a seeded xorshift at construction,
 * so the same pattern and parameters always render the same samples. Nothing
 * here reads a clock or a global.
 */

import {
  DigitalDrumVoice,
  generateDigitalOneShot,
  type DigitalVoiceCharacter,
  type DigitalVoiceParameters,
} from "../../dsp/digital-drum-voice";
import {
  clamp,
  mergeVoiceParameters,
  type VoiceParameterUpdate,
  OnePoleLowpass,
  panGains,
  ParameterGlide,
  PeakCompressor,
  softClip,
} from "../../dsp/primitives";
import { DIGIT_SEVEN_VOICE_IDS, type DigitSevenVoiceId } from "./voices";

export { DIGIT_SEVEN_VOICE_IDS, type DigitSevenVoiceId };

export type DigitSevenVoiceParameters = DigitalVoiceParameters;

export interface DigitSevenParameters {
  readonly level: number;
  /** Bus compression depth. 0 leaves the mix untouched. */
  readonly compression: number;
  /** Lo-fi bit depth reduction. 0 is clean. */
  readonly bits: number;
  /** Lo-fi sample-rate reduction. 0 is clean. */
  readonly rate: number;
  /** Section 15.6: the stage starts enabled and can be switched off. */
  readonly lofiEnabled: boolean;
  readonly voices: Readonly<Record<DigitSevenVoiceId, DigitSevenVoiceParameters>>;
}

/**
 * Original voicing targets. These are starting points chosen for musical
 * balance, not measurements of any existing instrument.
 */
const VOICE_CHARACTER: Readonly<Record<DigitSevenVoiceId, DigitalVoiceCharacter>> = {
  kick: { baseFrequency: 54, decay: 0.44, seed: 0x9e3779b9, body: "tonal", oneShotSeconds: 0.44 },
  snare: { baseFrequency: 192, decay: 0.24, seed: 0x85ebca6b, body: "noise", oneShotSeconds: 0.3 },
  clap: {
    baseFrequency: 1_260,
    decay: 0.28,
    seed: 0x27d4eb2f,
    body: "noise",
    oneShotSeconds: 0.32,
  },
  tom: { baseFrequency: 132, decay: 0.38, seed: 0x94d049bb, body: "tonal", oneShotSeconds: 0.4 },
  "closed-hat": {
    baseFrequency: 7_400,
    decay: 0.045,
    seed: 0x165667b1,
    body: "metallic",
    oneShotSeconds: 0.09,
  },
  "open-hat": {
    baseFrequency: 6_700,
    decay: 0.46,
    seed: 0xd3a2646c,
    body: "metallic",
    oneShotSeconds: 0.48,
  },
  crash: {
    baseFrequency: 4_900,
    decay: 1.1,
    seed: 0xbb67ae85,
    body: "metallic",
    oneShotSeconds: 1.15,
  },
};

export const DEFAULT_DIGIT_SEVEN_VOICE_PARAMETERS: Readonly<
  Record<DigitSevenVoiceId, DigitSevenVoiceParameters>
> = Object.freeze(
  Object.fromEntries(
    DIGIT_SEVEN_VOICE_IDS.map((id) => [
      id,
      Object.freeze({
        tune: 0,
        decay: VOICE_CHARACTER[id].decay,
        level: 0.8,
        pan: id === "tom" ? -0.26 : id === "crash" ? 0.32 : id === "clap" ? 0.2 : 0,
      }),
    ]),
  ) as Record<DigitSevenVoiceId, DigitSevenVoiceParameters>,
);

export const DEFAULT_DIGIT_SEVEN_PARAMETERS: DigitSevenParameters = Object.freeze({
  level: 0.72,
  compression: 0.3,
  // Present but gentle: the machine reads as digital without being a caricature.
  bits: 0.28,
  rate: 0.22,
  lofiEnabled: true,
  voices: DEFAULT_DIGIT_SEVEN_VOICE_PARAMETERS,
});

const CHOKE_GROUPS: readonly (readonly DigitSevenVoiceId[])[] = [["closed-hat", "open-hat"]];

export type DigitSevenParameterUpdateMode = "immediate" | "smooth";

export class DigitSevenDsp {
  readonly #sampleRate: number;
  readonly #voices: ReadonlyMap<DigitSevenVoiceId, DigitalDrumVoice>;
  readonly #toneLeft = new OnePoleLowpass();
  readonly #toneRight = new OnePoleLowpass();
  readonly #compressorLeft = new PeakCompressor();
  readonly #compressorRight = new PeakCompressor();
  /** Values the mix bus is currently rendering, which chase `#parameters`. */
  readonly #level: ParameterGlide;
  readonly #compression: ParameterGlide;
  #parameters: DigitSevenParameters = DEFAULT_DIGIT_SEVEN_PARAMETERS;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    this.#sampleRate = sampleRate;
    this.#level = new ParameterGlide(DEFAULT_DIGIT_SEVEN_PARAMETERS.level, sampleRate);
    this.#compression = new ParameterGlide(DEFAULT_DIGIT_SEVEN_PARAMETERS.compression, sampleRate);
    this.#voices = new Map(
      DIGIT_SEVEN_VOICE_IDS.map((id) => [
        id,
        new DigitalDrumVoice(
          id,
          sampleRate,
          VOICE_CHARACTER[id],
          DEFAULT_DIGIT_SEVEN_VOICE_PARAMETERS[id],
          generateDigitalOneShot(VOICE_CHARACTER[id], sampleRate),
        ),
      ]),
    );
  }

  setParameters(
    update: VoiceParameterUpdate<DigitSevenParameters>,
    mode: DigitSevenParameterUpdateMode = "smooth",
  ): void {
    const voices = mergeVoiceParameters(this.#parameters.voices, update.voices);
    this.#parameters = Object.freeze({
      level: clamp(update.level ?? this.#parameters.level, 0, 1),
      compression: clamp(update.compression ?? this.#parameters.compression, 0, 1),
      bits: clamp(update.bits ?? this.#parameters.bits, 0, 1),
      rate: clamp(update.rate ?? this.#parameters.rate, 0, 1),
      lofiEnabled: update.lofiEnabled ?? this.#parameters.lofiEnabled,
      voices,
    });
    // A snapshot is a state replacement, so it lands without a ramp. An
    // incremental change is a user moving a control, so it glides.
    if (mode === "immediate") {
      this.#level.set(this.#parameters.level);
      this.#compression.set(this.#parameters.compression);
    }
    for (const id of DIGIT_SEVEN_VOICE_IDS) this.#voices.get(id)?.setParameters(voices[id]);
  }

  getParameterSnapshot(): DigitSevenParameters {
    return this.#parameters;
  }

  trigger(voiceId: DigitSevenVoiceId, velocity = 1, accent = false): void {
    const voice = this.#voices.get(voiceId);
    if (voice === undefined) return;
    for (const group of CHOKE_GROUPS) {
      if (!group.includes(voiceId)) continue;
      for (const other of group) {
        if (other !== voiceId) this.#voices.get(other)?.choke();
      }
    }
    voice.trigger(velocity, accent);
  }

  reset(): void {
    for (const voice of this.#voices.values()) voice.silence();
    this.#toneLeft.reset();
    this.#toneRight.reset();
    this.#compressorLeft.reset();
    this.#compressorRight.reset();
  }

  process(left: Float32Array, right?: Float32Array, start = 0, end = left.length): void {
    const frameEnd = Math.min(left.length, end);
    const target = this.#parameters;
    // Disabling the stage zeroes both reducers without discarding the stored
    // control values, so switching it back on restores the user's settings.
    const bits = target.lofiEnabled ? target.bits : 0;
    const rate = target.lofiEnabled ? target.rate : 0;

    for (let index = Math.max(0, start); index < frameEnd; index += 1) {
      // Per frame, so a knob drag ramps rather than stepping between blocks.
      const level = this.#level.advance(target.level);
      const compression = this.#compression.advance(target.compression);

      let mixLeft = 0;
      let mixRight = 0;

      for (const voice of this.#voices.values()) {
        if (!voice.active) continue;
        const sample = voice.render(bits, rate);
        if (sample === 0) continue;
        const [leftGain, rightGain] = panGains(voice.pan);
        mixLeft += sample * leftGain;
        mixRight += sample * rightGain;
      }

      const compressedLeft = this.#compressorLeft.process(mixLeft, compression, this.#sampleRate);
      const compressedRight = this.#compressorRight.process(
        mixRight,
        compression,
        this.#sampleRate,
      );

      // A fixed gentle tilt, not a control: it removes the harshest aliasing
      // the crusher produces while leaving the machine recognisably digital.
      const tonedLeft = this.#toneLeft.process(
        softClip(compressedLeft) * level,
        15_000,
        this.#sampleRate,
      );
      const tonedRight = this.#toneRight.process(
        softClip(compressedRight) * level,
        15_000,
        this.#sampleRate,
      );

      const outLeft = clamp(tonedLeft, -0.98, 0.98);
      left[index] = Number.isFinite(outLeft) ? outLeft : 0;
      if (right !== undefined && index < right.length) {
        const outRight = clamp(tonedRight, -0.98, 0.98);
        right[index] = Number.isFinite(outRight) ? outRight : 0;
      }
    }
  }
}
