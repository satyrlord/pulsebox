import type {} from "../../worklets/audio-worklet-globals";

import { isPlainRecord } from "../../../contracts/validation";
import { WorkletVoiceProcessor } from "../../worklets/worklet-voice-processor";
import { DrumlineSixDsp, type DrumVoiceParameters, type DrumlineSixParameters } from "./dsp-core";
import { DRUM_VOICE_IDS, drumVoiceForNote, type DrumVoiceId } from "./voices";

type PartialVoice = Partial<DrumVoiceParameters>;
type PartialParameters = Partial<Omit<DrumlineSixParameters, "voices">> & {
  voices?: Partial<Record<DrumVoiceId, PartialVoice>>;
};

const MODULE_FIELDS = new Set(["level", "drive", "tone"]);
const VOICE_FIELDS = new Set<keyof DrumVoiceParameters>(["tune", "snap", "decay", "level", "pan"]);

function isDrumVoiceId(value: string): value is DrumVoiceId {
  return (DRUM_VOICE_IDS as readonly string[]).includes(value);
}

export class DrumlineSixProcessor extends WorkletVoiceProcessor<PartialParameters> {
  protected readonly displayName = "Drumline Six";
  readonly #dsp = new DrumlineSixDsp(sampleRate);

  protected decodeParameterObject(value: unknown): PartialParameters | undefined {
    if (!isPlainRecord(value)) return undefined;
    const parameters: PartialParameters = {};
    for (const [parameterId, parameterValue] of Object.entries(value)) {
      if (!setParameter(parameters, parameterId, parameterValue)) return undefined;
    }
    return parameters;
  }

  protected decodeParameterChanges(value: unknown): PartialParameters | undefined {
    if (!Array.isArray(value)) return undefined;
    const parameters: PartialParameters = {};
    for (const change of value) {
      if (
        !isPlainRecord(change) ||
        typeof change.parameterId !== "string" ||
        !setParameter(parameters, change.parameterId, change.value)
      ) {
        return undefined;
      }
    }
    return parameters;
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

/**
 * Per-voice parameters arrive as `<voice-id>-<field>`, which keeps the flat
 * project parameter record and the nested DSP shape in sync without either side
 * learning the other's layout. Field names are single words, so the last hyphen
 * is always the separator even for `open-hat`.
 */
function setParameter(target: PartialParameters, parameterId: string, value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;

  if (MODULE_FIELDS.has(parameterId)) {
    (target as Record<string, number>)[parameterId] = value;
    return true;
  }

  const separator = parameterId.lastIndexOf("-");
  if (separator <= 0) return false;
  const voiceId = parameterId.slice(0, separator);
  const field = parameterId.slice(separator + 1);
  if (!isDrumVoiceId(voiceId) || !VOICE_FIELDS.has(field as keyof DrumVoiceParameters)) {
    return false;
  }

  const voices = target.voices ?? {};
  voices[voiceId] = { ...voices[voiceId], [field]: value };
  target.voices = voices;
  return true;
}

registerProcessor("pulsebox-drumline-six", DrumlineSixProcessor);
