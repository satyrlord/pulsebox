/**
 * Digit Five: eight digital voices weighted toward percussion, through a
 * filtered and crushed mix bus.
 *
 * Section 15.7 gives this machine a Noise amount and a Filter where Digit Seven
 * has Compression, and decision `D05` makes both digital machines sample-heavy
 * with their lo-fi stage enabled. Noise is per voice, so a shaker can be dusty
 * while the kick stays clean; the Filter and the lo-fi stage are module-wide.
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
  softClip,
} from "../../dsp/primitives";
import { DIGIT_FIVE_VOICE_IDS, type DigitFiveVoiceId } from "./voices";

export type DigitFiveVoiceParameters = DigitalVoiceParameters;

export interface DigitFiveParameters {
  readonly level: number;
  /** Mix-bus lowpass: 0 is dark, 1 is fully open. */
  readonly filter: number;
  /** Lo-fi bit depth reduction. 0 is clean. */
  readonly bits: number;
  /** Lo-fi sample-rate reduction. 0 is clean. */
  readonly rate: number;
  /** Section 15.7: the stage starts enabled and can be switched off. */
  readonly lofiEnabled: boolean;
  readonly voices: Readonly<Record<DigitFiveVoiceId, DigitFiveVoiceParameters>>;
}

/**
 * Original voicing targets. These are starting points chosen for musical
 * balance, not measurements of any existing instrument.
 */
const VOICE_CHARACTER: Readonly<Record<DigitFiveVoiceId, DigitalVoiceCharacter>> = {
  kick: { baseFrequency: 56, decay: 0.4, seed: 0x9e3779b9, body: "tonal", oneShotSeconds: 0.4 },
  snare: { baseFrequency: 198, decay: 0.22, seed: 0x85ebca6b, body: "noise", oneShotSeconds: 0.28 },
  hat: {
    baseFrequency: 7_600,
    decay: 0.06,
    seed: 0x165667b1,
    body: "metallic",
    oneShotSeconds: 0.11,
  },
  conga: { baseFrequency: 220, decay: 0.32, seed: 0x94d049bb, body: "tonal", oneShotSeconds: 0.34 },
  bongo: { baseFrequency: 340, decay: 0.24, seed: 0x6a09e667, body: "tonal", oneShotSeconds: 0.26 },
  cowbell: {
    baseFrequency: 820,
    decay: 0.3,
    seed: 0xbb67ae85,
    body: "metallic",
    oneShotSeconds: 0.32,
  },
  shaker: {
    baseFrequency: 5_800,
    decay: 0.1,
    seed: 0x3c6ef372,
    body: "noise",
    oneShotSeconds: 0.16,
  },
  clave: {
    baseFrequency: 1_980,
    decay: 0.07,
    seed: 0xa54ff53a,
    body: "tonal",
    oneShotSeconds: 0.12,
  },
};

const DEFAULT_DIGIT_FIVE_VOICE_PARAMETERS: Readonly<
  Record<DigitFiveVoiceId, DigitFiveVoiceParameters>
> = Object.freeze(
  Object.fromEntries(
    DIGIT_FIVE_VOICE_IDS.map((id) => [
      id,
      Object.freeze({
        tune: 0,
        decay: VOICE_CHARACTER[id].decay,
        level: 0.8,
        // Percussion spreads across the field; the kit core stays centred.
        pan:
          id === "conga"
            ? -0.34
            : id === "bongo"
              ? 0.34
              : id === "cowbell"
                ? 0.22
                : id === "shaker"
                  ? -0.24
                  : id === "clave"
                    ? 0.4
                    : 0,
        // The dusty voices carry a little noise by default; the tuned core
        // stays clean so a user hears the control rather than inheriting it.
        noise: id === "shaker" ? 0.35 : id === "snare" ? 0.2 : 0,
      }),
    ]),
  ) as Record<DigitFiveVoiceId, DigitFiveVoiceParameters>,
);

export const DEFAULT_DIGIT_FIVE_PARAMETERS: DigitFiveParameters = Object.freeze({
  level: 0.7,
  filter: 0.82,
  bits: 0.32,
  rate: 0.26,
  lofiEnabled: true,
  voices: DEFAULT_DIGIT_FIVE_VOICE_PARAMETERS,
});

