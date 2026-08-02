import { StateVariableFilter } from "../../dsp/primitives";

export type BassWaveform = "saw" | "square";

export interface BassParameters {
  readonly tune: number;
  readonly cutoff: number;
  readonly resonance: number;
  readonly envelopeAmount: number;
  readonly decay: number;
  readonly accentAmount: number;
  readonly waveform: BassWaveform;
  readonly glide: number;
  readonly volume: number;
}

export type BassParameterUpdateMode = "immediate" | "smooth";

export const DEFAULT_BASS_PARAMETERS: BassParameters = Object.freeze({
  tune: 0,
  cutoff: 720,
  resonance: 0.38,
  envelopeAmount: 0.52,
  decay: 0.28,
  accentAmount: 0.45,
  waveform: "saw",
  glide: 0.08,
  volume: 0.62,
});

const PARAMETER_SMOOTHING_MILLISECONDS = 8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function noteNumberToFrequency(note: number, tune: number): number {
  return 440 * 2 ** ((note + tune - 69) / 12);
}

class ScalarSmoother {
  #current: number;
  #start: number;
  #target: number;
  #totalFrames = 0;
  #remainingFrames = 0;
  #curve: "linear" | "exponential" = "linear";

  constructor(value: number) {
    this.#current = value;
    this.#start = value;
    this.#target = value;
  }

  get value(): number {
    return this.#current;
  }

