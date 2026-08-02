import type { ParameterValue } from "../../../contracts/parameters";
import type { VoiceAdapterFactory } from "../../transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../worklets/worklet-voice-adapter";
import workletUrl from "./digit-five.worklet.ts?worker&url";

/**
 * Manifest parameter IDs already match the processor's own naming, so this is a
 * validating pass-through rather than a rename map. Booleans survive the filter
 * alongside finite numbers, because the lo-fi enable is a boolean control.
 */
function toDigitFiveParameters(
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
  displayName: "Dusty Mosaic",
  mapParameters: toDigitFiveParameters,
};

class DigitFiveAdapter extends WorkletVoiceAdapter {
  constructor(context: AudioContext, options: Parameters<VoiceAdapterFactory>[1]) {
    super(DESCRIPTOR, context, options);
  }
}

/** Registry entry point: one adapter instance per rack module. */
export const createDigitFiveVoiceAdapter: VoiceAdapterFactory = (context, options) =>
  new DigitFiveAdapter(context, options);
