/**
 * Soft Thunder: eight independent synthesized drum voices with a compressed
 * mix bus.
 *
 * The large analog-style machine trades Tin Soldier's Snap-and-Drive
 * character for Punch and Compression: a per-voice transient shaper feeding a
 * bus compressor, which is what lets the kick and sub-kick sit together without
 * either disappearing. Every voice is generated, never sampled, so the module
 * ships no audio assets.
 *
 * Determinism: noise comes from a per-voice xorshift seeded at construction and
 * re-seeded on every trigger, so the same pattern and parameters always render
 * the same samples. Nothing here reads a clock or a global.
 */

import {
  clamp,
  DeterministicNoise,
  EqualPowerPan,
  mergeVoiceParameters,
  type VoiceParameterUpdate,
  OnePoleLowpass,
  ParameterGlide,
  PeakCompressor,
  semitoneRatio,
  softClip,
  StateVariableFilter,
  VoiceMixGates,
} from "../../dsp/primitives";
import { BOOM_VOICE_IDS, type BoomVoiceId } from "./voices";

export interface BoomVoiceParameters {
  /** Semitone offset applied to the voice's base frequency. */
  readonly tune: number;
  /** Transient emphasis: attack click and pitch-sweep depth. */
  readonly punch: number;
  readonly decay: number;
  readonly level: number;
  /** -1 hard left to 1 hard right. */
  readonly pan: number;
  /** A muted voice keeps rendering but contributes silence to the mix. */
  readonly mute: boolean;
  /** While any voice is soloed, only soloed voices reach the mix. */
  readonly solo: boolean;
}

export interface BoomEightParameters {
  readonly level: number;
  /** Bus compression depth. 0 leaves the mix untouched. */
  readonly compression: number;
  /** Mix-bus lowpass: 0 is dark, 1 is fully open. */
  readonly tone: number;
  readonly voices: Readonly<Record<BoomVoiceId, BoomVoiceParameters>>;
}

interface VoiceCharacter {
  readonly baseFrequency: number;
  readonly decay: number;
  readonly punch: number;
  readonly seed: number;
}

/**
 * Original voicing targets. These are starting points chosen for musical
 * balance, not measurements of any existing instrument.
 */
const VOICE_CHARACTER: Readonly<Record<BoomVoiceId, VoiceCharacter>> = {
  kick: { baseFrequency: 48, decay: 0.58, punch: 0.42, seed: 0x9e3779b9 },
  "sub-kick": { baseFrequency: 33, decay: 0.86, punch: 0.2, seed: 0x7f4a7c15 },
  snare: { baseFrequency: 174, decay: 0.28, punch: 0.58, seed: 0x85ebca6b },
  rim: { baseFrequency: 1_640, decay: 0.05, punch: 0.72, seed: 0xc2b2ae35 },
  "low-tom": { baseFrequency: 104, decay: 0.46, punch: 0.38, seed: 0x27d4eb2f },
  "high-tom": { baseFrequency: 168, decay: 0.36, punch: 0.4, seed: 0x94d049bb },
  "closed-hat": { baseFrequency: 6_800, decay: 0.05, punch: 0.62, seed: 0x165667b1 },
  "open-hat": { baseFrequency: 6_300, decay: 0.54, punch: 0.44, seed: 0xd3a2646c },
};

const DEFAULT_BOOM_VOICE_PARAMETERS: Readonly<Record<BoomVoiceId, BoomVoiceParameters>> =
  Object.freeze(
    Object.fromEntries(
      BOOM_VOICE_IDS.map((id) => [
        id,
        Object.freeze({
          tune: 0,
          punch: VOICE_CHARACTER[id].punch,
          decay: VOICE_CHARACTER[id].decay,
          level: id === "sub-kick" ? 0.7 : 0.8,
          // Toms and rim spread across the field; the low end stays centred so
          // the kick pair keeps its weight in mono.
          pan: id === "low-tom" ? -0.3 : id === "high-tom" ? 0.3 : id === "rim" ? 0.24 : 0,
          mute: false,
          solo: false,
        }),
      ]),
    ) as Record<BoomVoiceId, BoomVoiceParameters>,
  );

