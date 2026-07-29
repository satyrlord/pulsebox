/**
 * Shared synthesis primitives for the instrument DSP cores.
 *
 * These are the building blocks every Pulsebox drum machine needs: bounded
 * arithmetic, a deterministic noise source, and filters whose stability limits
 * are enforced here rather than trusted to each caller. Nothing in this module
 * reads a clock, a global, or `Math.random`, so a given parameter and trigger
 * sequence always renders the same samples.
 *
 * This module is pure computation. It holds no DOM handle and no AudioNode, and
 * it is imported by worklet-only DSP cores, so it must stay free of both.
 */

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Equal-tempered frequency ratio, bounded to the range the manifests expose. */
export function semitoneRatio(semitones: number): number {
  return 2 ** (clamp(semitones, -24, 24) / 12);
}

/** Smooth saturation. Bounded for any input, so drive can never blow up. */
export function softClip(value: number): number {
  return value / (1 + Math.abs(value));
}

/**
 * Equal-power stereo placement. A centred voice keeps its apparent loudness
 * when panned, which a linear law would not preserve.
 */
export function panGains(pan: number): readonly [number, number] {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * A parameter update for a machine with a voice table.
 *
 * Partial at both levels: a caller may send some module fields, some voices,
 * and some fields within a voice. `mergeVoiceParameters` is what makes the
 * inner partiality safe.
 */
export type VoiceParameterUpdate<
  TParameters extends { readonly voices: Readonly<Record<string, unknown>> },
> = Partial<Omit<TParameters, "voices">> & {
  readonly voices?: Partial<{
    readonly [K in keyof TParameters["voices"]]: Partial<TParameters["voices"][K]>;
  }>;
};

/**
 * Merges a partial per-voice update into the current voice table.
 *
 * A shallow spread would replace a whole voice with whatever fields the caller
 * happened to send, silently dropping the rest — a voice updated with only
 * `{blend: 0}` would lose its level and fall silent. Every field is optional at
 * this boundary, so the merge has to be per voice rather than per table.
 */
export function mergeVoiceParameters<TVoiceId extends string, TVoice>(
  current: Readonly<Record<TVoiceId, TVoice>>,
  update: Partial<Record<TVoiceId, Partial<TVoice>>> | undefined,
): Readonly<Record<TVoiceId, TVoice>> {
  if (update === undefined) return current;
  const merged: Record<TVoiceId, TVoice> = { ...current };
  for (const [voiceId, patch] of Object.entries(update) as [TVoiceId, Partial<TVoice>][]) {
    merged[voiceId] = { ...current[voiceId], ...patch };
  }
  return merged;
}

/** xorshift32. Deterministic, cheap, and re-seedable per trigger. */
export class DeterministicNoise {
  readonly #seed: number;
  #state: number;

  constructor(seed: number) {
    this.#seed = seed >>> 0 || 1;
    this.#state = this.#seed;
  }

  reset(): void {
    this.#state = this.#seed;
  }

  next(): number {
    let x = this.#state;
    x ^= (x << 13) >>> 0;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    x >>>= 0;
    this.#state = x;
    return (x / 0x7fffffff - 1) * 0.999;
  }
}

/**
 * The Chamberlin topology is only conditionally stable: its frequency
 * coefficient must stay below `2 - damping`, and the sine mapping itself is only
 * meaningful up to a sixth of the sample rate. Above either bound the state
 * diverges to a non-finite value within milliseconds and never returns, so both
 * bounds are enforced here rather than trusted to callers.
 */
const SVF_MAXIMUM_CUTOFF_RATIO = 1 / 6;

export function svfCoefficient(cutoff: number, damping: number, sampleRate: number): number {
  const ceiling = sampleRate * SVF_MAXIMUM_CUTOFF_RATIO;
  const bounded = clamp(cutoff, 0, ceiling);
  const coefficient = 2 * Math.sin((Math.PI * bounded) / sampleRate);
  // Leaves a small margin below the analytical limit so rounding cannot sit
  // exactly on the boundary.
  return Math.min(coefficient, Math.max(0, 2 - damping) * 0.98);
}

/** Two-pole state-variable filter. Shared by every voice's noise shaping. */
export class StateVariableFilter {
  #low = 0;
  #band = 0;
  #high = 0;

  reset(): void {
    this.#low = 0;
    this.#band = 0;
    this.#high = 0;
  }

  process(input: number, cutoff: number, damping: number, sampleRate: number): void {
    const coefficient = svfCoefficient(cutoff, damping, sampleRate);
    this.#low += coefficient * this.#band;
    this.#high = input - this.#low - damping * this.#band;
    this.#band += coefficient * this.#high;
    // A denormal or an out-of-range input can still push the state somewhere it
    // cannot come back from. Clearing it costs one branch and keeps a single bad
    // sample from silencing the instrument for the rest of the session.
    if (!Number.isFinite(this.#low + this.#band + this.#high)) this.reset();
  }

  get low(): number {
    return this.#low;
  }

  get band(): number {
    return this.#band;
  }

  get high(): number {
    return this.#high;
  }
}

/**
 * One-pole lowpass. A mix bus wants a gentle tilt rather than a resonant
 * corner, and this topology is stable for every cutoff up to Nyquist, so a Tone
 * control keeps its full range instead of going inert where a resonant filter
 * would have to be clamped.
 */
export class OnePoleLowpass {
  #value = 0;

  reset(): void {
    this.#value = 0;
  }

  process(input: number, cutoff: number, sampleRate: number): number {
    const bounded = clamp(cutoff, 0, sampleRate * 0.49);
    const coefficient = 1 - Math.exp((-2 * Math.PI * bounded) / sampleRate);
    this.#value += coefficient * (input - this.#value);
    if (!Number.isFinite(this.#value)) this.#value = 0;
    return this.#value;
  }
}

/**
 * One-pole highpass, derived from its complementary lowpass. Digital voices use
 * it to strip the low end a bit-crusher would otherwise turn into rumble.
 */
export class OnePoleHighpass {
  readonly #lowpass = new OnePoleLowpass();

  reset(): void {
    this.#lowpass.reset();
  }

  process(input: number, cutoff: number, sampleRate: number): number {
    return input - this.#lowpass.process(input, cutoff, sampleRate);
  }
}

/**
 * Feed-forward comp/limiter-style gain reduction driven by a peak follower.
 *
 * `amount` at 0 leaves the signal alone and at 1 applies the full ratio, so one
 * normalized faceplate control covers the useful range without exposing a
 * threshold and a ratio the compact plate has no room for.
 */
export class PeakCompressor {
  #envelope = 0;

  reset(): void {
    this.#envelope = 0;
  }

  process(input: number, amount: number, sampleRate: number): number {
    const strength = clamp(amount, 0, 1);
    if (strength === 0) return input;

    const magnitude = Math.abs(input);
    // Fast enough to catch a drum transient, slow enough not to distort the
    // body of the hit by tracking individual cycles.
    const attack = Math.exp(-1 / (0.003 * sampleRate));
    const release = Math.exp(-1 / (0.12 * sampleRate));
    const coefficient = magnitude > this.#envelope ? attack : release;
    this.#envelope = magnitude + coefficient * (this.#envelope - magnitude);
    if (!Number.isFinite(this.#envelope)) this.#envelope = 0;

    const threshold = 0.32;
    if (this.#envelope <= threshold) return input;
    const excess = this.#envelope - threshold;
    const ratio = 1 + strength * 7;
    const target = threshold + excess / ratio;
    const gain = target / this.#envelope;
    // Makeup keeps the compressed voice from simply getting quieter as the
    // control is raised, so the knob reads as density rather than volume.
    return input * gain * (1 + strength * 0.55);
  }
}

/**
 * Bit-depth and sample-rate reduction.
 *
 * Both controls are normalized and both are inert at 0, so a module can declare
 * its lo-fi stage "enabled" without colouring the sound until a user asks for
 * it. The sample-and-hold counter is fractional, so rate reduction sweeps
 * continuously instead of jumping between integer divisors.
 */
export class BitCrusher {
  #held = 0;
  #phase = 0;

  reset(): void {
    this.#held = 0;
    this.#phase = 0;
  }

  process(input: number, bits: number, rate: number): number {
    const holdSteps = 1 + clamp(rate, 0, 1) * 23;
    this.#phase += 1;
    if (this.#phase >= holdSteps) {
      this.#phase -= holdSteps;
      this.#held = input;
    }

    const depth = clamp(bits, 0, 1);
    if (depth === 0) return this.#held;
    // 16 bits down to 2. Quantizing to fewer than two levels would gate the
    // signal to silence rather than sounding crushed.
    const levels = 2 ** (16 - depth * 14);
    return Math.round(this.#held * levels) / levels;
  }
}

/**
 * Per-frame parameter glide.
 *
 * A mix-bus control that jumps between render blocks is audible as a step, so
 * every audible module control chases its target by at most one step per frame.
 */
export class ParameterGlide {
  readonly #step: number;
  #value: number;

  constructor(initial: number, sampleRate: number, seconds = 0.02) {
    this.#value = initial;
    this.#step = 1 / Math.max(1, Math.round(sampleRate * seconds));
  }

  /** Jumps immediately. Used when a whole-state snapshot replaces the value. */
  set(value: number): void {
    this.#value = value;
  }

  get value(): number {
    return this.#value;
  }

  advance(target: number): number {
    const difference = target - this.#value;
    if (difference === 0) return target;
    this.#value =
      Math.abs(difference) <= this.#step
        ? target
        : this.#value + Math.sign(difference) * this.#step;
    return this.#value;
  }
}
