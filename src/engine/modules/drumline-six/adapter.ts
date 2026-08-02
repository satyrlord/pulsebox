import type { ParameterValue } from "../../../contracts/parameters";
import type { VoiceAdapterFactory } from "../../transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../worklets/worklet-voice-adapter";
import workletUrl from "./drumline-six.worklet.ts?worker&url";

/**
 * Manifest parameter IDs already match the processor's own naming, so this is a
 * validating pass-through rather than a rename map: module fields stay flat and
 * per-voice fields keep their `<voice-id>-<field>` form.
 */
export function toDrumlineParameters(
  values: Readonly<Record<string, ParameterValue>>,
): Readonly<Record<string, ParameterValue>> {
  const result: Record<string, ParameterValue> = {};
  for (const [parameterId, value] of Object.entries(values)) {
    if (
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean"
    ) {
      result[parameterId] = value;
    }
  }
  return result;
}

const DESCRIPTOR: WorkletVoiceDescriptor = {
  processorName: "pulsebox-drumline-six",
  moduleUrl: workletUrl,
  displayName: "Tin Soldier",
  mapParameters: toDrumlineParameters,
};

class DrumlineSixAdapter extends WorkletVoiceAdapter {
  constructor(context: AudioContext, options: Parameters<VoiceAdapterFactory>[1]) {
    super(DESCRIPTOR, context, options);
  }
}

/** Registry entry point: one adapter instance per rack module. */
export const createDrumlineVoiceAdapter: VoiceAdapterFactory = (context, options) =>
  new DrumlineSixAdapter(context, options);
