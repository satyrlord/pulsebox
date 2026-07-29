import type { StateRevision } from "../../contracts/ids";
import type { ParameterValue } from "../../contracts/parameters";
import type { ScheduledVoiceEvent } from "./scheduled-event";

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
  ): void;
  setParameters(
    parameters: Readonly<Record<string, ParameterValue>>,
    projectRevision: StateRevision,
  ): void;
  /** Transient value during a gesture. Never enters project state or history. */
  previewParameters(parameters: Readonly<Record<string, ParameterValue>>): void;
  schedule(events: readonly ScheduledVoiceEvent[]): void;
  clearScheduledEvents(): void;
  resume(): void;
  suspend(): void;
  dispose(): void;
}

export type VoiceAdapterFactory = (
  context: AudioContext,
  options: VoiceAdapterOptions,
) => VoiceAdapterPort;
