import { RACK_SLOT_IDS, SEND_BUS_IDS, isCanonicalUuid } from "../../contracts/ids";
import { MASTER_EFFECT_CHAIN_SLOT_COUNT, MODULE_EFFECT_CHAIN_SLOT_COUNT, PROTECTED_LIMITER_EFFECT_PLUGIN_ID, SEND_EFFECT_CHAIN_SLOT_COUNT } from "../../contracts/effects";
import { isPlainRecord } from "../../contracts/validation";
import type { ParameterValue } from "../../contracts/parameters";
import { DEFAULT_MASTER_LEVEL, DEFAULT_MODULE_LEVEL, MAXIMUM_PATTERN_COUNT } from "../default-state";
import { PATTERN_TICKS_PER_STEP } from "../model";
import {
  AUTOMATION_LANE_KEYS,
  AUTOMATION_STEP_KEYS,
  IssueCollector,
  MAXIMUM_REPORTED_ISSUES,
  finiteNumber,
} from "./project-document-validation";
import {
  type DocumentResult,
  type EffectsDocument,
  type MasterChainDocument,
  type MixerDocument,
  type ModuleChainDocument,
  type PluginRequirementDocument,
  type SendChainDocument,
  failure,
} from "./project-document-schema";

const FORMAT_ONE_ROOT_KEYS = new Set([
  "format",
  "formatVersion",
  "project",
  "plugins",
  "rack",
  "patterns",
  "song",
  "songEnabled",
  "activePatternIndex",
  "automation",
  "mixer",
  "effects",
  "assets",
  "migrations",
]);
const FORMAT_ONE_PATTERN_KEYS = new Set([
  "id",
  "moduleId",
  "name",
  "length",
  "patternIndex",
  "humanize",
  "seed",
  "events",
]);
const FORMAT_ONE_SONG_ENTRY_KEYS = new Set(["patternIndex", "repeats"]);
const FORMAT_ONE_MIGRATION_ID = "project-format-1-to-2-pattern-bank";
const FORMAT_TWO_MIGRATION_ID = "project-format-2-to-3-effect-stages";