  setTarget(target: number, curve: "linear" | "exponential", frameCount: number): void {
    if (frameCount <= 0 || Object.is(target, this.#current)) {
      this.#current = target;
      this.#start = target;
      this.#target = target;
      this.#totalFrames = 0;
      this.#remainingFrames = 0;
      return;
    }
    this.#start = this.#current;
    this.#target = target;
    this.#curve = curve;
    this.#totalFrames = frameCount;
    this.#remainingFrames = frameCount;
  }

  next(): number {
    if (this.#remainingFrames === 0) return this.#current;
    const completed = this.#totalFrames - this.#remainingFrames + 1;
    const progress = completed / this.#totalFrames;
    this.#current =
      this.#curve === "exponential" && this.#start > 0 && this.#target > 0
        ? this.#start * (this.#target / this.#start) ** progress
        : this.#start + (this.#target - this.#start) * progress;
    this.#remainingFrames -= 1;
    if (this.#remainingFrames === 0) this.#current = this.#target;
    return this.#current;
  }
}

export class BassMonoDsp {
  readonly #sampleRate: number;
  readonly #smoothingFrames: number;
  #parameters: BassParameters = DEFAULT_BASS_PARAMETERS;
  readonly #tune = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.tune);
  readonly #cutoff = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.cutoff);
  readonly #resonance = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.resonance);
  readonly #envelopeAmount = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.envelopeAmount);
  readonly #decay = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.decay);
  readonly #accentAmount = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.accentAmount);
  readonly #waveformMix = new ScalarSmoother(0);
  readonly #glide = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.glide);
  readonly #volume = new ScalarSmoother(DEFAULT_BASS_PARAMETERS.volume);
  #phase = 0;
  #frequency = 110;
  #targetFrequency = 110;
  #currentNote = 45;
  #envelope = 0;
  #gate = false;
  #accent = 0;
  // The shared filter enforces the Chamberlin stability bound and resets on a
  // non-finite state. A hand-rolled copy of the topology went unstable at high
  // cutoff and latched NaN, which silenced the instrument permanently.
  readonly #filter = new StateVariableFilter();

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    this.#sampleRate = sampleRate;
    this.#smoothingFrames = Math.max(
      1,
      Math.round((PARAMETER_SMOOTHING_MILLISECONDS / 1000) * sampleRate),
    );
  }

  setParameters(update: Partial<BassParameters>, mode: BassParameterUpdateMode = "smooth"): void {
    const next = Object.freeze({
      tune: clamp(update.tune ?? this.#parameters.tune, -24, 24),
      cutoff: clamp(update.cutoff ?? this.#parameters.cutoff, 40, 12_000),
      resonance: clamp(update.resonance ?? this.#parameters.resonance, 0, 0.92),
      envelopeAmount: clamp(update.envelopeAmount ?? this.#parameters.envelopeAmount, 0, 1),
      decay: clamp(update.decay ?? this.#parameters.decay, 0.02, 2),
      accentAmount: clamp(update.accentAmount ?? this.#parameters.accentAmount, 0, 1),
      waveform: update.waveform ?? this.#parameters.waveform,
      glide: clamp(update.glide ?? this.#parameters.glide, 0, 1),
      volume: clamp(update.volume ?? this.#parameters.volume, 0, 1),
    } satisfies BassParameters);
    const frames = mode === "immediate" ? 0 : this.#smoothingFrames;
    if (update.tune !== undefined) this.#tune.setTarget(next.tune, "linear", frames);
    if (update.cutoff !== undefined) {
      this.#cutoff.setTarget(next.cutoff, "exponential", frames);
    }
    if (update.resonance !== undefined) {
      this.#resonance.setTarget(next.resonance, "linear", frames);
    }
    if (update.envelopeAmount !== undefined) {
      this.#envelopeAmount.setTarget(next.envelopeAmount, "linear", frames);
    }
    if (update.decay !== undefined) {
      this.#decay.setTarget(next.decay, "exponential", frames);
    }
    if (update.accentAmount !== undefined) {
      this.#accentAmount.setTarget(next.accentAmount, "linear", frames);
    }
    if (update.waveform !== undefined) {
      this.#waveformMix.setTarget(next.waveform === "square" ? 1 : 0, "linear", frames);
    }
    if (update.glide !== undefined) this.#glide.setTarget(next.glide, "linear", frames);
    if (update.volume !== undefined) this.#volume.setTarget(next.volume, "linear", frames);
    this.#parameters = next;
    if (mode === "immediate" && update.tune !== undefined) {
      this.#targetFrequency = noteNumberToFrequency(this.#currentNote, this.#tune.value);
    }
  }

  getParameterSnapshot(): Readonly<BassParameters> {
    return Object.freeze({
      tune: this.#tune.value,
      cutoff: this.#cutoff.value,
      resonance: this.#resonance.value,
      envelopeAmount: this.#envelopeAmount.value,
      decay: this.#decay.value,
      accentAmount: this.#accentAmount.value,
      waveform: this.#waveformMix.value < 0.5 ? "saw" : "square",
      glide: this.#glide.value,
      volume: this.#volume.value,
    });
  }

  noteOn(note: number, velocity = 1, accented = false, slide = false): void {
    this.#currentNote = clamp(note, 0, 127);
    const target = noteNumberToFrequency(this.#currentNote, this.#tune.value);
    if (!slide || !this.#gate || this.#glide.value === 0) this.#frequency = target;
    this.#targetFrequency = target;
    this.#accent = accented ? clamp(velocity, 0, 1) : 0;
    this.#envelope = clamp(velocity, 0, 1);
    this.#gate = true;
  }

  noteOff(): void {
    this.#gate = false;
  }

  reset(): void {
    this.#phase = 0;
    this.#envelope = 0;
    this.#gate = false;
    this.#filter.reset();
  }

  process(left: Float32Array, right?: Float32Array, start = 0, end = left.length): void {
    const frameEnd = Math.min(left.length, end);
    const releaseCoefficient = Math.exp(-1 / (0.025 * this.#sampleRate));

    for (let index = Math.max(0, start); index < frameEnd; index += 1) {
      const tune = this.#tune.next();
      const cutoff = this.#cutoff.next();
      const resonance = this.#resonance.next();
      const envelopeAmount = this.#envelopeAmount.next();
      const decay = this.#decay.next();
      const accentAmount = this.#accentAmount.next();
      const waveformMix = this.#waveformMix.next();
      const glide = this.#glide.next();
      const volume = this.#volume.next();
      const glideSeconds = 0.002 + glide * 0.35;
      const glideCoefficient = Math.exp(-1 / (glideSeconds * this.#sampleRate));
      const decayCoefficient = Math.exp(-1 / (decay * this.#sampleRate));

      this.#targetFrequency = noteNumberToFrequency(this.#currentNote, tune);
      this.#frequency =
        this.#targetFrequency + glideCoefficient * (this.#frequency - this.#targetFrequency);
      this.#phase += this.#frequency / this.#sampleRate;
      this.#phase -= Math.floor(this.#phase);

      const saw = this.#phase * 2 - 1;
      const square = this.#phase < 0.5 ? 1 : -1;
      const oscillator = saw + (square - saw) * waveformMix;

      this.#envelope *= this.#gate ? decayCoefficient : releaseCoefficient;
      if (this.#envelope < 1e-7) this.#envelope = 0;

      const accentBoost = this.#accent * accentAmount;
      const modulatedCutoff = clamp(
        cutoff * (1 + this.#envelope * envelopeAmount * 8 + accentBoost * 2),
        40,
        Math.min(12_000, this.#sampleRate * 0.42),
      );
      const damping = 1.7 - resonance * 1.55;
      this.#filter.process(oscillator, modulatedCutoff, damping, this.#sampleRate);

      const sample = clamp(
        this.#filter.low * this.#envelope * volume * (0.55 + accentBoost * 0.25),
        -0.95,
        0.95,
      );
      left[index] = Number.isFinite(sample) ? sample : 0;
      if (right !== undefined && index < right.length) {
        right[index] = left[index] ?? 0;
      }
    }
  }
}
