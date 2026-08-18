/**
 * The shared digital drum voice.
 *
 * Gray Ghost and Dusty Mosaic are both digital machines whose voices are stored
 * one-shots played back through a lo-fi stage, so the voice engine is one
 * implementation parameterized by a character table rather than two nearly
 * identical copies. Each machine still owns its own roster, its own character
 * values, and its own faceplate controls; only the rendering mechanism is
 * shared.
 *
 * Decision `D05` makes these machines sample-heavy with their built-in lo-fi
 * stages enabled, which is why playback reads a generated table by default and
 * the crusher is active rather than bypassed.
 *
 * Determinism: every table is rendered from a seeded xorshift at construction,
 * so the same pattern and parameters always render the same samples. Nothing
 * here reads a clock or a global.
 */

import {
  BitCrusher,
  applyVoiceDistortion,
  clamp,
  DeterministicNoise,
  OnePoleHighpass,
  ParameterGlide,
  semitoneRatio,
  StateVariableFilter,
} from "./primitives";
import { SampleBoundaryPlayer } from "./sample-boundary-player";

/** Generator shape for a voice's stored one-shot. */
export type DigitalVoiceBody = "tonal" | "noise" | "metallic";

export interface DigitalVoiceCharacter {
  readonly baseFrequency: number;
  readonly decay: number;
  readonly seed: number;
  readonly body: DigitalVoiceBody;
  /** Seconds of generated one-shot. Bounded so the table stays small. */
  readonly oneShotSeconds: number;
}

export interface DigitalVoiceParameters {
  /** Semitone offset, applied by resampling the stored table. */
  readonly tune: number;
  readonly decay: number;
  readonly level: number;
  /** Per-voice saturation mix. Zero is dry. */
  readonly distortion: number;
  /** -1 hard left to 1 hard right. */
  readonly pan: number;
  /** Extra noise blended into the voice. 0 leaves the table untouched. */
  readonly noise?: number;
}

/**
 * Renders one voice's one-shot table once, at construction.
 *
 * Exported so a machine can build its own tables with its own character values
 * while sharing the generator.
 */
export function generateDigitalOneShot(
  character: DigitalVoiceCharacter,
  sampleRate: number,
): Float32Array {
  const length = Math.max(1, Math.round(character.oneShotSeconds * sampleRate));
  const table = new Float32Array(length);
  const noise = new DeterministicNoise(character.seed);
  const filter = new StateVariableFilter();
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const elapsed = index / sampleRate;
    const envelope = Math.exp(-elapsed / (character.decay * 0.7));
    let sample: number;

    switch (character.body) {
      case "tonal": {
        const sweep = Math.exp(-elapsed / 0.025);
        phase += (character.baseFrequency * (1 + sweep * 3)) / sampleRate;
        phase -= Math.floor(phase);
        sample = Math.sin(2 * Math.PI * phase) * 0.92;
        break;
      }
      case "noise": {
        filter.process(noise.next(), 1_400 + character.baseFrequency * 2.4, 1.05, sampleRate);
        phase += character.baseFrequency / sampleRate;
        phase -= Math.floor(phase);
        sample =
          filter.band * 0.88 + Math.sin(2 * Math.PI * phase) * 0.28 * Math.exp(-elapsed / 0.035);
        break;
      }
      case "metallic": {
        // Several inharmonic partials, which is what separates a cymbal-like
        // voice from filtered noise alone.
        const partials = [1, 1.38, 1.81, 2.29, 2.97];
        let tone = 0;
        for (const ratio of partials) {
          tone += Math.sin(2 * Math.PI * character.baseFrequency * ratio * elapsed);
        }
        filter.process(noise.next(), character.baseFrequency, 1.25, sampleRate);
        sample = (tone / partials.length) * 0.5 + filter.high * 0.55;
        break;
      }
    }

    table[index] = sample * envelope;
  }

  return table;
}

const CHOKE_RELEASE_SECONDS = 0.004;

type DigitalVoiceUpdateMode = "immediate" | "smooth";

export class DigitalDrumVoice {
  readonly id: string;
  readonly #sampleRate: number;
  readonly #sample: SampleBoundaryPlayer;
  readonly #noise: DeterministicNoise;
  readonly #crusher = new BitCrusher();
  readonly #highpass = new OnePoleHighpass();
  /**
   * The manifests declare voice level as a smoothed field, so a committed
   * change on a ringing voice glides instead of stepping in one sample.
   */
  readonly #level: ParameterGlide;
  /** The Distortion descriptor declares the same 8 ms linear glide. */
  readonly #distortion: ParameterGlide;
  /** Linear choke: spec-004 section 21.5 mandates a linear 4 ms fade-out. */
  readonly #chokeStep: number;
  #parameters: DigitalVoiceParameters;
  #amplitude = 0;
  #velocity = 0;
  #accent = 0;
  #active = false;
  #choking = false;