export function migrateFormatOneDocument(
  value: Readonly<Record<string, unknown>>,
): DocumentResult<Readonly<Record<string, unknown>>> {
  const collector = new IssueCollector();
  const migratedRecord = {
    scope: "project" as const,
    id: FORMAT_ONE_MIGRATION_ID,
    fromVersion: 1,
    toVersion: 2,
    implementation: "1.0.0",
  };

  // Development builds briefly wrote the new shape with the old version. Keep
  // those detached candidates readable while the current validator still owns
  // every field check.
  if (isPlainRecord(value.song) && typeof value.activePatternId === "string") {
    const existingMigrations: readonly unknown[] = Array.isArray(value.migrations)
      ? value.migrations
      : [];
    return {
      ok: true,
      value: {
        ...value,
        formatVersion: 2,
        migrations: [...existingMigrations, migratedRecord],
      },
    };
  }

  collector.exactKeys(value, FORMAT_ONE_ROOT_KEYS, "$");
  if (!Array.isArray(value.patterns)) {
    collector.add("patterns", "Format 1 Patterns must be an array.");
  }
  if (!Array.isArray(value.song)) collector.add("song", "Format 1 Song data must be an array.");
  if (!Array.isArray(value.rack)) collector.add("rack", "Format 1 rack data must be an array.");
  validateFormatOneEffectChains(value.effects, collector);
  for (const key of ["automation", "assets", "migrations"] as const) {
    const field = value[key];
    if (!Array.isArray(field) || field.length > 0) {
      collector.add(key, `Format 1 ${key} must be an empty array.`);
    }
  }
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }

  const patterns = value.patterns as readonly unknown[];
  const grouped = new Map<number, Readonly<Record<string, unknown>>[]>();
  for (const [recordIndex, candidate] of patterns.entries()) {
    const path = `patterns[${String(recordIndex)}]`;
    if (!isPlainRecord(candidate)) {
      collector.add(path, "A format-1 Pattern record must be an object.");
      continue;
    }
    collector.exactKeys(candidate, FORMAT_ONE_PATTERN_KEYS, path);
    const index = candidate.patternIndex ?? 0;
    if (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= MAXIMUM_PATTERN_COUNT) {
      collector.add(`${path}.patternIndex`, "Format-1 Pattern index is outside its range.");
      continue;
    }
    const records = grouped.get(Number(index)) ?? [];
    grouped.set(Number(index), [...records, candidate]);
  }
  const song = value.song as readonly unknown[];
  for (const [index, candidate] of song.entries()) {
    if (!isPlainRecord(candidate)) {
      collector.add(`song[${String(index)}]`, "A format-1 Song entry must be an object.");
      continue;
    }
    collector.exactKeys(candidate, FORMAT_ONE_SONG_ENTRY_KEYS, `song[${String(index)}]`);
  }
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }

  const metadata = isPlainRecord(value.project) ? value.project : {};
  const projectId = typeof metadata.id === "string" ? metadata.id : "missing-project";
  const createdAt = typeof metadata.createdAt === "string" ? metadata.createdAt : "";
  const modifiedAt = typeof metadata.modifiedAt === "string" ? metadata.modifiedAt : "";
  const colors = ["#E6A23C", "#F26D6D", "#58B8F6", "#A87CFF", "#63C78F"] as const;
  const activeIndex = Number.isSafeInteger(value.activePatternIndex)
    ? Number(value.activePatternIndex)
    : 0;
  const requiredPatternIndices = new Set(grouped.keys());
  if (activeIndex >= 0 && activeIndex < MAXIMUM_PATTERN_COUNT) {
    requiredPatternIndices.add(activeIndex);
  }
  for (const candidate of song) {
    const patternIndex = isPlainRecord(candidate) ? candidate.patternIndex : undefined;
    if (
      Number.isSafeInteger(patternIndex) &&
      Number(patternIndex) >= 0 &&
      Number(patternIndex) < MAXIMUM_PATTERN_COUNT
    ) {
      requiredPatternIndices.add(Number(patternIndex));
    }
  }
  if (requiredPatternIndices.size === 0) requiredPatternIndices.add(0);
  const patternGroups = [...requiredPatternIndices]
    .map((index) => [index, grouped.get(index) ?? []] as const)
    .toSorted(([left], [right]) => left - right);
  const migratedPatterns = patternGroups.map(([index, records]) => {
    const first = records[0] ?? {};
    const patternId = formatOnePatternId(first.id, projectId, index);
    const lengths = records.flatMap((record) =>
      typeof record.length === "number" ? [record.length] : [],
    );
    const maximumLength = Math.max(16, ...lengths);
    return {
      id: patternId,
      name: typeof first.name === "string" ? first.name : `Pattern ${String(index + 1)}`,
      color: colors[index] ?? "#E6A23C",
      durationBars: Math.max(1, Math.ceil(maximumLength / 16)),
      scale: "Chromatic",
      humanize: typeof first.humanize === "number" ? first.humanize : 0,
      seed:
        typeof first.seed === "number" && Number.isSafeInteger(first.seed)
          ? first.seed
          : migrationHash(`${projectId}:pattern-seed:${String(index)}`),
      createdAt,
      modifiedAt,
      automationLaneIds: [],
      parts: records.map((record) => ({
        moduleId: record.moduleId,
        length: record.length,
        voiceCycleLengths: {},
        events: Array.isArray(record.events)
          ? record.events.map((event) => normalizeFormatOneEvent(event))
          : record.events,
        automationLaneIds: [],
      })),
    };
  });
  const patternIdByIndex = new Map(
    patternGroups.map(([index], position) => [
      index,
      migratedPatterns[position]?.id ?? "",
    ]),
  );
  const firstPatternId = migratedPatterns[0]?.id ?? "";
  const activePatternId = patternIdByIndex.get(activeIndex) ?? firstPatternId;
  const playlist =
    song.length === 0
      ? [
          {
            id: stableMigrationUuid(`${projectId}:song:empty:${String(activeIndex)}`),
            patternId: activePatternId,
            repeatCount: 1,
          },
        ]
      : song.map((candidate, index) => {
          const entry = candidate as Readonly<Record<string, unknown>>;
          const patternIndex = typeof entry.patternIndex === "number" ? entry.patternIndex : -1;
          return {
            id: stableMigrationUuid(`${projectId}:song:${String(index)}:${String(patternIndex)}`),
            patternId: patternIdByIndex.get(patternIndex) ?? "",
            repeatCount: entry.repeats,
          };
        });
  const migratedRack = (value.rack as readonly unknown[]).map((raw) => {
    if (!isPlainRecord(raw) || typeof raw.moduleId !== "string") return raw;
    return {
      ...raw,
      sends: SEND_BUS_IDS.map((busId) => ({ busId, amount: 0, mode: "post-fader" as const })),
    };
  });
  const migratedMixer = formatOneMixerDocument(migratedRack, value.mixer);
  const migratedEffects = formatOneEffectsDocument(value.effects, projectId, migratedRack);
  const migratedPlugins = formatOnePluginRequirements(value.plugins, migratedRack, migratedEffects.instances);
  return {
    ok: true,
    value: {
      format: value.format,
      formatVersion: 2,
      project: value.project,
      plugins: migratedPlugins,
      rack: migratedRack,
      patterns: migratedPatterns,
      song: { enabled: value.songEnabled === true, playlist },
      activePatternId,
      automation: [],
      mixer: migratedMixer,
      effects: migratedEffects,
      assets: [],
      migrations: [migratedRecord],
    },
  };
}

