import type { StateRevision } from "../../contracts/ids";
import type { ParameterValue, PluginId } from "../../contracts/parameters";
import type { ScheduledParameterChange, ScheduledVoiceEvent } from "./scheduled-event";

export interface VoiceFault {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: string;
}

export type VoiceAdapterStatus =
  | { readonly state: "recovering"; readonly fault: VoiceFault }
  | { readonly state: "recovered" }
  | { readonly state: "faulted"; readonly fault: VoiceFault };

export interface VoiceAdapterOptions {
  readonly nodeId?: string;
  readonly projectRevision: StateRevision;
  readonly handshakeTimeoutMilliseconds?: number;
  readonly onStatus?: (status: VoiceAdapterStatus) => void;
  /** Peak level of the voice's own output, 0 to 1, at the protocol frame rate. */
  readonly onMeter?: (level: number) => void;
}

/**
 * Runtime projection of one saved voice-insert instance. The durable instance
 * ID stays in state. Worklets only need the registered plugin and its state.
 */
export interface VoiceInsertRuntime {
  readonly pluginId: PluginId;
  readonly state: Readonly<Record<string, ParameterValue>>;
}

/**
 * The only surface the transport uses to drive a voice. Every method is
 * fire-and-forget except `prepare`, so nothing on the scheduling path awaits.
 *
 * Parameters are keyed by manifest parameter ID. Each adapter owns the
 * translation to whatever its processor expects, which keeps plugin-specific
 * names out of the transport.
 */
export interface VoiceAdapterPort {
  prepare(): Promise<void>;
  activate(destination: AudioNode): void;
  setProjectRevision(projectRevision: StateRevision): void;
  replaceState(
    parameters: Readonly<Record<string, ParameterValue>>,
    projectRevision: StateRevision,
    voiceInserts?: Readonly<Record<string, VoiceInsertRuntime | null>>,
  ): void;
  setParameters(
    parameters: Readonly<Record<string, ParameterValue>>,
    projectRevision: StateRevision,
  ): void;
  /** Transient value during a gesture. Never enters project state or history. */
  previewParameters(parameters: Readonly<Record<string, ParameterValue>>): void;
  /** Sample-accurate Pattern automation on the shared audio-frame timeline. */
  scheduleParameters(changes: readonly ScheduledParameterChange[]): void;
  schedule(events: readonly ScheduledVoiceEvent[]): void;
  /**
   * Drops queued events. With `fromFrame`, only events at or past that
   * absolute frame drop; everything before it keeps playing from the queue.
   */
  clearScheduledEvents(fromFrame?: number): void;
  resume(): void;
  suspend(): void;
  dispose(): void;
}

export type VoiceAdapterFactory = (
  context: AudioContext,
  options: VoiceAdapterOptions,
) => VoiceAdapterPort;
