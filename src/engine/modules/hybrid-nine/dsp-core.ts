/**
 * Twin Engine: nine voices, each blending a synthesized layer with a
 * runtime-generated one-shot layer.
 *
 * Decision `D05` makes this machine the blended one: its default Blend sits
 * between the analog machines' synth-heavy weighting and the digital machines'
 * sample-heavy weighting. The "sample" layer is generated deterministically at
 * construction from the same primitives as the synth layer, so the module ships
 * no audio assets and needs no decoder, while still exposing the Start-position
 * and Attack controls that only a stored buffer can offer.
 *
 * Determinism: every buffer is rendered from a seeded xorshift at construction,
 * and playback reads that buffer, so the same pattern and parameters always
 * render the same samples. Nothing here reads a clock or a global.
 */

import {
  applyVoiceDistortion,
  clamp,
  DeterministicNoise,
  EqualPowerPan,
  OnePoleLowpass,
  ParameterGlide,
  mergeVoiceParameters,
  type VoiceParameterUpdate,
  semitoneRatio,
  softClip,
  StateVariableFilter,
  VoiceMixGates,
} from "../../dsp/primitives";
import { SampleBoundaryPlayer } from "../../dsp/sample-boundary-player";
import { HYBRID_VOICE_IDS, type HybridVoiceId } from "./voices";

export interface HybridVoiceParameters {
  /** Semitone offset applied to both layers. */
  readonly tune: number;
  readonly decay: number;
  /** 0 plays only the synth layer, 1 only the generated one-shot. */
  readonly blend: number;
  /** Normalized playback start offset into the one-shot layer. */
  readonly start: number;
  /** Attack softening, in seconds at full value. 0 keeps the raw transient. */
  readonly attack: number;
  readonly level: number;
  readonly distortion: number;
  /** -1 hard left to 1 hard right. */
  readonly pan: number;
  /** A muted voice keeps rendering but contributes silence to the mix. */
  readonly mute: boolean;
  /** While any voice is soloed, only soloed voices reach the mix. */
  readonly solo: boolean;
}

export interface HybridNineParameters {
  readonly level: number;
  /** Mix-bus lowpass: 0 is dark, 1 is fully open. */
  readonly filter: number;
  readonly voices: Readonly<Record<HybridVoiceId, HybridVoiceParameters>>;
}

interface VoiceCharacter {
  readonly baseFrequency: number;
  readonly decay: number;
  readonly seed: number;
  /** Generator shape for the one-shot layer. */
  readonly body: "tonal" | "noise" | "metallic";
  /** Seconds of generated one-shot. Bounded so the table stays small. */
  readonly oneShotSeconds: number;
}

/**
 * Original voicing targets. These are starting points chosen for musical
 * balance, not measurements of any existing instrument.
 */
const VOICE_CHARACTER: Readonly<Record<HybridVoiceId, VoiceCharacter>> = {
  kick: { baseFrequency: 50, decay: 0.5, seed: 0x9e3779b9, body: "tonal", oneShotSeconds: 0.5 },
  snare: { baseFrequency: 180, decay: 0.26, seed: 0x85ebca6b, body: "noise", oneShotSeconds: 0.34 },
  clap: { baseFrequency: 1_220, decay: 0.3, seed: 0x27d4eb2f, body: "noise", oneShotSeconds: 0.36 },
  rim: {
    baseFrequency: 1_700,
    decay: 0.05,
    seed: 0xc2b2ae35,
    body: "metallic",
    oneShotSeconds: 0.1,
  },
  "low-tom": {
    baseFrequency: 110,
    decay: 0.42,
    seed: 0x94d049bb,
    body: "tonal",
    oneShotSeconds: 0.45,
  },
  "high-tom": {
    baseFrequency: 176,
    decay: 0.34,
    seed: 0x6a09e667,
    body: "tonal",
    oneShotSeconds: 0.38,
  },
  "closed-hat": {
    baseFrequency: 7_000,
    decay: 0.05,
    seed: 0x165667b1,
    body: "metallic",
    oneShotSeconds: 0.1,
  },
  "open-hat": {
    baseFrequency: 6_400,
    decay: 0.5,
    seed: 0xd3a2646c,
    body: "metallic",
    oneShotSeconds: 0.52,
  },
  ride: {
    baseFrequency: 5_200,
    decay: 0.9,
    seed: 0xbb67ae85,
    body: "metallic",
    oneShotSeconds: 0.95,
  },
};