function validateFormatOneEffectChains(value: unknown, collector: IssueCollector): void {
  if (!isPlainRecord(value)) {
    collector.add("effects", "Format 1 effects must be an object.");
    return;
  }
  if (!Array.isArray(value.instances)) {
    collector.add("effects.instances", "Format 1 effect instances must be an array.");
  }
  const validateChains = (field: "moduleChains" | "sendChains"): void => {
    const chains = value[field];
    if (!Array.isArray(chains)) {
      collector.add(`effects.${field}`, `Format 1 ${field} must be an array.`);
      return;
    }
    for (const [index, chain] of chains.entries()) {
      if (!isPlainRecord(chain) || !Array.isArray(chain.slots)) {
        collector.add(
          `effects.${field}[${String(index)}].slots`,
          "A format-1 effect chain must have a slot array.",
        );
      }
    }
  };
  validateChains("moduleChains");
  validateChains("sendChains");
  if (!isPlainRecord(value.masterChain)) {
    collector.add("effects.masterChain", "The format-1 master effect chain must be an object.");
  } else if (!Array.isArray(value.masterChain.slots)) {
    collector.add(
      "effects.masterChain.slots",
      "The format-1 master effect chain must have a slot array.",
    );
  }
  if (typeof value.masterEffectsBypassed !== "boolean") {
    collector.add(
      "effects.masterEffectsBypassed",
      "Format 1 master-effects bypass must be true or false.",
    );
  }
}

function formatOneMixerDocument(rack: readonly unknown[], legacyMixer: unknown): MixerDocument {
  const legacyMaster = isPlainRecord(legacyMixer) && finiteNumber(legacyMixer.masterLevel, 0, 1)
    ? legacyMixer.masterLevel
    : DEFAULT_MASTER_LEVEL;
  return {
    channels: RACK_SLOT_IDS.map((slotId, index) => {
      const slot = rack[index];
      const module = isPlainRecord(slot) && typeof slot.moduleId === "string" ? slot : undefined;
      const sends = SEND_BUS_IDS.map((busId) => ({ busId, amount: 0, mode: "post-fader" as const }));
      return {
        slotId,
        moduleId: typeof module?.moduleId === "string" ? module.moduleId : null,
        level: typeof module?.level === "number" ? module.level : DEFAULT_MODULE_LEVEL,
        pan: typeof module?.pan === "number" ? module.pan : 0,
        muted: module?.muted === true,
        solo: module?.solo === true,
        sends,
        moduleChainId: typeof module?.moduleId === "string" ? module.moduleId : null,
      };
    }),
    sends: SEND_BUS_IDS.map((busId) => ({ busId })),
    master: { level: legacyMaster },
  };
}

interface FormatTwoEffectInstanceDocument {
  readonly id: string;
  readonly pluginId: string;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
  readonly bypassed: boolean;
  readonly wetDry: number;
}

interface FormatTwoEffectsDocument extends Omit<EffectsDocument, "instances"> {
  readonly instances: readonly FormatTwoEffectInstanceDocument[];
}