export const DEFAULT_BOOM_PARAMETERS: BoomEightParameters = Object.freeze({
  level: 0.7,
  compression: 0.34,
  tone: 0.74,
  voices: DEFAULT_BOOM_VOICE_PARAMETERS,
});

/**
 * The closed hat silences the open hat, the way one physical pair of hats can
 * only make one sound at a time. The two kicks share a group for the same
 * reason a single beater cannot strike twice at once.
 */
const CHOKE_GROUPS: readonly (readonly BoomVoiceId[])[] = [
  ["closed-hat", "open-hat"],
  ["kick", "sub-kick"],
];

const CHOKE_RELEASE_SECONDS = 0.005;

class BoomVoice {
  readonly id: BoomVoiceId;
  readonly #character: VoiceCharacter;
  readonly #sampleRate: number;
  readonly #noise: DeterministicNoise;
  readonly #noiseFilter = new StateVariableFilter();
  /**
   * The manifest declares voice level as a smoothed field, so a committed
   * change on a ringing voice glides instead of stepping in one sample.
   */
  readonly #level: ParameterGlide;
  /** Linear choke over the declared release, never a hard cut. */
  readonly #chokeStep: number;
  #parameters: BoomVoiceParameters;
  #phase = 0;
  #amplitude = 0;
  #elapsed = 0;
  #velocity = 0;
  #accent = 0;
  #active = false;
  #choking = false;

  constructor(id: BoomVoiceId, sampleRate: number, parameters: BoomVoiceParameters) {
    this.id = id;
    this.#character = VOICE_CHARACTER[id];
    this.#sampleRate = sampleRate;
    this.#parameters = parameters;
    this.#noise = new DeterministicNoise(this.#character.seed);
    this.#level = new ParameterGlide(clamp(parameters.level, 0, 1), sampleRate);
    this.#chokeStep = 1 / Math.max(1, Math.round(CHOKE_RELEASE_SECONDS * sampleRate));
  }

  get active(): boolean {
    return this.#active;
  }

  setParameters(parameters: BoomVoiceParameters, mode: BoomParameterUpdateMode = "smooth"): void {
    this.#parameters = parameters;
    if (mode === "immediate") this.#level.set(clamp(parameters.level, 0, 1));
  }

