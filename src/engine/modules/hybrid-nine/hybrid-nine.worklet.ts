import type {} from "../../worklets/audio-worklet-globals";

import {
  decodeVoiceParameterChanges,
  decodeVoiceParameterObject,
} from "../../dsp/voice-parameter-routing";
import { WorkletVoiceProcessor } from "../../worklets/worklet-voice-processor";
import { HybridNineDsp, type HybridNineParameters, type HybridVoiceParameters } from "./dsp-core";
import { HYBRID_VOICE_IDS, hybridVoiceForNote, type HybridVoiceId } from "./voices";

type PartialVoice = Partial<HybridVoiceParameters>;
type PartialParameters = Partial<Omit<HybridNineParameters, "voices">> & {
  voices?: Partial<Record<HybridVoiceId, PartialVoice>>;
};

function isHybridVoiceId(value: string): value is HybridVoiceId {
  return (HYBRID_VOICE_IDS as readonly string[]).includes(value);
}

const SHAPE = {
  moduleFields: new Set(["level", "filter"]),
  voiceFields: new Set<string>(["tune", "decay", "blend", "start", "attack", "distortion", "level", "pan"]),
  booleanVoiceFields: new Set<string>(["mute", "solo"]),
  isVoiceId: isHybridVoiceId,
} as const;

class HybridNineProcessor extends WorkletVoiceProcessor<PartialParameters> {
  protected readonly displayName = "Twin Engine";
  readonly #dsp = new HybridNineDsp(sampleRate);

  protected decodeParameterObject(value: unknown): PartialParameters | undefined {
    return decodeVoiceParameterObject<HybridVoiceId, HybridVoiceParameters>(value, SHAPE);
  }

  protected decodeParameterChanges(value: unknown): PartialParameters | undefined {
    return decodeVoiceParameterChanges<HybridVoiceId, HybridVoiceParameters>(value, SHAPE);
  }

  protected applyParameters(parameters: PartialParameters, immediate: boolean): void {
    const current = this.#dsp.getParameterSnapshot();
    const voices = { ...current.voices };
    for (const [voiceId, update] of Object.entries(parameters.voices ?? {})) {
      if (!isHybridVoiceId(voiceId)) continue;
      voices[voiceId] = { ...voices[voiceId], ...update };
    }
    this.#dsp.setParameters(
      {
        ...(parameters.level === undefined ? {} : { level: parameters.level }),
        ...(parameters.filter === undefined ? {} : { filter: parameters.filter }),
        voices,
      },
      // A whole-state snapshot lands instantly; an incremental change during a
      // knob drag ramps, so the audible mix-bus controls cannot step or click.
      immediate ? "immediate" : "smooth",
    );
  }

  protected triggerNoteOn(note: number, velocity: number, accent: boolean): void {
    const voiceId = hybridVoiceForNote(note);
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

registerProcessor("pulsebox-hybrid-nine", HybridNineProcessor);
