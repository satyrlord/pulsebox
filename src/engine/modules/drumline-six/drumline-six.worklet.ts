import type {} from "../../worklets/audio-worklet-globals";

import {
  decodeVoiceParameterChanges,
  decodeVoiceParameterObject,
} from "../../dsp/voice-parameter-routing";
import { WorkletVoiceProcessor } from "../../worklets/worklet-voice-processor";
import { DrumlineSixDsp, type DrumVoiceParameters, type DrumlineSixParameters } from "./dsp-core";
import { DRUM_VOICE_IDS, drumVoiceForNote, type DrumVoiceId } from "./voices";

type PartialVoice = Partial<DrumVoiceParameters>;
type PartialParameters = Partial<Omit<DrumlineSixParameters, "voices">> & {
  voices?: Partial<Record<DrumVoiceId, PartialVoice>>;
};

function isDrumVoiceId(value: string): value is DrumVoiceId {
  return (DRUM_VOICE_IDS as readonly string[]).includes(value);
}

const SHAPE = {
  moduleFields: new Set(["level", "drive", "tone"]),
  voiceFields: new Set<string>(["tune", "snap", "decay", "level", "pan"]),
  booleanVoiceFields: new Set<string>(["mute", "solo"]),
  isVoiceId: isDrumVoiceId,
} as const;

class DrumlineSixProcessor extends WorkletVoiceProcessor<PartialParameters> {
  protected readonly displayName = "Tin Soldier";
  readonly #dsp = new DrumlineSixDsp(sampleRate);

  protected decodeParameterObject(value: unknown): PartialParameters | undefined {
    return decodeVoiceParameterObject<DrumVoiceId, DrumVoiceParameters>(value, SHAPE);
  }

  protected decodeParameterChanges(value: unknown): PartialParameters | undefined {
    return decodeVoiceParameterChanges<DrumVoiceId, DrumVoiceParameters>(value, SHAPE);
  }

  protected applyParameters(parameters: PartialParameters, immediate: boolean): void {
    const current = this.#dsp.getParameterSnapshot();
    const voices = { ...current.voices };
    for (const [voiceId, update] of Object.entries(parameters.voices ?? {})) {
      if (!isDrumVoiceId(voiceId)) continue;
      voices[voiceId] = { ...voices[voiceId], ...update };
    }
    this.#dsp.setParameters(
      {
        ...(parameters.level === undefined ? {} : { level: parameters.level }),
        ...(parameters.drive === undefined ? {} : { drive: parameters.drive }),
        ...(parameters.tone === undefined ? {} : { tone: parameters.tone }),
        voices,
      },
      // A whole-state snapshot lands instantly; an incremental change during a
      // knob drag ramps, so the audible mix-bus controls cannot step or click.
      immediate ? "immediate" : "smooth",
    );
  }

  protected triggerNoteOn(note: number, velocity: number, accent: boolean): void {
    const voiceId = drumVoiceForNote(note);
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

registerProcessor("pulsebox-drumline-six", DrumlineSixProcessor);
