import type {} from "../../worklets/audio-worklet-globals";

import {
  decodeVoiceParameterChanges,
  decodeVoiceParameterObject,
} from "../../dsp/voice-parameter-routing";
import { WorkletVoiceProcessor } from "../../worklets/worklet-voice-processor";
import {
  DigitSevenDsp,
  type DigitSevenParameters,
  type DigitSevenVoiceParameters,
} from "./dsp-core";
import { DIGIT_SEVEN_VOICE_IDS, digitSevenVoiceForNote, type DigitSevenVoiceId } from "./voices";

type PartialVoice = Partial<DigitSevenVoiceParameters>;
type PartialParameters = Partial<Omit<DigitSevenParameters, "voices">> & {
  voices?: Partial<Record<DigitSevenVoiceId, PartialVoice>>;
};

function isDigitSevenVoiceId(value: string): value is DigitSevenVoiceId {
  return (DIGIT_SEVEN_VOICE_IDS as readonly string[]).includes(value);
}

const SHAPE = {
  moduleFields: new Set(["level", "compression", "bits", "rate"]),
  booleanModuleFields: new Set(["lofi-enabled"]),
  voiceFields: new Set<string>(["tune", "decay", "level", "pan"]),
  isVoiceId: isDigitSevenVoiceId,
} as const;

/** The manifest uses a hyphenated ID; the DSP shape uses a camel-case field. */
function toDspParameters(
  decoded: Record<string, unknown> | undefined,
): PartialParameters | undefined {
  if (decoded === undefined) return undefined;
  const { "lofi-enabled": lofi, ...rest } = decoded;
  return {
    ...(rest as PartialParameters),
    ...(typeof lofi === "boolean" ? { lofiEnabled: lofi } : {}),
  };
}

export class DigitSevenProcessor extends WorkletVoiceProcessor<PartialParameters> {
  protected readonly displayName = "Digit Seven";
  readonly #dsp = new DigitSevenDsp(sampleRate);

  protected decodeParameterObject(value: unknown): PartialParameters | undefined {
    return toDspParameters(
      decodeVoiceParameterObject<DigitSevenVoiceId, DigitSevenVoiceParameters>(value, SHAPE),
    );
  }

  protected decodeParameterChanges(value: unknown): PartialParameters | undefined {
    return toDspParameters(
      decodeVoiceParameterChanges<DigitSevenVoiceId, DigitSevenVoiceParameters>(value, SHAPE),
    );
  }

  protected applyParameters(parameters: PartialParameters, immediate: boolean): void {
    const current = this.#dsp.getParameterSnapshot();
    const voices = { ...current.voices };
    for (const [voiceId, update] of Object.entries(parameters.voices ?? {})) {
      if (!isDigitSevenVoiceId(voiceId)) continue;
      voices[voiceId] = { ...voices[voiceId], ...update };
    }
    this.#dsp.setParameters(
      {
        ...(parameters.level === undefined ? {} : { level: parameters.level }),
        ...(parameters.compression === undefined ? {} : { compression: parameters.compression }),
        ...(parameters.bits === undefined ? {} : { bits: parameters.bits }),
        ...(parameters.rate === undefined ? {} : { rate: parameters.rate }),
        ...(parameters.lofiEnabled === undefined ? {} : { lofiEnabled: parameters.lofiEnabled }),
        voices,
      },
      // A whole-state snapshot lands instantly; an incremental change during a
      // knob drag ramps, so the audible mix-bus controls cannot step or click.
      immediate ? "immediate" : "smooth",
    );
  }

  protected triggerNoteOn(note: number, velocity: number, accent: boolean): void {
    const voiceId = digitSevenVoiceForNote(note);
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

registerProcessor("pulsebox-digit-seven", DigitSevenProcessor);
