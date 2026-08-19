import { SEND_BUS_IDS } from "../../contracts/ids";
import { DEFAULT_MODULE_LEVEL } from "../default-state";
import type { PulseState } from "../model";
import {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type PluginRequirementDocument,
  type ProjectDocument,
  type SerializeOptions,
} from "./project-document-schema";

export function serializeProject(
  state: Readonly<PulseState>,
  options: SerializeOptions,
): ProjectDocument {
  const project = state.project;
  const modules = Object.values(project.modules);
  const versionFor = options.manifestVersionFor ?? (() => 1);
  const requirementFor = (
    pluginId: string,
    kind: "instrument" | "effect",
  ): PluginRequirementDocument => {
    const metadata = options.pluginMetadataByPluginId?.[pluginId];
    if (metadata !== undefined && metadata.kind !== kind) {
      throw new Error(`Plugin ${pluginId} has an incompatible registry kind.`);
    }
    return {
      pluginId,
      kind,
      pluginVersion: metadata?.pluginVersion ?? "1.0.0",
      apiVersion: metadata?.apiVersion ?? 1,
      stateSchemaVersion: metadata?.stateSchemaVersion ?? versionFor(pluginId),
    };
  };

  const effectInstances = Object.values(project.effects.instances);
  const instrumentRequirements: PluginRequirementDocument[] = [
    ...new Set(modules.map((module) => module.pluginId)),
  ].map((pluginId) => requirementFor(pluginId, "instrument"));
  const effectRequirements: PluginRequirementDocument[] = [
    ...new Set(effectInstances.map((instance) => instance.pluginId)),
  ].map((pluginId) => requirementFor(pluginId, "effect"));
  const plugins = [...instrumentRequirements, ...effectRequirements].toSorted(
    (left, right) => left.kind.localeCompare(right.kind) || left.pluginId.localeCompare(right.pluginId),
  );

  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    project: {
      id: project.id,
      name: project.name,
      createdAt: options.createdAt,
      modifiedAt: options.modifiedAt,
      lineageId: project.lineageId,
      revisionEpoch: options.projectRevision.epoch,
      revision: options.projectRevision.counter,
      // No MVP control sets this; the post-MVP Favourite feature will.
      favorite: false,
      tempo: project.tempo,
      // State keeps Swing as a 0-to-1 ratio; the format stores the percent the
      // specification and the interface both speak in.
      swing: Math.round(project.swing * 100),
    },
    plugins,
    rack: project.rackSlots.map((slot) => {
      const module = slot.moduleId === undefined ? undefined : project.modules[slot.moduleId];
      if (module === undefined) return { id: slot.id };
      return {
        id: slot.id,
        moduleId: module.id,
        pluginId: module.pluginId,
        parameters: { ...module.parameters },
        muted: module.muted,
        solo: module.solo,
        level: module.level,
        pan: module.pan,
        sends: SEND_BUS_IDS.map((busId) => ({
          busId,
          amount: module.sends[busId]?.amount ?? 0,
        })),
      };
    }),
    patterns: project.patterns.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      color: pattern.color,
      durationBars: pattern.durationBars,
      scale: pattern.scale,
      humanize: Math.round(pattern.humanize * 100),
      seed: pattern.seed,
      createdAt: pattern.createdAt,
      modifiedAt: pattern.modifiedAt,
      automationLaneIds: [...pattern.automationLaneIds],
      parts: Object.values(pattern.parts).map((part) => ({
        moduleId: part.moduleId,
        length: part.length,
        voiceCycleLengths: { ...part.voiceCycleLengths },
        events: part.events.map((event) => ({ ...event, data: { ...event.data } })),
        automationLaneIds: [...part.automationLaneIds],
      })),
    })),
    song: {
      enabled: project.song.enabled,
      playlist: project.song.placements.map((placement) => ({ ...placement })),
    },
    activePatternId: project.activePatternId,
    automation: Object.values(project.automationLanes)
      .toSorted((left, right) => left.id.localeCompare(right.id))
      .map((lane) => ({
        ...lane,
        steps: lane.steps.map((step) => ({ ...step })),
      })),
    mixer: {
      channels: project.rackSlots.map((slot) => {
        const module = slot.moduleId === undefined ? undefined : project.modules[slot.moduleId];
        return {
          slotId: slot.id,
          moduleId: module?.id ?? null,
          level: module?.level ?? DEFAULT_MODULE_LEVEL,
          pan: module?.pan ?? 0,
          muted: module?.muted ?? false,
          solo: module?.solo ?? false,
          sends: SEND_BUS_IDS.map((busId) => ({
            busId,
            amount: module?.sends[busId]?.amount ?? 0,
          })),
          moduleChainId: module?.id ?? null,
        };
      }),
      sends: SEND_BUS_IDS.map((busId) => ({ busId })),
      master: { level: project.masterLevel },
    },
    effects: {
      instances: effectInstances
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .map((instance) => ({
          id: instance.id,
          pluginId: instance.pluginId,
          stateVersion: instance.stateVersion,
          state: { ...instance.state },
          bypassed: instance.bypassed,
          mix: instance.mix,
          gainDecibels: instance.gainDecibels,
        })),
      moduleChains: Object.entries(project.effects.moduleChains)
        .map(([moduleId, chain]) => ({
          moduleId,
          slots: [...chain.slots],
          bypassed: chain.bypassed,
        }))
        .toSorted((left, right) => left.moduleId.localeCompare(right.moduleId)),
      sendChains: SEND_BUS_IDS.map((busId) => {
        const chain = project.effects.sendChains[busId];
        if (chain === undefined) {
          throw new Error(`Send ${busId} is missing from the project state.`);
        }
        return {
          busId,
          slots: [...chain.slots],
          returnLevel: chain.returnLevel,
          bypassed: chain.bypassed,
          pinnedEffectId: chain.pinnedEffectId,
        };
      }),
      sendEffectsBypassed: project.effects.sendEffectsBypassed,
      masterChain: { slots: [...project.effects.masterChain] },
      masterEffectsBypassed: project.effects.masterEffectsBypassed,
    },
    assets: [],
    migrations: [],
  };
}

export function serializeProjectToJson(
  state: Readonly<PulseState>,
  options: SerializeOptions,
): string {
  return JSON.stringify(serializeProject(state, options));
}
