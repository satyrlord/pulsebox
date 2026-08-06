/**
 * Tin Soldier: six independent synthesized drum voices.
 *
 * Every voice is generated, never sampled, so the module ships no audio assets.
 * The public surface is deliberately narrow — construct, set parameters, trigger
 * by voice, render a block — which is the same seam a sample-backed layer would
 * plug into later without the transport or the adapter changing.
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
  semitoneRatio,
  softClip,
  StateVariableFilter,
  VoiceMixGates,
} from "../../dsp/primitives";
import { VoiceInsertHost, type VoiceInsertConfiguration } from "../../effects";
import { DRUM_VOICE_IDS, type DrumVoiceId } from "./voices";

export { DRUM_VOICE_IDS, type DrumVoiceId };

export interface DrumVoiceParameters {
  /** Semitone offset applied to the voice's base frequency. */
  readonly tune: number;
  /** Attack emphasis: transient click and noise bite. */
  readonly snap: number;
  readonly decay: number;
  readonly level: number;
  /** -1 hard left to 1 hard right. */
  readonly pan: number;
  /** A muted voice keeps rendering but contributes silence to the mix. */
  readonly mute: boolean;
  /** While any voice is soloed, only soloed voices reach the mix. */
  readonly solo: boolean;
}

export interface DrumlineSixParameters {
  readonly level: number;
  readonly drive: number;
  /** Mix-bus lowpass: 0 is dark, 1 is fully open. */
  readonly tone: number;
  readonly voices: Readonly<Record<DrumVoiceId, DrumVoiceParameters>>;
}

interface VoiceCharacter {
  readonly baseFrequency: number;
  readonly decay: number;
  readonly snap: number;
  readonly seed: number;
}

/**
 * Original voicing targets. These are starting points chosen for musical
 * balance, not measurements of any existing instrument.
 */
const VOICE_CHARACTER: Readonly<Record<DrumVoiceId, VoiceCharacter>> = {
  kick: { baseFrequency: 52, decay: 0.42, snap: 0.35, seed: 0x9e3779b9 },
  snare: { baseFrequency: 186, decay: 0.22, snap: 0.55, seed: 0x85ebca6b },
  rim: { baseFrequency: 1_720, decay: 0.06, snap: 0.7, seed: 0xc2b2ae35 },
  clap: { baseFrequency: 1_180, decay: 0.24, snap: 0.5, seed: 0x27d4eb2f },
  "closed-hat": { baseFrequency: 6_400, decay: 0.055, snap: 0.6, seed: 0x165667b1 },
  "open-hat": { baseFrequency: 6_100, decay: 0.48, snap: 0.45, seed: 0xd3a2646c },
};

const DEFAULT_DRUM_VOICE_PARAMETERS: Readonly<Record<DrumVoiceId, DrumVoiceParameters>> =
  Object.freeze(
    Object.fromEntries(
      DRUM_VOICE_IDS.map((id) => [
        id,
        Object.freeze({
          tune: 0,
          snap: VOICE_CHARACTER[id].snap,
          decay: VOICE_CHARACTER[id].decay,
          level: 0.8,
          pan: id === "rim" ? 0.22 : id === "clap" ? -0.18 : 0,
          mute: false,
          solo: false,
        }),
      ]),
    ) as Record<DrumVoiceId, DrumVoiceParameters>,
  );

export const DEFAULT_DRUMLINE_PARAMETERS: DrumlineSixParameters = Object.freeze({
  level: 0.72,
  drive: 0.18,
  tone: 0.78,
  voices: DEFAULT_DRUM_VOICE_PARAMETERS,
});

/**
 * The closed hat silences the open hat, the way one physical pair of hats can
 * only make one sound at a time.
 */
const CHOKE_GROUPS: readonly (readonly DrumVoiceId[])[] = [["closed-hat", "open-hat"]];

const CHOKE_RELEASE_SECONDS = 0.004;

class DrumVoice {
  readonly id: DrumVoiceId;
  readonly #character: VoiceCharacter;
  readonly #sampleRate: number;
  readonly #noise: DeterministicNoise;
  readonly #noiseFilter = new StateVariableFilter();
  /**
   * The manifest declares voice level as a smoothed field, so a committed
   * change on a ringing voice glides instead of stepping in one sample.
   */
  readonly #level: ParameterGlide;
  /** Linear choke: spec-004 section 21.5 mandates a linear 4 ms fade-out. */
  readonly #chokeStep: number;
  #parameters: DrumVoiceParameters;
  #phase = 0;
  #amplitude = 0;
  #elapsed = 0;
  #velocity = 0;
  #accent = 0;
  #active = false;
  #choking = false;

