import type { ParameterValue } from "../../../contracts/parameters";
import type { VoiceAdapterFactory } from "../../transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../worklets/worklet-voice-adapter";
import workletUrl from "./hybrid-nine.worklet.ts?worker&url";

/**
 * Manifest parameter IDs already match the processor's own naming, so this is a
 * validating pass-through rather than a rename map: module fields stay flat and
 * per-voice fields keep their `<voice-id>-<field>` form.
 */
function toHybridParameters(
  values: Readonly<Record<string, ParameterValue>>,
): Readonly<Record<string, ParameterValue>> {
  const result: Record<string, number> = {};
  for (const [parameterId, value] of Object.entries(values)) {
    if (typeof value === "number" && Number.isFinite(value)) result[parameterId] = value;
  }
  return result;
}

const DESCRIPTOR: WorkletVoiceDescriptor = {
  processorName: "pulsebox-hybrid-nine",
  moduleUrl: workletUrl,
  displayName: "Hybrid Nine",
  mapParameters: toHybridParameters,
};

class HybridNineAdapter extends WorkletVoiceAdapter {
  constructor(context: AudioContext, options: Parameters<VoiceAdapterFactory>[1]) {
    super(DESCRIPTOR, context, options);
  }
}

/** Registry entry point: one adapter instance per rack module. */
export const createHybridVoiceAdapter: VoiceAdapterFactory = (context, options) =>
  new HybridNineAdapter(context, options);