function formatOneEffectsDocument(value: unknown, projectId: string, rack: readonly unknown[]): FormatTwoEffectsDocument {
  const old = isPlainRecord(value) ? value : {};
  const oldInstances = Array.isArray(old.instances) ? old.instances : [];
  const instances: FormatTwoEffectInstanceDocument[] = oldInstances.flatMap((raw) => {
    if (!isPlainRecord(raw) || typeof raw.id !== "string" || typeof raw.pluginId !== "string" ||
      typeof raw.stateVersion !== "number" || !isPlainRecord(raw.state)) return [];
    return [{ id: raw.id, pluginId: raw.pluginId, stateVersion: raw.stateVersion, state: raw.state as Readonly<Record<string, ParameterValue>>, bypassed: false, wetDry: 1 }];
  });
  if (
    Array.isArray(old.moduleChains) &&
    Array.isArray(old.sendChains) &&
    isPlainRecord(old.masterChain) &&
    typeof old.masterEffectsBypassed === "boolean"
  ) {
    const moduleIds = new Set(
      rack.flatMap((slot) =>
        isPlainRecord(slot) && typeof slot.moduleId === "string" ? [slot.moduleId] : [],
      ),
    );
    const moduleChains = (old.moduleChains as readonly ModuleChainDocument[]).filter((chain) =>
      moduleIds.has(chain.moduleId),
    );
    const sendChains = old.sendChains as readonly SendChainDocument[];
    const masterChain = old.masterChain as unknown as MasterChainDocument;
    const referencedIds = new Set<string>();
    for (const chain of [...moduleChains, ...sendChains, masterChain]) {
      for (const id of chain.slots) if (id !== null) referencedIds.add(id);
    }
    return {
      instances: instances.filter((instance) => referencedIds.has(instance.id)),
      moduleChains,
      sendChains,
      masterChain,
      masterEffectsBypassed: old.masterEffectsBypassed,
    };
  }
  const add = (pluginId: string, key: string): string => {
    const id = stableMigrationUuid(`${projectId}:effect:${key}`);
    instances.push({ id, pluginId, stateVersion: 1, state: {}, bypassed: false, wetDry: 1 });
    return id;
  };
  const sendChains = SEND_BUS_IDS.map((busId, index) => {
    const pluginId = ["delay", "reverb", "stereo-width", "distortion"][index] ?? "distortion";
    const id = add(pluginId, busId);
    return { busId, slots: [id, ...Array.from({ length: SEND_EFFECT_CHAIN_SLOT_COUNT - 1 }, () => null)], returnLevel: 1, bypassed: false, pinnedEffectId: id };
  });
  const compressor = add("compressor", "master-compressor");
  const equalizer = add("parametric-eq", "master-parametric-eq");
  const limiter = add(PROTECTED_LIMITER_EFFECT_PLUGIN_ID, "master-limiter");
  return {
    instances,
    moduleChains: rack.flatMap((slot) => isPlainRecord(slot) && typeof slot.moduleId === "string"
      ? [{ moduleId: slot.moduleId, slots: Array.from({ length: MODULE_EFFECT_CHAIN_SLOT_COUNT }, () => null) }]
      : []),
    sendChains,
    masterChain: {
      slots: [
        compressor,
        equalizer,
        ...Array.from({ length: MASTER_EFFECT_CHAIN_SLOT_COUNT - 3 }, () => null),
        limiter,
      ],
    },
    masterEffectsBypassed: false,
  };
}

function formatOnePluginRequirements(
  value: unknown,
  rack: readonly unknown[],
  effectInstances: readonly { readonly pluginId: string }[],
): readonly PluginRequirementDocument[] {
  const existing = Array.isArray(value) ? value : [];
  const effectIds = new Set(effectInstances.map((instance) => instance.pluginId));
  const rackIds = new Set(rack.flatMap((slot) => isPlainRecord(slot) && typeof slot.pluginId === "string" ? [slot.pluginId] : []));
  return existing.flatMap((raw) => {
    if (!isPlainRecord(raw) || typeof raw.pluginId !== "string" || typeof raw.stateSchemaVersion !== "number") return [];
    return [{ pluginId: raw.pluginId, kind: effectIds.has(raw.pluginId) && !rackIds.has(raw.pluginId) ? "effect" as const : "instrument" as const, pluginVersion: "1.0.0", apiVersion: 1 as const, stateSchemaVersion: raw.stateSchemaVersion }];
  }).concat(
    [...effectIds].filter((pluginId) => !existing.some((raw) => isPlainRecord(raw) && raw.pluginId === pluginId)).map((pluginId) => ({ pluginId, kind: "effect" as const, pluginVersion: "1.0.0", apiVersion: 1 as const, stateSchemaVersion: 1 })),
  );
}