  constructor(
    id: string,
    sampleRate: number,
    character: DigitalVoiceCharacter,
    parameters: DigitalVoiceParameters,
    table: Float32Array,
  ) {
    this.id = id;
    this.#sampleRate = sampleRate;
    this.#parameters = parameters;
    this.#sample = new SampleBoundaryPlayer([table], sampleRate);
    this.#noise = new DeterministicNoise(character.seed);
    this.#level = new ParameterGlide(clamp(parameters.level, 0, 1), sampleRate);
    this.#distortion = new ParameterGlide(clamp(parameters.distortion, 0, 1), sampleRate);
    this.#chokeStep = 1 / Math.max(1, Math.round(CHOKE_RELEASE_SECONDS * sampleRate));
  }

  readonly isActive = (): boolean => this.#active;

  readonly setParameters = (
    parameters: DigitalVoiceParameters,
    mode: DigitalVoiceUpdateMode = "smooth",
  ): void => {
    this.#parameters = parameters;
    // A snapshot is a state replacement, so the smoothed fields land without
    // a ramp. An incremental change glides from the render loop.
    if (mode === "immediate") {
      this.#level.set(clamp(parameters.level, 0, 1));
      this.#distortion.set(clamp(parameters.distortion, 0, 1));
    }
  };

  readonly trigger = (velocity: number, accent: boolean): void => {
    const restarting = this.#active;
    this.#noise.reset();
    this.#crusher.reset();
    this.#highpass.reset();
    // A hit that starts from silence takes the committed level directly; the
    // glide exists to protect a ringing tail, not to lag a fresh attack.
    if (!restarting) {
      this.#level.set(clamp(this.#parameters.level, 0, 1));
      this.#distortion.set(clamp(this.#parameters.distortion, 0, 1));
    }
    // Same-voice restarts retain their exact attack frame. New voices use the
    // mandatory boundary fade before their stored table becomes audible.
    this.#sample.start({ fadeIn: !restarting });
    this.#velocity = clamp(velocity, 0, 1);
    this.#accent = accent ? 1 : 0;
    this.#amplitude = 1;
    this.#active = true;
    this.#choking = false;
  };

  readonly choke = (): void => {
    if (this.#active) this.#choking = true;
  };

  silence(): void {
    this.#active = false;
    this.#choking = false;
    this.#amplitude = 0;
    this.#sample.stop();
    this.#crusher.reset();
    this.#highpass.reset();
  }

  /**
   * Returns the voice's mono sample for this frame.
   *
   * `bits` and `rate` come from the module's lo-fi stage, so every voice in a
   * machine crushes together rather than each carrying its own copy of the
   * control.
   */
  render(bits: number, rate: number): number {
    if (!this.#active) return 0;

    const decaySeconds = clamp(this.#parameters.decay, 0.01, 3);
    const decayCoefficient = Math.exp(-1 / (decaySeconds * this.#sampleRate));
    if (this.#choking) {
      this.#amplitude = Math.max(0, this.#amplitude - this.#chokeStep);
    } else {
      this.#amplitude *= decayCoefficient;
    }
    if (this.#amplitude < 1e-6) {
      this.silence();
      return 0;
    }

    this.#sample.render(semitoneRatio(this.#parameters.tune));
    const played = this.#sample.channel(0);
    const noiseAmount = clamp(this.#parameters.noise ?? 0, 0, 1);
    const blended =
      noiseAmount === 0 ? played : played * (1 - noiseAmount) + this.#noise.next() * noiseAmount;

    // Crushing before the highpass, so the filter removes the low-frequency
    // rumble that quantization introduces rather than passing it through.
    const crushed = this.#crusher.process(blended, bits, rate);
    const cleaned = this.#highpass.process(crushed, 28, this.#sampleRate);

    const gain = this.#velocity * (1 + this.#accent * 0.45);
    const voiceOutput = cleaned * this.#amplitude * gain;
    const distortion = this.#distortion.advance(clamp(this.#parameters.distortion, 0, 1));
    const processed = applyVoiceDistortion(voiceOutput, distortion);
    return processed * this.#level.advance(clamp(this.#parameters.level, 0, 1));
  }

  readonly getPan = (): number => this.#parameters.pan;

}
