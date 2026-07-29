/**
 * Shared parameter routing for the drum machines.
 *
 * Every drum module addresses its voices the same way: flat module fields such
 * as `level`, and per-voice fields as `<voice-id>-<field>`. That keeps the flat
 * project parameter record and the nested DSP shape in sync without either side
 * learning the other's layout, and it is identical across the machines, so the
 * decoding lives here rather than being restated in each worklet.
 *
 * This module is pure computation. It is imported by worklet processors, so it
 * must stay free of DOM and AudioNode handles.
 */

import { isPlainRecord } from "../../contracts/validation";

export interface VoiceParameterShape<TVoiceId extends string, TVoiceFields> {
  readonly moduleFields: ReadonlySet<string>;
  /**
   * Module fields carrying a boolean rather than a number, such as a lo-fi
   * enable. Listed separately so a numeric field can never accept a boolean.
   */
  readonly booleanModuleFields?: ReadonlySet<string>;
  readonly voiceFields: ReadonlySet<string>;
  readonly isVoiceId: (value: string) => value is TVoiceId;
  readonly voices?: Partial<Record<TVoiceId, Partial<TVoiceFields>>>;
}

export type DecodedParameters<TVoiceId extends string, TVoiceFields> = Record<string, unknown> & {
  voices?: Partial<Record<TVoiceId, Partial<TVoiceFields>>>;
};

/**
 * Applies one `parameterId`/`value` pair to the accumulating parameter object.
 *
 * Returns false for anything unrecognized so the caller can fault the whole
 * message rather than silently applying a partial update. Field names are
 * single words, so the last hyphen is always the separator even for a
 * multi-word voice ID such as `open-hat`.
 */
function applyVoiceParameter<TVoiceId extends string, TVoiceFields>(
  target: DecodedParameters<TVoiceId, TVoiceFields>,
  parameterId: string,
  value: unknown,
  shape: Omit<VoiceParameterShape<TVoiceId, TVoiceFields>, "voices">,
): boolean {
  if (shape.booleanModuleFields?.has(parameterId) === true) {
    if (typeof value !== "boolean") return false;
    target[parameterId] = value;
    return true;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) return false;

  if (shape.moduleFields.has(parameterId)) {
    target[parameterId] = value;
    return true;
  }

  const separator = parameterId.lastIndexOf("-");
  if (separator <= 0) return false;
  const voiceId = parameterId.slice(0, separator);
  const field = parameterId.slice(separator + 1);
  if (!shape.isVoiceId(voiceId) || !shape.voiceFields.has(field)) return false;

  const voices: Partial<Record<TVoiceId, Partial<TVoiceFields>>> = target.voices ?? {};
  voices[voiceId] = { ...voices[voiceId], [field]: value } as Partial<TVoiceFields>;
  target.voices = voices;
  return true;
}

/** Decodes a whole-state parameter object, or returns undefined to fault. */
export function decodeVoiceParameterObject<TVoiceId extends string, TVoiceFields>(
  value: unknown,
  shape: Omit<VoiceParameterShape<TVoiceId, TVoiceFields>, "voices">,
): DecodedParameters<TVoiceId, TVoiceFields> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const parameters: DecodedParameters<TVoiceId, TVoiceFields> = {};
  for (const [parameterId, parameterValue] of Object.entries(value)) {
    if (!applyVoiceParameter(parameters, parameterId, parameterValue, shape)) return undefined;
  }
  return parameters;
}

/** Decodes an incremental change list, or returns undefined to fault. */
export function decodeVoiceParameterChanges<TVoiceId extends string, TVoiceFields>(
  value: unknown,
  shape: Omit<VoiceParameterShape<TVoiceId, TVoiceFields>, "voices">,
): DecodedParameters<TVoiceId, TVoiceFields> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parameters: DecodedParameters<TVoiceId, TVoiceFields> = {};
  for (const change of value) {
    if (
      !isPlainRecord(change) ||
      typeof change.parameterId !== "string" ||
      !applyVoiceParameter(parameters, change.parameterId, change.value, shape)
    ) {
      return undefined;
    }
  }
  return parameters;
}