function normalizeFormatOneEvent(value: unknown): unknown {
  if (!isPlainRecord(value) || !isPlainRecord(value.data)) return value;
  return {
    ...value,
    data: {
      ...value.data,
      probability: typeof value.data.probability === "number" ? value.data.probability : 1,
      microTimingTicks:
        typeof value.data.microTimingTicks === "number" ? value.data.microTimingTicks : 0,
      flam: typeof value.data.flam === "number" ? value.data.flam : 0,
      roll: typeof value.data.roll === "number" ? value.data.roll : 0,
    },
  };
}

function formatOnePatternId(value: unknown, projectId: string, index: number): string {
  if (typeof value === "string") {
    const prefix = value.split(":", 1)[0];
    if (prefix !== undefined && isCanonicalUuid(prefix)) return prefix;
  }
  return stableMigrationUuid(`${projectId}:pattern:${String(index)}`);
}

function migrationHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

function stableMigrationUuid(value: string): string {
  const hex = [0, 1, 2, 3]
    .map((index) => migrationHash(`${String(index)}:${value}`).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface LegacyEffectMixState {
  readonly dryWet: number;
  readonly pluginMix: number;
}

function collapseLegacyEffectMix(pluginMix: number, dryWet: number): {
  readonly mix: number;
  readonly gainDecibels: number;
} {
  const innerAngle = (pluginMix * Math.PI) / 2;
  const outerAngle = (dryWet * Math.PI) / 2;
  const dryCoefficient = Math.cos(outerAngle) + Math.cos(innerAngle) * Math.sin(outerAngle);
  const wetCoefficient = Math.sin(innerAngle) * Math.sin(outerAngle);
  const gain = Math.hypot(dryCoefficient, wetCoefficient);
  return {
    mix: gain === 0 ? 0 : (Math.atan2(wetCoefficient, dryCoefficient) * 2) / Math.PI,
    gainDecibels: gain === 0 ? -24 : Math.max(-24, Math.min(24, 20 * Math.log10(gain))),
  };
}

export function migrateFormatTwoDocument(
  value: Readonly<Record<string, unknown>>,
): DocumentResult<Readonly<Record<string, unknown>>> {
  if (!isPlainRecord(value.effects) || !Array.isArray(value.effects.instances)) {
    return failure("effects.instances", "Format 2 effect instances must be an array.");
  }
  if (!Array.isArray(value.migrations)) {
    return failure("migrations", "Format 2 migrations must be an array.");
  }
  const legacyById = new Map<string, LegacyEffectMixState>();
  const limiterIds = new Set<string>();
  const collector = new IssueCollector();
  const legacyInstances: readonly unknown[] = value.effects.instances;
  const instances = legacyInstances.map((candidate, index) => {
    if (!isPlainRecord(candidate) || !isPlainRecord(candidate.state)) return candidate;
    const path = `effects.instances[${String(index)}]`;
    const hasPluginMix = Object.hasOwn(candidate.state, "mix");
    if (!finiteNumber(candidate.wetDry, 0, 1)) {
      collector.add(`${path}.wetDry`, "Format 2 effect wetDry must be from 0 through 1.");
    }
    if (hasPluginMix && !finiteNumber(candidate.state.mix, 0, 1)) {
      collector.add(`${path}.state.mix`, "Format 2 plugin Mix must be from 0 through 1.");
    }
    const pluginMix = finiteNumber(candidate.state.mix, 0, 1) ? candidate.state.mix : 1;
    const dryWet = finiteNumber(candidate.wetDry, 0, 1) ? candidate.wetDry : 1;
    if (typeof candidate.id === "string") legacyById.set(candidate.id, { dryWet, pluginMix });
    const collapsed = collapseLegacyEffectMix(pluginMix, dryWet);
    const state = { ...candidate.state };
    delete state.mix;
    const pluginId = typeof candidate.pluginId === "string" ? candidate.pluginId : "";
    if (pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID && typeof candidate.id === "string") {
      limiterIds.add(candidate.id);
    }
    if (pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID && typeof state.gain === "number") {
      state.input = state.gain;
      delete state.gain;
    }
    const rest = Object.fromEntries(
      Object.entries(candidate).filter(([key]) => key !== "wetDry"),
    );
    return { ...rest, state, ...collapsed };
  });
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }
  const migrateSends = (candidate: unknown): unknown => {
    if (!isPlainRecord(candidate) || !Array.isArray(candidate.sends)) return candidate;
    const sends: readonly unknown[] = candidate.sends;
    return {
      ...candidate,
      sends: sends.map((send) => {
        if (!isPlainRecord(send)) return send;
        return Object.fromEntries(Object.entries(send).filter(([key]) => key !== "mode"));
      }),
    };
  };
  const rack = Array.isArray(value.rack) ? value.rack.map(migrateSends) : value.rack;
  const mixer = isPlainRecord(value.mixer) && Array.isArray(value.mixer.channels)
    ? { ...value.mixer, channels: value.mixer.channels.map(migrateSends) }
    : value.mixer;
  const automationResult = migrateFormatTwoEffectAutomation(
    value.automation,
    value.patterns,
    value.rack,
    legacyById,
    limiterIds,
    isPlainRecord(value.project) && typeof value.project.id === "string"
      ? value.project.id
      : "missing-project",
  );
  if (!automationResult.ok) return automationResult;
  const migrations: readonly unknown[] = value.migrations;
  return {
    ok: true,
    value: {
      ...value,
      formatVersion: 3,
      rack,
      mixer,
      patterns: automationResult.value.patterns,
      automation: automationResult.value.automation,
      effects: { ...value.effects, instances },
      migrations: [
        ...migrations,
        {
          scope: "project",
          id: FORMAT_TWO_MIGRATION_ID,
          fromVersion: 2,
          toVersion: 3,
          implementation: "1.0.0",
        },
      ],
    },
  };
}

function migrateFormatTwoEffectAutomation(
  rawAutomation: unknown,
  rawPatterns: unknown,
  rawRack: unknown,
  legacyById: ReadonlyMap<string, LegacyEffectMixState>,
  limiterIds: ReadonlySet<string>,
  projectId: string,
): DocumentResult<{ readonly automation: unknown; readonly patterns: unknown }> {
  if (!Array.isArray(rawAutomation) || !Array.isArray(rawPatterns)) {
    return { ok: true, value: { automation: rawAutomation, patterns: rawPatterns } };
  }
  const automationValues: readonly unknown[] = rawAutomation;
  const patternValues: readonly unknown[] = rawPatterns;
  const moduleIds = new Set(
    Array.isArray(rawRack)
      ? rawRack.flatMap((slot) =>
          isPlainRecord(slot) && typeof slot.moduleId === "string" ? [slot.moduleId] : [],
        )
      : [],
  );
  const patternIds = new Set(
    patternValues.flatMap((pattern) =>
      isPlainRecord(pattern) && typeof pattern.id === "string" ? [pattern.id] : [],
    ),
  );
  const validated = validateFormatTwoAutomationForMigration(
    automationValues,
    patternIds,
    moduleIds,
    new Set(legacyById.keys()),
  );
  if (!validated.ok) return validated;
  const source = validated.value;
  const groups = new Map<string, Readonly<Record<string, unknown>>[]>();
  const retained: Readonly<Record<string, unknown>>[] = [];
  const droppedLaneIds = new Set<string>();
  for (const lane of source) {
    if (
      lane.scope === "effect" &&
      typeof lane.targetId === "string" &&
      typeof lane.patternId === "string" &&
      (lane.parameterId === "mix" || lane.parameterId === "wet-dry")
    ) {
      const key = `${lane.patternId}:${lane.targetId}`;
      groups.set(key, [...(groups.get(key) ?? []), lane]);
      continue;
    }
    if (
      lane.scope === "send" &&
      typeof lane.parameterId === "string" &&
      /^send-[abcd]-mode$/u.test(lane.parameterId)
    ) {
      if (typeof lane.id === "string") droppedLaneIds.add(lane.id);
      continue;
    }
    if (
      lane.scope === "effect" &&
      typeof lane.targetId === "string" &&
      limiterIds.has(lane.targetId) &&
      lane.parameterId === "gain"
    ) {
      retained.push({ ...lane, parameterId: "input" });
      continue;
    }
    retained.push(lane);
  }
  const addedLaneIdsByPattern = new Map<string, string[]>();
  for (const [key, lanes] of groups) {
    const separator = key.indexOf(":");
    const patternId = key.slice(0, separator);
    const targetId = key.slice(separator + 1);
    const legacy = legacyById.get(targetId) ?? { pluginMix: 1, dryWet: 1 };
    const innerLane = lanes.find((lane) => lane.parameterId === "mix");
    const outerLane = lanes.find((lane) => lane.parameterId === "wet-dry");
    const ticks = new Set<number>();
    for (const lane of lanes) {
      if (!Array.isArray(lane.steps)) continue;
      for (const step of lane.steps) {
        if (isPlainRecord(step) && typeof step.tick === "number") ticks.add(step.tick);
      }
    }
    const orderedTicks = [...ticks].toSorted((left, right) => left - right);
    const mixSteps = orderedTicks.map((tick) => {
      const pluginMix = automationValueAt(innerLane, tick, legacy.pluginMix);
      const dryWet = automationValueAt(outerLane, tick, legacy.dryWet);
      return { tick, value: collapseLegacyEffectMix(pluginMix, dryWet).mix };
    });
    const gainSteps = orderedTicks.map((tick) => {
      const pluginMix = automationValueAt(innerLane, tick, legacy.pluginMix);
      const dryWet = automationValueAt(outerLane, tick, legacy.dryWet);
      return { tick, value: collapseLegacyEffectMix(pluginMix, dryWet).gainDecibels };
    });
    const mixTemplate = outerLane ?? innerLane;
    if (mixTemplate === undefined) continue;
    retained.push({ ...mixTemplate, parameterId: "mix", steps: mixSteps });
    const gainTemplate = innerLane !== undefined && innerLane !== mixTemplate ? innerLane : undefined;
    if (gainTemplate !== undefined || gainSteps.some((step) => Math.abs(step.value) > 1e-9)) {
      const gainId =
        typeof gainTemplate?.id === "string"
          ? gainTemplate.id
          : stableMigrationUuid(`${projectId}:${patternId}:${targetId}:effect-gain`);
      retained.push({ ...mixTemplate, ...gainTemplate, id: gainId, parameterId: "gain", steps: gainSteps });
      if (gainTemplate === undefined) {
        addedLaneIdsByPattern.set(patternId, [...(addedLaneIdsByPattern.get(patternId) ?? []), gainId]);
      }
    }
  }
  const patterns = patternValues.map((pattern) => {
    if (!isPlainRecord(pattern) || typeof pattern.id !== "string") return pattern;
    const added = addedLaneIdsByPattern.get(pattern.id) ?? [];
    if (!Array.isArray(pattern.automationLaneIds)) return pattern;
    if (added.length === 0 && droppedLaneIds.size === 0) return pattern;
    const laneIds: readonly unknown[] = pattern.automationLaneIds;
    const remaining = laneIds.filter(
      (laneId) => typeof laneId !== "string" || !droppedLaneIds.has(laneId),
    );
    return { ...pattern, automationLaneIds: [...remaining, ...added] };
  });
  return { ok: true, value: { automation: retained, patterns } };
}

function validateFormatTwoAutomationForMigration(
  values: readonly unknown[],
  patternIds: ReadonlySet<string>,
  moduleIds: ReadonlySet<string>,
  effectIds: ReadonlySet<string>,
): DocumentResult<readonly Readonly<Record<string, unknown>>[]> {
  const collector = new IssueCollector();
  const lanes: Readonly<Record<string, unknown>>[] = [];
  const laneIds = new Set<string>();
  for (const [index, candidate] of values.entries()) {
    const path = `automation[${String(index)}]`;
    if (!isPlainRecord(candidate)) {
      collector.add(path, "Format 2 automation lane must be an object.");
      continue;
    }
    lanes.push(candidate);
    collector.exactKeys(candidate, AUTOMATION_LANE_KEYS, path);
    if (!isCanonicalUuid(candidate.id) || laneIds.has(candidate.id)) {
      collector.add(`${path}.id`, "Format 2 automation lane ID must be a unique canonical UUID.");
    } else {
      laneIds.add(candidate.id);
    }
    if (!isCanonicalUuid(candidate.patternId) || !patternIds.has(candidate.patternId)) {
      collector.add(`${path}.patternId`, "Format 2 automation Pattern reference must resolve.");
    }
    if (candidate.stepTicks !== PATTERN_TICKS_PER_STEP) {
      collector.add(`${path}.stepTicks`, "Format 2 automation step size must be 240 ticks.");
    }
    if (typeof candidate.parameterId !== "string" || candidate.parameterId.length === 0) {
      collector.add(`${path}.parameterId`, "Format 2 automation parameter ID must not be empty.");
    }
    const scope = candidate.scope;
    if (scope === "module" || scope === "mixer" || scope === "send") {
      if (!isCanonicalUuid(candidate.targetId) || !moduleIds.has(candidate.targetId)) {
        collector.add(`${path}.targetId`, "Format 2 module automation target must resolve.");
      }
    } else if (scope === "effect") {
      if (!isCanonicalUuid(candidate.targetId) || !effectIds.has(candidate.targetId)) {
        collector.add(`${path}.targetId`, "Format 2 effect automation target must resolve.");
      }
    } else if (scope === "send-return") {
      if (!SEND_BUS_IDS.some((busId) => busId === candidate.targetId)) {
        collector.add(`${path}.targetId`, "Format 2 send-return target must be send A through D.");
      }
    } else if (scope === "master") {
      if (candidate.targetId !== "master") {
        collector.add(`${path}.targetId`, "Format 2 master automation target must be master.");
      }
    } else {
      collector.add(`${path}.scope`, "Format 2 automation scope is not supported.");
    }
    if (!Array.isArray(candidate.steps)) {
      collector.add(`${path}.steps`, "Format 2 automation steps must be an array.");
      continue;
    }
    const ticks = new Set<number>();
    let greatestTick = -1;
    for (const [stepIndex, step] of candidate.steps.entries()) {
      const stepPath = `${path}.steps[${String(stepIndex)}]`;
      if (!isPlainRecord(step)) {
        collector.add(stepPath, "Format 2 automation step must be an object.");
        continue;
      }
      collector.exactKeys(step, AUTOMATION_STEP_KEYS, stepPath);
      const invalidTick =
        typeof step.tick !== "number" ||
        !Number.isSafeInteger(step.tick) ||
        step.tick < 0 ||
        step.tick % PATTERN_TICKS_PER_STEP !== 0 ||
        ticks.has(step.tick) ||
        step.tick <= greatestTick;
      if (invalidTick) {
        collector.add(`${stepPath}.tick`, "Format 2 automation ticks must be unique increasing 1/16 steps.");
      } else if (typeof step.tick === "number") {
        ticks.add(step.tick);
        greatestTick = step.tick;
      }
      const scalar =
        (typeof step.value === "number" && Number.isFinite(step.value)) ||
        typeof step.value === "string" ||
        typeof step.value === "boolean";
      if (!scalar) {
        collector.add(`${stepPath}.value`, "Format 2 automation value must be a finite JSON scalar.");
      } else if (
        candidate.scope === "effect" &&
        (candidate.parameterId === "mix" || candidate.parameterId === "wet-dry") &&
        !finiteNumber(step.value, 0, 1)
      ) {
        collector.add(`${stepPath}.value`, "Format 2 effect Mix value must be from 0 through 1.");
      } else if (
        candidate.scope === "send" &&
        typeof candidate.parameterId === "string" &&
        /^send-[abcd]-mode$/u.test(candidate.parameterId) &&
        step.value !== "pre-fader" &&
        step.value !== "post-fader"
      ) {
        collector.add(`${stepPath}.value`, "Format 2 send mode must be pre-fader or post-fader.");
      }
    }
  }
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }
  return { ok: true, value: lanes };
}

function automationValueAt(
  lane: Readonly<Record<string, unknown>> | undefined,
  tick: number,
  fallback: number,
): number {
  if (!Array.isArray(lane?.steps)) return fallback;
  const steps = lane.steps.filter(isPlainRecord).filter(
    (step) => typeof step.tick === "number" && typeof step.value === "number",
  );
  const prior = steps.filter((step) => Number(step.tick) <= tick).at(-1) ?? steps.at(-1);
  return typeof prior?.value === "number" ? prior.value : fallback;
}