const DEFAULT_HYBRID_VOICE_PARAMETERS: Readonly<
  Record<HybridVoiceId, HybridVoiceParameters>
> = Object.freeze(
  Object.fromEntries(
    HYBRID_VOICE_IDS.map((id) => [
      id,
      Object.freeze({
        tune: 0,
        decay: VOICE_CHARACTER[id].decay,
        // Blended by default, which is this machine's whole identity.
        blend: 0.5,
        start: 0,
        attack: 0,
        level: 0.8,
        distortion: 0,
        pan:
          id === "low-tom"
            ? -0.28
            : id === "high-tom"
              ? 0.28
              : id === "ride"
                ? 0.34
                : id === "rim"
                  ? -0.2
                  : 0,
        mute: false,
        solo: false,
      }),
    ]),
  ) as Record<HybridVoiceId, HybridVoiceParameters>,
);

export const DEFAULT_HYBRID_PARAMETERS: HybridNineParameters = Object.freeze({
  level: 0.72,
  filter: 0.8,
  voices: DEFAULT_HYBRID_VOICE_PARAMETERS,
});

const CHOKE_GROUPS: readonly (readonly HybridVoiceId[])[] = [["closed-hat", "open-hat"]];

const CHOKE_RELEASE_SECONDS = 0.004;

/**
 * Renders one voice's one-shot layer once, at construction.
 *
 * This is the "sample" half of the hybrid: a fixed buffer that Start can index
 * into and Attack can soften, which a purely procedural voice cannot offer
 * because it has no stored past to seek within.
 */
function generateOneShot(character: VoiceCharacter, sampleRate: number): Float32Array {
  const length = Math.max(1, Math.round(character.oneShotSeconds * sampleRate));
  const buffer = new Float32Array(length);
  const noise = new DeterministicNoise(character.seed);
  const filter = new StateVariableFilter();
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const elapsed = index / sampleRate;
    const envelope = Math.exp(-elapsed / (character.decay * 0.7));
    let sample: number;

    switch (character.body) {
      case "tonal": {
        const sweep = Math.exp(-elapsed / 0.03);
        phase += (character.baseFrequency * (1 + sweep * 3.2)) / sampleRate;
        phase -= Math.floor(phase);
        sample = Math.sin(2 * Math.PI * phase) * 0.9 + noise.next() * sweep * 0.12;
        break;
      }
      case "noise": {
        filter.process(noise.next(), 1_500 + character.baseFrequency * 2, 1.1, sampleRate);
        phase += character.baseFrequency / sampleRate;
        phase -= Math.floor(phase);
        sample =
          filter.band * 0.9 + Math.sin(2 * Math.PI * phase) * 0.25 * Math.exp(-elapsed / 0.04);
        break;
      }
      case "metallic": {
        // Several inharmonic partials, which is what separates a cymbal-like
        // voice from filtered noise alone.
        const partials = [1, 1.41, 1.87, 2.34, 3.11];
        let tone = 0;
        for (const ratio of partials) {
          tone += Math.sin(2 * Math.PI * character.baseFrequency * ratio * elapsed);
        }
        filter.process(noise.next(), character.baseFrequency, 1.2, sampleRate);
        sample = (tone / partials.length) * 0.55 + filter.high * 0.5;
        break;
      }
    }

    buffer[index] = sample * envelope;
  }

  return buffer;
}