  constructor(id: DrumVoiceId, sampleRate: number, parameters: DrumVoiceParameters) {
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

  setParameters(
    parameters: DrumVoiceParameters,
    mode: DrumlineParameterUpdateMode = "smooth",
  ): void {
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

    const decaySeconds = clamp(this.#parameters.decay, 0.01, 2);
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

    const snap = clamp(this.#parameters.snap, 0, 1);
    const frequency = this.#character.baseFrequency * semitoneRatio(this.#parameters.tune);
    const gain = this.#velocity * (1 + this.#accent * 0.45);
    const sample = this.#renderVoice(frequency, snap, decaySeconds);

    this.#elapsed += 1 / this.#sampleRate;
    return sample * this.#amplitude * gain;
  }

  /**
   * Voice level belongs after the insert. This keeps an insert's response
   * independent from its output gain, before the voice reaches pan and mix.
   */
  advanceLevel(): number {
    return this.#level.advance(clamp(this.#parameters.level, 0, 1));
  }

  #renderVoice(frequency: number, snap: number, decaySeconds: number): number {
    switch (this.id) {
      case "kick":
        return this.#renderKick(frequency, snap);
      case "snare":
        return this.#renderSnare(frequency, snap);
      case "rim":
        return this.#renderRim(frequency, snap);
      case "clap":
        return this.#renderClap(frequency, snap, decaySeconds);
      case "closed-hat":
      case "open-hat":
        return this.#renderHat(frequency, snap);
    }
  }

  #advancePhase(frequency: number): number {
    this.#phase += frequency / this.#sampleRate;
    this.#phase -= Math.floor(this.#phase);
    return Math.sin(2 * Math.PI * this.#phase);
  }

  /** Sine body with a fast downward pitch sweep, plus a snap-scaled click. */
  #renderKick(frequency: number, snap: number): number {
    const sweep = Math.exp(-this.#elapsed / (0.018 + (1 - snap) * 0.03));
    const body = this.#advancePhase(frequency * (1 + sweep * 5.5));
    const click = this.#noise.next() * Math.exp(-this.#elapsed / 0.0016) * snap * 0.55;
    return body * 0.92 + click;
  }

  /** Tuned two-partial body against a bandpassed noise layer. */
  #renderSnare(frequency: number, snap: number): number {
    const body =
      this.#advancePhase(frequency) * 0.6 + Math.sin(2 * Math.PI * this.#phase * 1.78) * 0.4;
    this.#noiseFilter.process(this.#noise.next(), 1_900 + snap * 2_600, 1.1, this.#sampleRate);
    const rattle = this.#noiseFilter.band * (0.55 + snap * 0.5);
    const bodyDecay = Math.exp(-this.#elapsed / 0.045);
    return body * bodyDecay * (1 - snap * 0.35) + rattle;
  }

  /** Very short bandpassed burst with a high ping on top. */
  #renderRim(frequency: number, snap: number): number {
    this.#noiseFilter.process(
      this.#noise.next(),
      frequency,
      0.35 + (1 - snap) * 0.5,
      this.#sampleRate,
    );
    const ping = this.#advancePhase(frequency * 1.42) * Math.exp(-this.#elapsed / 0.008);
    return this.#noiseFilter.band * 0.85 + ping * 0.5;
  }