  trigger(velocity: number, accent: boolean): void {
    this.#noise.reset();
    this.#noiseFilter.reset();
    // A hit that starts from silence takes the committed level directly; the
    // glide exists to protect a ringing tail, not to lag a fresh attack.
    if (!this.#active) this.#level.set(clamp(this.#parameters.level, 0, 1));
    this.#phase = 0;
    this.#elapsed = 0;
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

    const punch = clamp(this.#parameters.punch, 0, 1);
    const frequency = this.#character.baseFrequency * semitoneRatio(this.#parameters.tune);
    const gain = this.#velocity * (1 + this.#accent * 0.45);
    const sample = this.#renderVoice(frequency, punch, decaySeconds);

    this.#elapsed += 1 / this.#sampleRate;
    return sample * this.#amplitude * gain * this.#level.advance(clamp(this.#parameters.level, 0, 1));
  }

  #renderVoice(frequency: number, punch: number, decaySeconds: number): number {
    switch (this.id) {
      case "kick":
        return this.#renderKick(frequency, punch);
      case "sub-kick":
        return this.#renderSubKick(frequency, punch);
      case "snare":
        return this.#renderSnare(frequency, punch);
      case "rim":
        return this.#renderRim(frequency, punch);
      case "low-tom":
      case "high-tom":
        return this.#renderTom(frequency, punch, decaySeconds);
      case "closed-hat":
      case "open-hat":
        return this.#renderHat(frequency, punch);
    }
  }

  #advancePhase(frequency: number): number {
    this.#phase += frequency / this.#sampleRate;
    this.#phase -= Math.floor(this.#phase);
    return Math.sin(2 * Math.PI * this.#phase);
  }

  /**
   * Deeper sweep and a harder click than the small machine's kick. Punch drives
   * both, so one control moves the voice from round to aggressive.
   */
  #renderKick(frequency: number, punch: number): number {
    const sweep = Math.exp(-this.#elapsed / (0.022 + (1 - punch) * 0.04));
    const body = this.#advancePhase(frequency * (1 + sweep * (4 + punch * 4)));
    const click = this.#noise.next() * Math.exp(-this.#elapsed / 0.0018) * punch * 0.6;
    return body * 0.94 + click;
  }

  /**
   * Nearly pure low sine with a slow sweep. It carries weight below the main
   * kick rather than restating its attack, so it stays almost click-free.
   */
  #renderSubKick(frequency: number, punch: number): number {
    const sweep = Math.exp(-this.#elapsed / (0.05 + (1 - punch) * 0.06));
    const body = this.#advancePhase(frequency * (1 + sweep * 1.6));
    return body * (0.95 + punch * 0.05);
  }

  /** Tuned two-partial body against a bandpassed noise layer. */
  #renderSnare(frequency: number, punch: number): number {
    const body =
      this.#advancePhase(frequency) * 0.58 + Math.sin(2 * Math.PI * this.#phase * 1.72) * 0.42;
    this.#noiseFilter.process(this.#noise.next(), 1_750 + punch * 2_900, 1.05, this.#sampleRate);
    const rattle = this.#noiseFilter.band * (0.58 + punch * 0.52);
    const bodyDecay = Math.exp(-this.#elapsed / 0.05);
    return body * bodyDecay * (1 - punch * 0.32) + rattle;
  }

  /** Very short bandpassed burst with a high ping on top. */
  #renderRim(frequency: number, punch: number): number {
    this.#noiseFilter.process(
      this.#noise.next(),
      frequency,
      0.32 + (1 - punch) * 0.5,
      this.#sampleRate,
    );
    const ping = this.#advancePhase(frequency * 1.38) * Math.exp(-this.#elapsed / 0.0075);
    return this.#noiseFilter.band * 0.82 + ping * 0.55;
  }

  /**
   * Sine body with a shallow sweep and a little noise in the attack. The two
   * toms differ only by base frequency, so tuning them apart keeps them
   * recognisably one pair.
   */
  #renderTom(frequency: number, punch: number, decaySeconds: number): number {
    const sweep = Math.exp(-this.#elapsed / (0.03 + (1 - punch) * 0.05));
    const body = this.#advancePhase(frequency * (1 + sweep * 0.85));
    this.#noiseFilter.process(this.#noise.next(), frequency * 6, 1.3, this.#sampleRate);
    const attack = this.#noiseFilter.band * Math.exp(-this.#elapsed / 0.006) * punch * 0.45;
    const bodyDecay = Math.exp(-this.#elapsed / (decaySeconds * 0.9));
    return body * bodyDecay * 0.95 + attack;
  }

  /** Highpassed noise. Closed and open differ only by decay and choke group. */
  #renderHat(frequency: number, punch: number): number {
    this.#noiseFilter.process(this.#noise.next(), frequency, 1.35 - punch * 0.7, this.#sampleRate);
    return this.#noiseFilter.high * (0.52 + punch * 0.4);
  }
}

export type BoomParameterUpdateMode = "immediate" | "smooth";