class HybridVoice {
  readonly id: HybridVoiceId;
  readonly #character: VoiceCharacter;
  readonly #sampleRate: number;
  readonly #sample: SampleBoundaryPlayer;
  readonly #noise: DeterministicNoise;
  readonly #noiseFilter = new StateVariableFilter();
  #parameters: HybridVoiceParameters;
  #phase = 0;
  /**
   * The manifest declares voice level and blend as smoothed fields. Both scale
   * the output directly, so a committed change on a ringing voice glides
   * instead of stepping in one sample.
   */
  readonly #level: ParameterGlide;
  readonly #blend: ParameterGlide;
  readonly #distortion: ParameterGlide;
  /** Linear choke: spec-004 section 21.5 mandates a linear 4 ms fade-out. */
  readonly #chokeStep: number;
  #amplitude = 0;
  #elapsed = 0;
  #velocity = 0;
  #accent = 0;
  #active = false;
  #choking = false;

  constructor(
    id: HybridVoiceId,
    sampleRate: number,
    parameters: HybridVoiceParameters,
    oneShot: Float32Array,
  ) {
    this.id = id;
    this.#character = VOICE_CHARACTER[id];
    this.#sampleRate = sampleRate;
    this.#parameters = parameters;
    this.#sample = new SampleBoundaryPlayer([oneShot], sampleRate);
    this.#noise = new DeterministicNoise(this.#character.seed);
    this.#level = new ParameterGlide(clamp(parameters.level, 0, 1), sampleRate);
    this.#blend = new ParameterGlide(clamp(parameters.blend, 0, 1), sampleRate);
    this.#distortion = new ParameterGlide(clamp(parameters.distortion, 0, 1), sampleRate);
    this.#chokeStep = 1 / Math.max(1, Math.round(CHOKE_RELEASE_SECONDS * sampleRate));
  }

  get active(): boolean {
    return this.#active;
  }

  setParameters(
    parameters: HybridVoiceParameters,
    mode: HybridParameterUpdateMode = "smooth",
  ): void {
    this.#parameters = parameters;
    if (mode === "immediate") {
      this.#level.set(clamp(parameters.level, 0, 1));
      this.#blend.set(clamp(parameters.blend, 0, 1));
      this.#distortion.set(clamp(parameters.distortion, 0, 1));
    }
  }

