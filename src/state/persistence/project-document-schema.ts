import {
  RACK_SLOT_IDS,
  type ProjectRevision,
} from "../../contracts/ids";
import type { ParameterDescriptor, ParameterValue } from "../../contracts/parameters";
import type { ValidationIssue } from "../../contracts/validation";
import { MAXIMUM_PATTERN_COUNT } from "../default-state";
import type { AutomationLaneState, PatternEvent, PatternScale } from "../model";

/**
 * The on-disk project document, per `docs/PROJECT-FORMAT.md` section 5.
 *
 * Only implemented data carries values. The other root fields stay present so
 * the validator can reject unknown root keys.
 */

export const PROJECT_FORMAT = "pulsebox-project";
export const PROJECT_FORMAT_VERSION = 3;

/** Guards a hostile or corrupt file before any of it is trusted. */
export const DOCUMENT_LIMITS = {
  /** PROJECT-FORMAT.md section 4.3: the project manifest is at most 8 MiB. */
  maximumBytes: 8 * 1024 * 1024,
  maximumRackSlots: RACK_SLOT_IDS.length,
  maximumPatternSteps: 64,
  maximumPatterns: MAXIMUM_PATTERN_COUNT,
  maximumEventRecords: 1_000_000,
  maximumSongRepeats: 64,
} as const;

export interface ProjectMetadataDocument {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly lineageId: string;
  readonly revisionEpoch: string;
  readonly revision: number;
  /**
   * Persisted favorite flag. The MVP has no control that sets it, so it is
   * always false. The post-MVP Favourite feature owns the interface for it.
   */
  readonly favorite: boolean;
  readonly tempo: number;
  /**
   * Global Swing, 0 through 100 percent, per decision D69. One value applies to
   * every Pattern in the MVP. Absent in format 1 documents written before it.
   */
  readonly swing?: number;
}

export interface PluginRequirementDocument {
  readonly pluginId: string;
  readonly kind: "instrument" | "effect";
  readonly pluginVersion: string;
  readonly apiVersion: 1;
  readonly stateSchemaVersion: number;
}

export interface PatternDocument {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly durationBars: number;
  readonly scale: PatternScale;
  readonly humanize: number;
  readonly seed: number;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly automationLaneIds: readonly string[];
  readonly parts: readonly PatternPartDocument[];
}

export interface PatternPartDocument {
  readonly moduleId: string;
  readonly length: number;
  readonly voiceCycleLengths: Readonly<Record<string, number>>;
  readonly events: readonly PatternEvent[];
  readonly automationLaneIds: readonly string[];
}

export interface RackSlotDocument {
  readonly id: string;
  readonly moduleId?: string;
  readonly pluginId?: string;
  readonly parameters?: Readonly<Record<string, ParameterValue>>;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly level?: number;
  readonly pan?: number;
  readonly sends?: readonly MixerSendDocument[];
}

export interface SongPlacementDocument {
  readonly id: string;
  readonly patternId: string;
  readonly repeatCount: number;
}

export interface SongDocument {
  readonly enabled: boolean;
  readonly playlist: readonly SongPlacementDocument[];
}

export interface AutomationStepDocument {
  readonly tick: number;
  readonly value: ParameterValue;
}

export interface AutomationLaneDocument {
  readonly id: string;
  readonly scope: AutomationLaneState["scope"];
  readonly targetId: string;
  readonly parameterId: string;
  readonly patternId: string;
  readonly stepTicks: number;
  readonly steps: readonly AutomationStepDocument[];
}

export interface MixerSendDocument {
  readonly busId: string;
  readonly amount: number;
}

export interface MixerChannelDocument {
  readonly slotId: string;
  readonly moduleId: string | null;
  readonly level: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly sends: readonly MixerSendDocument[];
  /** The module ID keys its ordered module effect chain, or null for an empty slot. */
  readonly moduleChainId: string | null;
}

export interface MixerSendDefinitionDocument {
  readonly busId: string;
}

export interface MixerDocument {
  readonly channels: readonly MixerChannelDocument[];
  readonly sends: readonly MixerSendDefinitionDocument[];
  readonly master: { readonly level: number };
}

