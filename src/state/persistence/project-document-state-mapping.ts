import { type AutomationLaneId, type EffectInstanceId, type ModuleInstanceId, type PatternId } from "../../contracts/ids";
import type { EffectInstanceState, EffectsState } from "../../contracts/effects";
import type { PluginId } from "../../contracts/parameters";
import type { PATTERN_TICKS_PER_STEP, AutomationLaneState, PatternPartState, PulseState, RackModuleState, VoiceCycleLengthKey } from "../model";
import type { EffectsDocument, ProjectDocument } from "./project-document-schema";

/**
 * Rebuilds store state from a validated document. Every identifier it needs is
 * already in the document, so no ID factory is involved.
 */
export function documentToState(document: ProjectDocument, base: Readonly<PulseState>): PulseState {
  const modules: Record<ModuleInstanceId, RackModuleState> = {};
  const channelsByModuleId = new Map(
    document.mixer.channels.flatMap((channel) => channel.moduleId === null ? [] : [[channel.moduleId, channel] as const]),
  );
  for (const slot of document.rack) {
    if (slot.moduleId === undefined || slot.pluginId === undefined) continue;
    const moduleId = slot.moduleId as ModuleInstanceId;
    const channel = channelsByModuleId.get(slot.moduleId);
    if (channel === undefined) continue;
    modules[moduleId] = Object.freeze({
      id: moduleId,
      pluginId: slot.pluginId as PluginId,
      parameters: Object.freeze({ ...slot.parameters }),
      muted: channel.muted,
      solo: channel.solo,
      level: channel.level,
      pan: channel.pan,
      sends: Object.freeze(Object.fromEntries(channel.sends.map((send) => [
        send.busId,
        Object.freeze({ amount: send.amount }),
      ]))) as RackModuleState["sends"],
    } as RackModuleState);
  }
  const patterns = document.patterns.map((record) => {
    const parts = Object.fromEntries(
      record.parts.map((part) => [
        part.moduleId,
        Object.freeze({
          moduleId: part.moduleId as ModuleInstanceId,
          length: part.length,
          voiceCycleLengths: Object.freeze(
            Object.fromEntries(
              Object.entries(part.voiceCycleLengths).map(([key, length]) => [
                key as VoiceCycleLengthKey,
                length,
              ]),
            ),
          ) as Readonly<Record<VoiceCycleLengthKey, number>>,
          events: Object.freeze(
            part.events.map((event) => Object.freeze({ ...event, data: Object.freeze({ ...event.data }) })),
          ),
          automationLaneIds: Object.freeze(part.automationLaneIds.map((id) => id as AutomationLaneId)),
        }),
      ]),
    ) as Readonly<Record<ModuleInstanceId, PatternPartState>>;
    return Object.freeze({
      id: record.id as PatternId,
      name: record.name,
      color: record.color,
      durationBars: record.durationBars,
      scale: record.scale,
      humanize: record.humanize / 100,
      seed: record.seed,
      parts,
      automationLaneIds: Object.freeze(record.automationLaneIds.map((id) => id as AutomationLaneId)),
      createdAt: record.createdAt,
      modifiedAt: record.modifiedAt,
    });
  });
  const automationLanes = Object.fromEntries(
    document.automation.map((lane) => [
      lane.id,
      Object.freeze({
        id: lane.id as AutomationLaneId,
        scope: lane.scope,
        targetId: lane.targetId as AutomationLaneState["targetId"],
        parameterId: lane.parameterId,
        patternId: lane.patternId as PatternId,
        stepTicks: lane.stepTicks as typeof PATTERN_TICKS_PER_STEP,
        steps: Object.freeze(lane.steps.map((step) => Object.freeze({ ...step }))),
      } satisfies AutomationLaneState),
    ]),
  ) as Readonly<Record<AutomationLaneId, AutomationLaneState>>;
  const firstModuleId = Object.keys(modules)[0] as ModuleInstanceId | undefined;
  const effects = effectsStateFromDocument(document.effects);

  return Object.freeze({
    ...base,
    project: Object.freeze({
      ...base.project,
      id: document.project.id as PulseState["project"]["id"],
      lineageId: document.project.lineageId as PulseState["project"]["lineageId"],
      name: document.project.name,
      tempo: document.project.tempo,
      swing: clampUnit(
        typeof document.project.swing === "number" ? document.project.swing / 100 : undefined,
        0,
        0,
      ),
      masterLevel: document.mixer.master.level,
      rackSlots: Object.freeze(
        document.rack.map((slot) =>
          Object.freeze(
            slot.moduleId === undefined
              ? { id: slot.id }
              : { id: slot.id as PulseState["project"]["rackSlots"][number]["id"], moduleId: slot.moduleId as ModuleInstanceId },
          ),
        ),
      ),
      modules: Object.freeze(modules),
      effects,
      patterns: Object.freeze(patterns),
      activePatternId: document.activePatternId as PatternId,
      automationLanes: Object.freeze(automationLanes),
      song: Object.freeze({
        enabled: document.song.enabled,
        placements: Object.freeze(
          document.song.playlist.map((placement) =>
            Object.freeze({
              id: placement.id as PulseState["project"]["song"]["placements"][number]["id"],
              patternId: placement.patternId as PatternId,
              repeatCount: placement.repeatCount,
            }),
          ),
        ),
      }),
    }),
    ui: Object.freeze({
      ...base.ui,
      selectedModuleId: firstModuleId,
    }),
  } as PulseState);
}

function effectsStateFromDocument(document: EffectsDocument): EffectsState {
  const instances: Record<EffectInstanceId, EffectInstanceState> = {};
  for (const instance of document.instances) {
    const id = instance.id as EffectInstanceId;
    instances[id] = Object.freeze({
      id,
      pluginId: instance.pluginId as PluginId,
      stateVersion: instance.stateVersion,
      state: Object.freeze({ ...instance.state }),
      bypassed: instance.bypassed,
      mix: instance.mix,
      gainDecibels: instance.gainDecibels,
    });
  }
  return Object.freeze({
    instances: Object.freeze(instances),
    moduleChains: Object.freeze(Object.fromEntries(document.moduleChains.map((chain) => [
      chain.moduleId as ModuleInstanceId,
      Object.freeze({
        slots: Object.freeze(
          chain.slots.map((id) => id === null ? null : id as EffectInstanceId),
        ),
        bypassed: chain.bypassed === true,
      }),
    ]))),
    sendChains: Object.freeze(Object.fromEntries(document.sendChains.map((chain) => [
      chain.busId,
      Object.freeze({
        slots: Object.freeze(chain.slots.map((id) => id === null ? null : id as EffectInstanceId)),
        returnLevel: chain.returnLevel,
        bypassed: chain.bypassed,
        pinnedEffectId: chain.pinnedEffectId === null ? null : chain.pinnedEffectId as EffectInstanceId,
      }),
    ]))) as EffectsState["sendChains"],
    sendEffectsBypassed: document.sendEffectsBypassed === true,
    masterChain: Object.freeze(document.masterChain.slots.map((id) => id === null ? null : id as EffectInstanceId)),
    masterEffectsBypassed: document.masterEffectsBypassed,
  });
}

function clampUnit(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(minimum, value));
}
