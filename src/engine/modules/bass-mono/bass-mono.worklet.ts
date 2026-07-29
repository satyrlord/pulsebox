import type {} from "../../worklets/audio-worklet-globals";

import { isPlainRecord } from "../../../contracts/validation";
import { WorkletVoiceProcessor } from "../../worklets/worklet-voice-processor";
import { AcidBassDsp, type BassParameters } from "./dsp-core";

class AcidBassProcessor extends WorkletVoiceProcessor<Partial<BassParameters>> {
  protected readonly displayName = "Acid Bass";
  readonly #dsp = new AcidBassDsp(sampleRate);

  protected decodeParameterObject(value: unknown): Partial<BassParameters> | undefined {
    if (!isPlainRecord(value)) return undefined;
    const parameters: Partial<BassParameters> = {};
    for (const [parameterId, parameterValue] of Object.entries(value)) {
      if (!setParameter(parameters, parameterId, parameterValue)) return undefined;
    }
    return parameters;
  }

  protected decodeParameterChanges(value: unknown): Partial<BassParameters> | undefined {
    if (!Array.isArray(value)) return undefined;
    const parameters: Partial<BassParameters> = {};
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

  protected applyParameters(parameters: Partial<BassParameters>, immediate: boolean): void {
    this.#dsp.setParameters(parameters, immediate ? "immediate" : "smooth");
  }

  protected triggerNoteOn(note: number, velocity: number, accent: boolean, slide: boolean): void {
    this.#dsp.noteOn(note, velocity, accent, slide);
  }

  protected triggerNoteOff(): void {
    this.#dsp.noteOff();
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

function setParameter(
  target: Partial<BassParameters>,
  parameterId: string,
  value: unknown,
): boolean {
  if (parameterId === "waveform") {
    if (value !== "saw" && value !== "square") return false;
    (target as { waveform?: BassParameters["waveform"] }).waveform = value;
    return true;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  switch (parameterId) {
    case "tune":
    case "cutoff":
    case "resonance":
    case "envelopeAmount":
    case "decay":
    case "accentAmount":
    case "glide":
    case "volume":
      (target as Record<string, number>)[parameterId] = value;
      return true;
    default:
      return false;
  }
}

registerProcessor("pulsebox-bass-mono", AcidBassProcessor);