export class BoomEightDsp {
  readonly #sampleRate: number;
  readonly #voices: ReadonlyMap<BoomVoiceId, BoomVoice>;
  readonly #toneLeft = new OnePoleLowpass();
  readonly #toneRight = new OnePoleLowpass();
  readonly #compressorLeft = new PeakCompressor();
  readonly #compressorRight = new PeakCompressor();
  /** Values the mix bus is currently rendering, which chase `#parameters`. */
  readonly #level: ParameterGlide;
  readonly #compression: ParameterGlide;
  readonly #tone: ParameterGlide;
  readonly #voiceGates: VoiceMixGates;
  readonly #voicePans: Readonly<Record<BoomVoiceId, EqualPowerPan>>;
  /** Iterated by index in `process()`, so the per-frame loop allocates nothing. */
  readonly #voiceList: readonly BoomVoice[];
  #parameters: BoomEightParameters = DEFAULT_BOOM_PARAMETERS;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    this.#sampleRate = sampleRate;
    this.#level = new ParameterGlide(DEFAULT_BOOM_PARAMETERS.level, sampleRate);
    this.#compression = new ParameterGlide(DEFAULT_BOOM_PARAMETERS.compression, sampleRate);
    this.#tone = new ParameterGlide(DEFAULT_BOOM_PARAMETERS.tone, sampleRate);
    this.#voiceGates = new VoiceMixGates(BOOM_VOICE_IDS.length, sampleRate);
    this.#voicePans = Object.fromEntries(
      BOOM_VOICE_IDS.map((id) => [
        id,
        new EqualPowerPan(DEFAULT_BOOM_VOICE_PARAMETERS[id].pan, sampleRate),
      ]),
    ) as Record<BoomVoiceId, EqualPowerPan>;
    this.#voices = new Map(
      BOOM_VOICE_IDS.map((id) => [
        id,
        new BoomVoice(id, sampleRate, DEFAULT_BOOM_VOICE_PARAMETERS[id]),
      ]),
    );
    this.#voiceList = [...this.#voices.values()];
  }

  setParameters(
    update: VoiceParameterUpdate<BoomEightParameters>,
    mode: BoomParameterUpdateMode = "smooth",
  ): void {
    const voices = mergeVoiceParameters(this.#parameters.voices, update.voices);
    this.#parameters = Object.freeze({
      level: clamp(update.level ?? this.#parameters.level, 0, 1),
      compression: clamp(update.compression ?? this.#parameters.compression, 0, 1),
      tone: clamp(update.tone ?? this.#parameters.tone, 0, 1),
      voices,
    });
    // A snapshot is a state replacement, so it lands without a ramp. An
    // incremental change is a user moving a control, so it glides.
    if (mode === "immediate") {
      this.#level.set(this.#parameters.level);
      this.#compression.set(this.#parameters.compression);
      this.#tone.set(this.#parameters.tone);
      const soloActive = BOOM_VOICE_IDS.some((id) => voices[id].solo);
      for (const [index, id] of BOOM_VOICE_IDS.entries()) {
        this.#voiceGates.set(index, voices[id].mute, voices[id].solo, soloActive);
      }
    }
    for (const id of BOOM_VOICE_IDS) {
      this.#voices.get(id)?.setParameters(voices[id], mode);
      // A smooth update leaves the pan where it is; the render loop glides it
      // toward the committed value the way every other smoothed field moves.
      if (mode === "immediate") this.#voicePans[id].set(voices[id].pan);
    }
  }

  getParameterSnapshot(): BoomEightParameters {
    return this.#parameters;
  }

  trigger(voiceId: BoomVoiceId, velocity = 1, accent = false): void {
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
    // Once per block, not per frame per voice: while any voice is soloed the
    // mix is exclusive, and mute wins over solo.
    let soloActive = false;
    for (const id of BOOM_VOICE_IDS) {
      if (target.voices[id].solo) {
        soloActive = true;
        break;
      }
    }

    for (let index = Math.max(0, start); index < frameEnd; index += 1) {
      // Per frame, so a knob drag ramps rather than stepping between blocks.
      const level = this.#level.advance(target.level);
      const compression = this.#compression.advance(target.compression);
      const tone = this.#tone.advance(target.tone);
      const toneCutoff = 460 * (16_000 / 460) ** clamp(tone, 0, 1);

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
        const sample = voice.render();
        if (sample === 0 || gate === 0) continue;
        mixLeft += sample * gate * voicePan.left;
        mixRight += sample * gate * voicePan.right;
      }

      // Compression before the tone tilt, so the filter smooths whatever
      // artefacts hard gain reduction introduces rather than feeding them out.
      const compressedLeft = this.#compressorLeft.process(mixLeft, compression, this.#sampleRate);
      const compressedRight = this.#compressorRight.process(
        mixRight,
        compression,
        this.#sampleRate,
      );

      const tonedLeft = this.#toneLeft.process(
        softClip(compressedLeft) * level,
        toneCutoff,
        this.#sampleRate,
      );
      const tonedRight = this.#toneRight.process(
        softClip(compressedRight) * level,
        toneCutoff,
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
