import type { ParameterValue, VoiceAdapterFactory } from "../../transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../worklets/worklet-voice-adapter";
import workletUrl from "./digit-five.worklet.ts?worker&url";

/**
 * Manifest parameter IDs already match the processor's own naming, so this is a
 * validating pass-through rather than a rename map. Unlike the analog machines
 * this module has a boolean control, the lo-fi enable, so booleans survive the
 * filter alongside finite numbers.
 */
export function toDigitFiveParameters(
  values: Readonly<Record<string, ParameterValue>>,
): Readonly<Record<string, ParameterValue>> {
  const result: Record<string, ParameterValue> = {};
  for (const [parameterId, value] of Object.entries(values)) {
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      result[parameterId] = value;
    }
  }
  return result;
}

const DESCRIPTOR: WorkletVoiceDescriptor = {
  processorName: "pulsebox-digit-five",
  moduleUrl: workletUrl,
  displayName: "Digit Five",
  mapParameters: toDigitFiveParameters,
};

export class DigitFiveAdapter extends WorkletVoiceAdapter {
  constructor(context: AudioContext, options: Parameters<VoiceAdapterFactory>[1]) {
    super(DESCRIPTOR, context, options);
  }
}

/** Registry entry point: one adapter instance per rack module. */
export const createDigitFiveVoiceAdapter: VoiceAdapterFactory = (context, options) =>
  new DigitFiveAdapter(context, options);
