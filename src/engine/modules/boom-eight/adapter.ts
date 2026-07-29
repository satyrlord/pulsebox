import type { ParameterValue, VoiceAdapterFactory } from "../../transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../worklets/worklet-voice-adapter";
import workletUrl from "./boom-eight.worklet.ts?worker&url";

/**
 * Manifest parameter IDs already match the processor's own naming, so this is a
 * validating pass-through rather than a rename map: module fields stay flat and
 * per-voice fields keep their `<voice-id>-<field>` form.
 */
export function toBoomParameters(
  values: Readonly<Record<string, ParameterValue>>,
): Readonly<Record<string, ParameterValue>> {
  const result: Record<string, number> = {};
  for (const [parameterId, value] of Object.entries(values)) {
    if (typeof value === "number" && Number.isFinite(value)) result[parameterId] = value;
  }
  return result;
}

const DESCRIPTOR: WorkletVoiceDescriptor = {
  processorName: "pulsebox-boom-eight",
  moduleUrl: workletUrl,
  displayName: "Boom Eight",
  mapParameters: toBoomParameters,
};

export class BoomEightAdapter extends WorkletVoiceAdapter {
  constructor(context: AudioContext, options: Parameters<VoiceAdapterFactory>[1]) {
    super(DESCRIPTOR, context, options);
  }
}

/** Registry entry point: one adapter instance per rack module. */
export const createBoomVoiceAdapter: VoiceAdapterFactory = (context, options) =>
  new BoomEightAdapter(context, options);