export interface EffectInstanceDocument {
  readonly id: string;
  readonly pluginId: string;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
  readonly bypassed: boolean;
  readonly mix: number;
  readonly gainDecibels: number;
}

export interface ModuleChainDocument {
  readonly moduleId: string;
  readonly slots: readonly (string | null)[];
  /** Absent only in early format-3 documents. */
  readonly bypassed?: boolean;
}

export interface SendChainDocument {
  readonly busId: string;
  readonly slots: readonly (string | null)[];
  readonly returnLevel: number;
  readonly bypassed: boolean;
  readonly pinnedEffectId: string | null;
}

export interface MasterChainDocument {
  readonly slots: readonly (string | null)[];
}

export interface EffectsDocument {
  readonly instances: readonly EffectInstanceDocument[];
  readonly moduleChains: readonly ModuleChainDocument[];
  readonly sendChains: readonly SendChainDocument[];
  /** Absent only in early format-3 documents. */
  readonly sendEffectsBypassed?: boolean;
  readonly masterChain: MasterChainDocument;
  readonly masterEffectsBypassed: boolean;
}

export interface MigrationRecord {
  readonly scope: "project" | "plugin";
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly implementation: string;
}

export interface ProjectDocument {
  readonly format: typeof PROJECT_FORMAT;
  readonly formatVersion: number;
  readonly project: ProjectMetadataDocument;
  readonly plugins: readonly PluginRequirementDocument[];
  readonly rack: readonly RackSlotDocument[];
  readonly patterns: readonly PatternDocument[];
  readonly song: SongDocument;
  readonly activePatternId: string;
  readonly automation: readonly AutomationLaneDocument[];
  readonly mixer: MixerDocument;
  readonly effects: EffectsDocument;
  readonly assets: readonly unknown[];
  readonly migrations: readonly MigrationRecord[];
}


export type DocumentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function failure(path: string, message: string): DocumentResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

export interface SerializeOptions {
  readonly createdAt: string;
  readonly modifiedAt: string;
  /** Last committed token, never the runtime StateRevision. */
  readonly projectRevision: ProjectRevision;
  readonly manifestVersionFor?: (pluginId: string) => number;
  /** Installed plugin identity contracts from the composition registry. */
  readonly pluginMetadataByPluginId?: Readonly<Record<string, ImportPluginMetadata>>;
}


export interface ParseOptions {
  /** Instrument plugin IDs that the running build can place in a rack slot. */
  readonly knownPluginIds: readonly string[];
  /** Data-only parameter contracts copied from each registered plugin manifest. */
  readonly parameterDescriptorsByPluginId: Readonly<
    Record<string, readonly ImportParameterDescriptor[]>
  >;
  /** Registered current state schema versions for every installed plugin. */
  readonly stateSchemaVersionByPluginId?: Readonly<Record<string, number>>;
  /** Stable drum voice IDs by instrument plugin. Pitched instruments omit an entry. */
  readonly voiceIdsByPluginId?: Readonly<Record<string, readonly string[]>>;
  /** State and placement contracts for every installed effect plugin. */
  readonly effectDescriptorsByPluginId?: Readonly<Record<string, ImportEffectDescriptor>>;
  /** Installed plugin identity contracts. The browser composition passes its registry here. */
  readonly pluginMetadataByPluginId?: Readonly<Record<string, ImportPluginMetadata>>;
}

export type ImportParameterDescriptor = Pick<
  ParameterDescriptor,
  "id" | "valueType" | "minimum" | "maximum" | "enumValues"
>;

/**
 * The data-only effect state contract used at the import boundary.
 */
export interface ImportEffectStateDescriptor {
  readonly stateSchemaVersion: number;
  readonly parameters: readonly ImportParameterDescriptor[];
}

export interface ImportEffectDescriptor extends ImportEffectStateDescriptor {
  readonly placements: readonly ("module-pedalboard" | "send-chain" | "master-chain")[];
}

export interface ImportPluginMetadata {
  readonly kind: "instrument" | "effect";
  readonly pluginVersion: string;
  readonly apiVersion: 1;
  readonly stateSchemaVersion: number;
}
