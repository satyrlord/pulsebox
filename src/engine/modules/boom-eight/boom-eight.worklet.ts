import type {} from "../../worklets/audio-worklet-globals";

import {
  decodeVoiceParameterChanges,
  decodeVoiceParameterObject,
} from "../../dsp/voice-parameter-routing";
import { WorkletVoiceProcessor } from "../../worklets/worklet-voice-processor";
import { BoomEightDsp, type BoomEightParameters, type BoomVoiceParameters } from "./dsp-core";
import { BOOM_VOICE_IDS, boomVoiceForNote, type BoomVoiceId } from "./voices";

type PartialVoice = Partial<BoomVoiceParameters>;
type PartialParameters = Partial<Omit<BoomEightParameters, "voices">> & {
  voices?: Partial<Record<BoomVoiceId, PartialVoice>>;
};

function isBoomVoiceId(value: string): value is BoomVoiceId {
  return (BOOM_VOICE_IDS as readonly string[]).includes(value);
}

const SHAPE = {
  moduleFields: new Set(["level", "compression", "tone"]),
  voiceFields: new Set<string>(["tune", "punch", "decay", "level", "pan"]),
  booleanVoiceFields: new Set<string>(["mute", "solo"]),
  isVoiceId: isBoomVoiceId,
} as const;

class BoomEightProcessor extends WorkletVoiceProcessor<PartialParameters> {
  protected readonly displayName = "Soft Thunder";
  readonly #dsp = new BoomEightDsp(sampleRate);

  protected decodeParameterObject(value: unknown): PartialParameters | undefined {
    return decodeVoiceParameterObject<BoomVoiceId, BoomVoiceParameters>(value, SHAPE);
  }

  protected decodeParameterChanges(value: unknown): PartialParameters | undefined {
    return decodeVoiceParameterChanges<BoomVoiceId, BoomVoiceParameters>(value, SHAPE);
  }

  protected applyParameters(parameters: PartialParameters, immediate: boolean): void {
    const current = this.#dsp.getParameterSnapshot();
    const voices = { ...current.voices };
    for (const [voiceId, update] of Object.entries(parameters.voices ?? {})) {
      if (!isBoomVoiceId(voiceId)) continue;
      voices[voiceId] = { ...voices[voiceId], ...update };
    }
    this.#dsp.setParameters(
      {
        ...(parameters.level === undefined ? {} : { level: parameters.level }),
        ...(parameters.compression === undefined ? {} : { compression: parameters.compression }),
        ...(parameters.tone === undefined ? {} : { tone: parameters.tone }),
        voices,
      },
      // A whole-state snapshot lands instantly; an incremental change during a
      // knob drag ramps, so the audible mix-bus controls cannot step or click.
      immediate ? "immediate" : "smooth",
    );
  }

  protected triggerNoteOn(note: number, velocity: number, accent: boolean): void {
    const voiceId = boomVoiceForNote(note);
    if (voiceId === undefined) return;
    this.#dsp.trigger(voiceId, velocity, accent);
  }

  /**
   * Percussion voices are one-shots: their own envelopes end them, so a note-off
   * is not a gate release. Only an explicit reset silences them early.
   */
  protected triggerNoteOff(): void {
    // Intentionally empty.
  }

  protected resetDsp(): void {
    this.#dsp.reset();
  }

  protected renderBlock(
    left: Float32Array,
    right: Float32Array | undefined,
    start: number,
    end: number,
  ): void {
    this.#dsp.process(left, right, start, end);
  }
}

registerProcessor("pulsebox-boom-eight", BoomEightProcessor);