  /**
   * Three closely spaced noise bursts followed by a longer tail, which is what
   * gives a hand clap its characteristic stutter.
   */
  #renderClap(frequency: number, snap: number, decaySeconds: number): number {
    const burstSpacing = 0.0092 + (1 - snap) * 0.006;
    const burstIndex = Math.floor(this.#elapsed / burstSpacing);
    const inBurst = burstIndex < 3;
    const burstPhase = this.#elapsed - burstIndex * burstSpacing;
    const envelope = inBurst
      ? Math.exp(-burstPhase / 0.0028)
      : Math.exp(-(this.#elapsed - 3 * burstSpacing) / (decaySeconds * 0.55));
    this.#noiseFilter.process(this.#noise.next(), frequency, 0.9, this.#sampleRate);
    return this.#noiseFilter.band * envelope * 1.15;
  }

  /** Highpassed noise. Closed and open differ only by decay and choke group. */
  #renderHat(frequency: number, snap: number): number {
    this.#noiseFilter.process(this.#noise.next(), frequency, 1.4 - snap * 0.7, this.#sampleRate);
    return this.#noiseFilter.high * (0.5 + snap * 0.4);
  }
}

export type DrumlineParameterUpdateMode = "immediate" | "smooth";

export class DrumlineSixDsp {
  readonly #sampleRate: number;
  readonly #voices: ReadonlyMap<DrumVoiceId, DrumVoice>;
  readonly #toneLeft = new OnePoleLowpass();
  readonly #toneRight = new OnePoleLowpass();
  /** Values the mix bus is currently rendering, which chase `#parameters`. */
  readonly #level: ParameterGlide;
  readonly #drive: ParameterGlide;
  readonly #tone: ParameterGlide;
  readonly #voiceGates: VoiceMixGates;
  readonly #voicePans: Readonly<Record<DrumVoiceId, EqualPowerPan>>;
  readonly #voiceInserts: Readonly<Record<DrumVoiceId, VoiceInsertHost>>;
  /** Iterated by index in `process()`, so the per-frame loop allocates nothing. */
  readonly #voiceList: readonly DrumVoice[];
  #parameters: DrumlineSixParameters = DEFAULT_DRUMLINE_PARAMETERS;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    this.#sampleRate = sampleRate;
    this.#level = new ParameterGlide(DEFAULT_DRUMLINE_PARAMETERS.level, sampleRate);
    this.#drive = new ParameterGlide(DEFAULT_DRUMLINE_PARAMETERS.drive, sampleRate);
    this.#tone = new ParameterGlide(DEFAULT_DRUMLINE_PARAMETERS.tone, sampleRate);
    this.#voiceGates = new VoiceMixGates(DRUM_VOICE_IDS.length, sampleRate);
    this.#voicePans = Object.fromEntries(
      DRUM_VOICE_IDS.map((id) => [
        id,
        new EqualPowerPan(DEFAULT_DRUM_VOICE_PARAMETERS[id].pan, sampleRate),
      ]),
    ) as Record<DrumVoiceId, EqualPowerPan>;
    this.#voiceInserts = Object.fromEntries(
      DRUM_VOICE_IDS.map((id) => [id, new VoiceInsertHost(sampleRate)]),
    ) as Record<DrumVoiceId, VoiceInsertHost>;
    this.#voices = new Map(
      DRUM_VOICE_IDS.map((id) => [
        id,
        new DrumVoice(id, sampleRate, DEFAULT_DRUM_VOICE_PARAMETERS[id]),
      ]),
    );
    this.#voiceList = [...this.#voices.values()];
  }

  setParameters(
    update: VoiceParameterUpdate<DrumlineSixParameters>,
    mode: DrumlineParameterUpdateMode = "smooth",
  ): void {
    const voices = mergeVoiceParameters(this.#parameters.voices, update.voices);
    this.#parameters = Object.freeze({
      level: clamp(update.level ?? this.#parameters.level, 0, 1),
      drive: clamp(update.drive ?? this.#parameters.drive, 0, 1),
      tone: clamp(update.tone ?? this.#parameters.tone, 0, 1),
      voices,
    });
    // A snapshot is a state replacement, so it lands without a ramp. An
    // incremental change is a user moving a control, so it glides.
    if (mode === "immediate") {
      this.#level.set(this.#parameters.level);
      this.#drive.set(this.#parameters.drive);
      this.#tone.set(this.#parameters.tone);
      const soloActive = DRUM_VOICE_IDS.some((id) => voices[id].solo);
      for (const [index, id] of DRUM_VOICE_IDS.entries()) {
        this.#voiceGates.set(index, voices[id].mute, voices[id].solo, soloActive);
      }
    }
    for (const id of DRUM_VOICE_IDS) {
      this.#voices.get(id)?.setParameters(voices[id], mode);
      // A smooth update leaves the pan where it is; the render loop glides it
      // toward the committed value the way every other smoothed field moves.
      if (mode === "immediate") this.#voicePans[id].set(voices[id].pan);
    }
  }

  getParameterSnapshot(): DrumlineSixParameters {
    return this.#parameters;
  }

  setVoiceInserts(
    configurations: Readonly<Partial<Record<DrumVoiceId, VoiceInsertConfiguration | null>>>,
  ): boolean {
    let accepted = true;
    for (const voiceId of DRUM_VOICE_IDS) {
      const host = this.#voiceInserts[voiceId];
      accepted = host.set(configurations[voiceId], this.#voices.get(voiceId)?.active === true) && accepted;
    }
    return accepted;
  }

  trigger(voiceId: DrumVoiceId, velocity = 1, accent = false): void {
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
  }

  process(left: Float32Array, right?: Float32Array, start = 0, end = left.length): void {
    const frameEnd = Math.min(left.length, end);
    const target = this.#parameters;
    // Once per block, not per frame per voice: while any voice is soloed the
    // mix is exclusive, and mute wins over solo.
    let soloActive = false;
    for (const id of DRUM_VOICE_IDS) {
      if (target.voices[id].solo) {
        soloActive = true;
        break;
      }
    }

    for (let index = Math.max(0, start); index < frameEnd; index += 1) {
      // Per frame, so a knob drag ramps rather than stepping between blocks.
      const level = this.#level.advance(target.level);
      const drive = this.#drive.advance(target.drive);
      const tone = this.#tone.advance(target.tone);
      const toneCutoff = 480 * (16_000 / 480) ** clamp(tone, 0, 1);
      const driveAmount = 1 + drive * 7;

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
        const sample = this.#voiceInserts[voice.id].process(source) * voice.advanceLevel();
        if (sample === 0 || gate === 0) continue;
        mixLeft += sample * gate * voicePan.left;
        mixRight += sample * gate * voicePan.right;
      }

      const tonedLeft = this.#toneLeft.process(
        softClip(mixLeft * driveAmount) * level,
        toneCutoff,
        this.#sampleRate,
      );
      const tonedRight = this.#toneRight.process(
        softClip(mixRight * driveAmount) * level,
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
