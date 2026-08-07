import type { ParameterValue, PluginId } from "../../contracts/parameters";
import { isPlainRecord } from "../../contracts/validation";
import {
  createVoiceInsertProcessor,
  type VoiceInsertConfiguration,
  type VoiceInsertProcessor,
} from "./registry";

export type { VoiceInsertConfiguration } from "./registry";

interface ActiveVoiceInsert {
  readonly configuration: VoiceInsertConfiguration;
  readonly processor: VoiceInsertProcessor;
}

/**
 * One drum voice owns one host. Configuration arrives between render blocks;
 * `process` only reads prepared processors and never allocates. Insert changes
 * crossfade for the duration declared by the active effect manifest.
 */
export class VoiceInsertHost {
  readonly #sampleRate: number;
  #active: ActiveVoiceInsert | undefined;
  #transitionFrom: ActiveVoiceInsert | undefined;
  #transitionTo: ActiveVoiceInsert | undefined;
  #transitionFrame = 0;
  #transitionFrames = 0;
  #hasQueuedTransition = false;
  #queued: ActiveVoiceInsert | undefined;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("Voice insert sample rate must be a positive finite number.");
    }
    this.#sampleRate = sampleRate;
  }

  set(configuration: VoiceInsertConfiguration | null | undefined, voiceActive: boolean): boolean {
    const nextConfiguration = configuration ?? undefined;
    if (!voiceActive) {
      const next = createActiveVoiceInsert(nextConfiguration);
      if (nextConfiguration !== undefined && next === undefined) return false;
      this.#active = next;
      this.#transitionFrom = undefined;
      this.#transitionTo = undefined;
      this.#transitionFrame = 0;
      this.#transitionFrames = 0;
      this.#hasQueuedTransition = false;
      this.#queued = undefined;
      return true;
    }
    if (this.#transitionFrames > 0) {
      if (sameConfiguration(nextConfiguration, this.#transitionTo?.configuration)) {
        this.#hasQueuedTransition = false;
        this.#queued = undefined;
        return true;
      }
      if (
        this.#hasQueuedTransition &&
        sameConfiguration(nextConfiguration, this.#queued?.configuration)
      ) {
        return true;
      }
      const queued = createActiveVoiceInsert(nextConfiguration);
      if (nextConfiguration !== undefined && queued === undefined) return false;
      this.#queued = queued;
      this.#hasQueuedTransition = true;
      return true;
    }
    if (sameConfiguration(nextConfiguration, this.#active?.configuration)) return true;
    const next = createActiveVoiceInsert(nextConfiguration);
    if (nextConfiguration !== undefined && next === undefined) return false;
    this.#startTransition(next);
    return true;
  }

  process(input: number): number {
    if (this.#transitionFrames === 0) return this.#active?.processor.process(input) ?? input;
    const from = this.#transitionFrom?.processor.process(input) ?? input;
    const to = this.#transitionTo?.processor.process(input) ?? input;
    const blend = this.#transitionFrame / this.#transitionFrames;
    const output = from + (to - from) * blend;
    this.#transitionFrame += 1;
    if (this.#transitionFrame >= this.#transitionFrames) this.#completeTransition();
    return output;
  }

  #startTransition(next: ActiveVoiceInsert | undefined): void {
    const milliseconds = Math.max(
      this.#active?.processor.bypassTransitionMilliseconds ?? 0,
      next?.processor.bypassTransitionMilliseconds ?? 0,
    );
    const frames = Math.max(0, Math.round((this.#sampleRate * milliseconds) / 1_000));
    if (frames === 0) {
      this.#active = next;
      return;
    }
    this.#transitionFrom = this.#active;
    this.#transitionTo = next;
    this.#transitionFrame = 0;
    this.#transitionFrames = frames;
  }

  #completeTransition(): void {
    this.#active = this.#transitionTo;
    this.#transitionFrom = undefined;
    this.#transitionTo = undefined;
    this.#transitionFrame = 0;
    this.#transitionFrames = 0;
    if (!this.#hasQueuedTransition) return;
    const queued = this.#queued;
    this.#queued = undefined;
    this.#hasQueuedTransition = false;
    this.#startTransition(queued);
  }
}

function createActiveVoiceInsert(
  configuration: VoiceInsertConfiguration | undefined,
): ActiveVoiceInsert | undefined {
  if (configuration === undefined) return undefined;
  const processor = createVoiceInsertProcessor(configuration);
  return processor === undefined ? undefined : { configuration, processor };
}

function sameConfiguration(
  left: VoiceInsertConfiguration | undefined,
  right: VoiceInsertConfiguration | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  if (left.pluginId !== right.pluginId) return false;
  const keys = new Set([...Object.keys(left.state), ...Object.keys(right.state)]);
  return [...keys].every((key) => Object.is(left.state[key], right.state[key]));
}

export interface DecodedVoiceInsertConfiguration {
  readonly pluginId: PluginId;
  readonly state: Readonly<Record<string, ParameterValue>>;
}

function isParameterValue(value: unknown): value is ParameterValue {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/**
 * Decodes a bounded state-snapshot section. It deliberately does not decide
 * which plugin ID is valid. The registered effect factory owns that decision.
 */
export function decodeVoiceInsertConfigurations<TVoiceId extends string>(
  value: unknown,
  isVoiceId: (candidate: string) => candidate is TVoiceId,
): Readonly<Record<TVoiceId, DecodedVoiceInsertConfiguration | null>> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const result: Partial<Record<TVoiceId, DecodedVoiceInsertConfiguration | null>> = {};
  for (const [voiceId, rawConfiguration] of Object.entries(value)) {
    if (!isVoiceId(voiceId)) return undefined;
    if (rawConfiguration === null) {
      result[voiceId] = null;
      continue;
    }
    if (
      !isPlainRecord(rawConfiguration) ||
      typeof rawConfiguration.pluginId !== "string" ||
      !isPlainRecord(rawConfiguration.state) ||
      Object.values(rawConfiguration.state).some((entry) => !isParameterValue(entry))
    ) {
      return undefined;
    }
    result[voiceId] = {
      pluginId: rawConfiguration.pluginId as PluginId,
      state: rawConfiguration.state as Readonly<Record<string, ParameterValue>>,
    };
  }
  return result as Readonly<Record<TVoiceId, DecodedVoiceInsertConfiguration | null>>;
}