/** One pair of hands, one shaker: the percussion voices choke their own kind. */
const CHOKE_GROUPS: readonly (readonly DigitFiveVoiceId[])[] = [["conga", "bongo"]];

export type DigitFiveParameterUpdateMode = "immediate" | "smooth";

export class DigitFiveDsp {
  readonly #sampleRate: number;
  readonly #voices: ReadonlyMap<DigitFiveVoiceId, DigitalDrumVoice>;
  readonly #filterLeft = new OnePoleLowpass();
  readonly #filterRight = new OnePoleLowpass();
  /** Values the mix bus is currently rendering, which chase `#parameters`. */
  readonly #level: ParameterGlide;
  readonly #filter: ParameterGlide;
  #parameters: DigitFiveParameters = DEFAULT_DIGIT_FIVE_PARAMETERS;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    this.#sampleRate = sampleRate;
    this.#level = new ParameterGlide(DEFAULT_DIGIT_FIVE_PARAMETERS.level, sampleRate);
    this.#filter = new ParameterGlide(DEFAULT_DIGIT_FIVE_PARAMETERS.filter, sampleRate);
    this.#voices = new Map(
      DIGIT_FIVE_VOICE_IDS.map((id) => [
        id,
        new DigitalDrumVoice(
          id,
          sampleRate,
          VOICE_CHARACTER[id],
          DEFAULT_DIGIT_FIVE_VOICE_PARAMETERS[id],
          generateDigitalOneShot(VOICE_CHARACTER[id], sampleRate),
        ),
      ]),
    );
  }

  setParameters(
    update: VoiceParameterUpdate<DigitFiveParameters>,
    mode: DigitFiveParameterUpdateMode = "smooth",
  ): void {
    const voices = mergeVoiceParameters(this.#parameters.voices, update.voices);
    this.#parameters = Object.freeze({
      level: clamp(update.level ?? this.#parameters.level, 0, 1),
      filter: clamp(update.filter ?? this.#parameters.filter, 0, 1),
      bits: clamp(update.bits ?? this.#parameters.bits, 0, 1),
      rate: clamp(update.rate ?? this.#parameters.rate, 0, 1),
      lofiEnabled: update.lofiEnabled ?? this.#parameters.lofiEnabled,
      voices,
    });
    // A snapshot is a state replacement, so it lands without a ramp. An
    // incremental change is a user moving a control, so it glides.
    if (mode === "immediate") {
      this.#level.set(this.#parameters.level);
      this.#filter.set(this.#parameters.filter);
    }
    for (const id of DIGIT_FIVE_VOICE_IDS) this.#voices.get(id)?.setParameters(voices[id]);
  }

  getParameterSnapshot(): DigitFiveParameters {
    return this.#parameters;
  }

  trigger(voiceId: DigitFiveVoiceId, velocity = 1, accent = false): void {
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
    this.#filterLeft.reset();
    this.#filterRight.reset();
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
      const filter = this.#filter.advance(target.filter);
      const cutoff = 440 * (16_000 / 440) ** clamp(filter, 0, 1);

      let mixLeft = 0;
      let mixRight = 0;

      for (const voice of this.#voices.values()) {
        if (!voice.isActive()) continue;
        const sample = voice.render(bits, rate);
        if (sample === 0) continue;
        const [leftGain, rightGain] = panGains(voice.getPan());
        mixLeft += sample * leftGain;
        mixRight += sample * rightGain;
      }

      const filteredLeft = this.#filterLeft.process(
        softClip(mixLeft) * level,
        cutoff,
        this.#sampleRate,
      );
      const filteredRight = this.#filterRight.process(
        softClip(mixRight) * level,
        cutoff,
        this.#sampleRate,
      );

      const outLeft = clamp(filteredLeft, -0.98, 0.98);
      left[index] = Number.isFinite(outLeft) ? outLeft : 0;
      if (right !== undefined && index < right.length) {
        const outRight = clamp(filteredRight, -0.98, 0.98);
        right[index] = Number.isFinite(outRight) ? outRight : 0;
      }
    }
  }
}