  trigger(velocity: number, accent: boolean): void {
    const restarting = this.#active;
    this.#noise.reset();
    this.#noiseFilter.reset();
    // A hit that starts from silence takes the committed values directly; the
    // glides exist to protect a ringing tail, not to lag a fresh attack.
    if (!restarting) {
      this.#level.set(clamp(this.#parameters.level, 0, 1));
      this.#blend.set(clamp(this.#parameters.blend, 0, 1));
      this.#distortion.set(clamp(this.#parameters.distortion, 0, 1));
    }
    this.#phase = 0;
    this.#elapsed = 0;
    // Start is normalized, so it stays meaningful whatever the buffer length.
    // Same-voice restarts omit the micro-fade under the approved restart rule.
    this.#sample.start({
      startFrame: clamp(this.#parameters.start, 0, 1) * (this.#sample.frameCount - 1),
      fadeIn: !restarting,
    });
    this.#velocity = clamp(velocity, 0, 1);
    this.#accent = accent ? 1 : 0;
    this.#amplitude = 1;
    this.#active = true;
    this.#choking = false;
  }

  choke(): void {
    if (this.#active) this.#choking = true;
  }

  silence(): void {
    this.#active = false;
    this.#choking = false;
    this.#amplitude = 0;
    this.#sample.stop();
    this.#noiseFilter.reset();
  }

  /** Returns the voice's mono sample for this frame. */
  render(): number {
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

    const ratio = semitoneRatio(this.#parameters.tune);
    const blend = this.#blend.advance(clamp(this.#parameters.blend, 0, 1));
    const synth = blend < 1 ? this.#renderSynthLayer(this.#character.baseFrequency * ratio) : 0;
    const oneShot = blend > 0 ? this.#renderOneShotLayer(ratio) : 0;

    // Equal-power crossfade, so a mid blend does not dip in level the way a
    // linear mix of two uncorrelated layers would.
    const angle = (blend * Math.PI) / 2;
    const mixed = synth * Math.cos(angle) + oneShot * Math.sin(angle);

    const attackSeconds = clamp(this.#parameters.attack, 0, 1) * 0.08;
    const attackGain =
      attackSeconds <= 0 ? 1 : Math.min(1, 1 - Math.exp(-this.#elapsed / (attackSeconds / 3)));
    const gain = this.#velocity * (1 + this.#accent * 0.45);

    this.#elapsed += 1 / this.#sampleRate;
    return mixed * attackGain * this.#amplitude * gain;
  }

  /** The outer machine applies this after the per-voice distortion. */
  advanceLevel(): number {
    return this.#level.advance(clamp(this.#parameters.level, 0, 1));
  }

  advanceDistortion(): number {
    return this.#distortion.advance(clamp(this.#parameters.distortion, 0, 1));
  }

  #renderSynthLayer(frequency: number): number {
    switch (this.#character.body) {
      case "tonal": {
        const sweep = Math.exp(-this.#elapsed / 0.028);
        this.#phase += (frequency * (1 + sweep * 3.4)) / this.#sampleRate;
        this.#phase -= Math.floor(this.#phase);
        return Math.sin(2 * Math.PI * this.#phase) * 0.95;
      }
      case "noise": {
        this.#noiseFilter.process(this.#noise.next(), frequency * 9, 1.1, this.#sampleRate);
        return this.#noiseFilter.band * 0.9;
      }
      case "metallic": {
        this.#noiseFilter.process(this.#noise.next(), frequency, 1.3, this.#sampleRate);
        return this.#noiseFilter.high * 0.8;
      }
    }
  }

  /**
   * Linear interpolation between neighbouring frames. Tune resamples the
   * buffer, so a tuned one-shot needs a fractional read rather than a
   * nearest-neighbour one, which would alias audibly on the metallic voices.
   */
  #renderOneShotLayer(ratio: number): number {
    this.#sample.render(ratio);
    return this.#sample.channel(0);
  }
}

export type HybridParameterUpdateMode = "immediate" | "smooth";

export class HybridNineDsp {
  readonly #sampleRate: number;
  readonly #voices: ReadonlyMap<HybridVoiceId, HybridVoice>;
  readonly #filterLeft = new OnePoleLowpass();
  readonly #filterRight = new OnePoleLowpass();
  /** Values the mix bus is currently rendering, which chase `#parameters`. */
  readonly #level: ParameterGlide;
  readonly #filter: ParameterGlide;
  readonly #voiceGates: VoiceMixGates;
  readonly #voicePans: Readonly<Record<HybridVoiceId, EqualPowerPan>>;
  /** Iterated by index in `process()`, so the per-frame loop allocates nothing. */
  readonly #voiceList: readonly HybridVoice[];
  #parameters: HybridNineParameters = DEFAULT_HYBRID_PARAMETERS;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    this.#sampleRate = sampleRate;
    this.#level = new ParameterGlide(DEFAULT_HYBRID_PARAMETERS.level, sampleRate);
    this.#filter = new ParameterGlide(DEFAULT_HYBRID_PARAMETERS.filter, sampleRate);
    this.#voiceGates = new VoiceMixGates(HYBRID_VOICE_IDS.length, sampleRate);
    this.#voicePans = Object.fromEntries(
      HYBRID_VOICE_IDS.map((id) => [
        id,
        new EqualPowerPan(DEFAULT_HYBRID_VOICE_PARAMETERS[id].pan, sampleRate),
      ]),
    ) as Record<HybridVoiceId, EqualPowerPan>;
    this.#voices = new Map(
      HYBRID_VOICE_IDS.map((id) => [
        id,
        new HybridVoice(
          id,
          sampleRate,
          DEFAULT_HYBRID_VOICE_PARAMETERS[id],
          generateOneShot(VOICE_CHARACTER[id], sampleRate),
        ),
      ]),
    );
    this.#voiceList = [...this.#voices.values()];
  }

  setParameters(
    update: VoiceParameterUpdate<HybridNineParameters>,
    mode: HybridParameterUpdateMode = "smooth",
  ): void {
    const voices = mergeVoiceParameters(this.#parameters.voices, update.voices);
    this.#parameters = Object.freeze({
      level: clamp(update.level ?? this.#parameters.level, 0, 1),
      filter: clamp(update.filter ?? this.#parameters.filter, 0, 1),
      voices,
    });
    // A snapshot is a state replacement, so it lands without a ramp. An
    // incremental change is a user moving a control, so it glides.
    if (mode === "immediate") {
      this.#level.set(this.#parameters.level);
      this.#filter.set(this.#parameters.filter);
      const soloActive = HYBRID_VOICE_IDS.some((id) => voices[id].solo);
      for (const [index, id] of HYBRID_VOICE_IDS.entries()) {
        this.#voiceGates.set(index, voices[id].mute, voices[id].solo, soloActive);
      }
    }
    for (const id of HYBRID_VOICE_IDS) {
      this.#voices.get(id)?.setParameters(voices[id], mode);
      // A smooth update leaves the pan where it is; the render loop glides it
      // toward the committed value the way every other smoothed field moves.
      if (mode === "immediate") this.#voicePans[id].set(voices[id].pan);
    }
  }

  getParameterSnapshot(): HybridNineParameters {
    return this.#parameters;
  }

  trigger(voiceId: HybridVoiceId, velocity = 1, accent = false): void {
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
    // Once per block, not per frame per voice: while any voice is soloed the
    // mix is exclusive, and mute wins over solo.
    let soloActive = false;
    for (const id of HYBRID_VOICE_IDS) {
      if (target.voices[id].solo) {
        soloActive = true;
        break;
      }
    }

    for (let index = Math.max(0, start); index < frameEnd; index += 1) {
      // Per frame, so a knob drag ramps rather than stepping between blocks.
      const level = this.#level.advance(target.level);
      const filter = this.#filter.advance(target.filter);
      const cutoff = 420 * (16_000 / 420) ** clamp(filter, 0, 1);

      let mixLeft = 0;
      let mixRight = 0;

      // A for-of loop allocates an iterator each frame inside the real-time
      // render loop, so the index form stays.
      for (let voiceIndex = 0; voiceIndex < this.#voiceList.length; voiceIndex += 1) {
        const voice = this.#voiceList[voiceIndex];
        if (voice === undefined) continue;
        const voiceParameters = target.voices[voice.id];
        // The gate and pan advance every frame even for an inactive voice, so
        // a change made while the voice is silent is already settled when it
        // next triggers.
        const gate = this.#voiceGates.advance(
          voiceIndex,
          voiceParameters.mute,
          voiceParameters.solo,
          soloActive,
        );
        const voicePan: EqualPowerPan = this.#voicePans[voice.id];
        voicePan.advance(voiceParameters.pan);
        if (!voice.active) continue;
        // Rendered even when gated, so envelopes and chokes keep their place
        // in time and un-muting mid-tail resumes where the voice really is.
        const source = voice.render();
        const sample = applyVoiceDistortion(source, voice.advanceDistortion()) * voice.advanceLevel();
        if (sample === 0 || gate === 0) continue;
        mixLeft += sample * gate * voicePan.left;
        mixRight += sample * gate * voicePan.right;
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
