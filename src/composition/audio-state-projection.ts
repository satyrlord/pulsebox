import type {
  EffectInstanceId,
  PluginId,
  SendBusId,
  StateRevision,
} from "../contracts";
import type { PluginManifest } from "../contracts/plugins";
import type {
  RoutingEffectInstance,
  TransportExternalAutomationProjection,
  TransportModule,
  TransportRoutingProjection,
  TransportRuntime,
} from "../engine/public";
import type { PulseState, RackModuleState } from "../state/public";

export type AudioProjectionPort = Pick<
  TransportRuntime,
  | "setArrangement"
  | "setPatternTiming"
  | "setSwing"
  | "setMasterLevel"
  | "setRoutingProjection"
  | "replaceFromCurrentState"
  | "project"
  | "stop"
>;

export interface AudioStateProjection {
  readonly revision: StateRevision;
  readonly arrangement: Parameters<AudioProjectionPort["setArrangement"]>[0];
  readonly patternTiming: Parameters<AudioProjectionPort["setPatternTiming"]>[0];
  readonly swing: number;
  readonly masterLevel: number;
  readonly routing: TransportRoutingProjection;
  readonly modules: readonly TransportModule[];
}

export interface AudioStateProjector {
  readonly project: (state: Readonly<PulseState>) => AudioStateProjection;
  readonly module: (
    state: Readonly<PulseState>,
    module: RackModuleState,
  ) => TransportModule;
  readonly routing: (state: Readonly<PulseState>) => TransportRoutingProjection;
  readonly voiceCycleLengths: (
    pluginId: PluginId,
    cycleLengths: Readonly<Record<string, number>>,
  ) => Readonly<Record<string, number>>;
}

type ManifestLookup = (pluginId: PluginId) => PluginManifest | undefined;

export function createAudioStateProjector(manifestFor: ManifestLookup): AudioStateProjector {
  const voiceCycleLengths = (
    pluginId: PluginId,
    cycleLengths: Readonly<Record<string, number>>,
  ): Readonly<Record<string, number>> => {
    const manifest = manifestFor(pluginId);
    const notesByVoiceId =
      manifest?.kind === "instrument"
        ? new Map(
            manifest.voices.flatMap((voice) =>
              voice.note === undefined ? [] : [[voice.id, voice.note]],
            ),
          )
        : new Map<string, number>();
    return Object.fromEntries(
      Object.entries(cycleLengths).flatMap(([key, length]) => {
        const numericNote = Number(key);
        const note = Number.isInteger(numericNote) ? numericNote : notesByVoiceId.get(key);
        return note === undefined ? [] : [[String(note), length]];
      }),
    );
  };

  const resolveEffectChain = (
    state: Readonly<PulseState>,
    slots: readonly (EffectInstanceId | null)[],
  ): readonly RoutingEffectInstance[] =>
    slots.flatMap((effectId) => {
      if (effectId === null) return [];
      const effect = state.project.effects.instances[effectId];
      if (effect === undefined) return [];
      return manifestFor(effect.pluginId)?.kind === "effect" ? [effect] : [];
    });

  const module = (
    state: Readonly<PulseState>,
    rackModule: RackModuleState,
  ): TransportModule => {
    const effectChain = state.project.effects.moduleChains[rackModule.id];
    return {
      id: rackModule.id,
      pluginId: rackModule.pluginId,
      parameters: rackModule.parameters,
      effects: resolveEffectChain(state, effectChain?.slots ?? []),
      effectsBypassed: effectChain?.bypassed ?? false,
      parts: state.project.patterns.map((pattern) => {
        const part = pattern.parts[rackModule.id];
        if (part === undefined) {
          return { length: 16, durationSteps: pattern.durationBars * 16, events: [] };
        }
        return {
          ...part,
          voiceCycleLengths: voiceCycleLengths(
            rackModule.pluginId,
            part.voiceCycleLengths,
          ),
          durationSteps: pattern.durationBars * 16,
          automationSteps: part.automationLaneIds
            .flatMap((laneId) => {
              const lane = state.project.automationLanes[laneId];
              if (lane === undefined) return [];
              return lane.steps.map((step) => ({
                parameterId: lane.parameterId,
                positionTicks: step.tick,
                value: step.value,
              }));
            })
            .sort(
              (left, right) =>
                left.positionTicks - right.positionTicks ||
                left.parameterId.localeCompare(right.parameterId),
            ),
        };
      }),
      mix: {
        level: rackModule.level,
        pan: rackModule.pan,
        muted: rackModule.muted,
        solo: rackModule.solo,
        sends: Object.entries(rackModule.sends).map(([busId, send]) => ({
          busId: busId as SendBusId,
          amount: send.amount,
        })),
      },
    };
  };

  const routing = (state: Readonly<PulseState>): TransportRoutingProjection => {
    const sends = Object.entries(state.project.effects.sendChains).map(([busId, chain]) => ({
      busId: busId as SendBusId,
      returnLevel: chain.returnLevel,
      effects: resolveEffectChain(state, chain.slots),
      effectsBypassed: state.project.effects.sendEffectsBypassed || chain.bypassed,
    }));
    const masterEffects = resolveEffectChain(state, state.project.effects.masterChain);
    const limiter = masterEffects.at(-1);
    return {
      sends,
      master: {
        level: state.project.masterLevel,
        effects: limiter === undefined ? [] : masterEffects.slice(0, -1),
        effectsBypassed: state.project.effects.masterEffectsBypassed,
        limiterBypassed: limiter?.bypassed ?? false,
        ...(limiter === undefined
          ? {}
          : {
              limiterState: limiter.state,
              limiterEffectId: limiter.id,
              limiterMix: limiter.mix,
              limiterGainDecibels: limiter.gainDecibels,
            }),
      },
      automation: toExternalAutomation(state),
    };
  };

  const project = (state: Readonly<PulseState>): AudioStateProjection => ({
    revision: state.project.revision,
    arrangement: toArrangement(state),
    patternTiming: state.project.patterns.map((pattern) => ({
      humanize: pattern.humanize,
      seed: pattern.seed,
    })),
    swing: state.project.swing,
    masterLevel: state.project.masterLevel,
    routing: routing(state),
    modules: Object.values(state.project.modules).map((one) => module(state, one)),
  });

  return { project, module, routing, voiceCycleLengths };
}

export function applyFullAudioProjection(
  runtime: AudioProjectionPort,
  projection: AudioStateProjection,
): Promise<void> {
  runtime.setArrangement(projection.arrangement);
  runtime.setPatternTiming(projection.patternTiming);
  runtime.setSwing(projection.swing);
  runtime.setMasterLevel(projection.masterLevel);
  runtime.setRoutingProjection(projection.routing);
  return runtime.replaceFromCurrentState(projection.modules, projection.revision);
}

export function patternIndexFor(
  state: Readonly<PulseState>,
  patternId: string,
): number | undefined {
  const index = state.project.patterns.findIndex((pattern) => pattern.id === patternId);
  return index < 0 ? undefined : index;
}

function toArrangement(
  state: Readonly<PulseState>,
): Parameters<AudioProjectionPort["setArrangement"]>[0] {
  const activePatternIndex = patternIndexFor(state, state.project.activePatternId) ?? 0;
  const songEntries = state.project.song.placements.flatMap((placement) => {
    const patternIndex = patternIndexFor(state, placement.patternId);
    return patternIndex === undefined
      ? []
      : [{ patternIndex, repeats: placement.repeatCount }];
  });
  return { activePatternIndex, songEnabled: state.project.song.enabled, songEntries };
}

function toExternalAutomation(
  state: Readonly<PulseState>,
): TransportExternalAutomationProjection {
  const targets: Record<string, TransportExternalAutomationProjection["targets"][string]> = {};
  const parts = state.project.patterns.map((pattern) => {
    const automationSteps = pattern.automationLaneIds.flatMap((laneId) => {
      const lane = state.project.automationLanes[laneId];
      if (lane === undefined || lane.scope === "module") return [];
      targets[lane.id] = {
        scope: lane.scope,
        targetId: lane.targetId,
        parameterId: lane.parameterId,
      };
      return lane.steps.map((step) => ({
        parameterId: lane.id,
        positionTicks: step.tick,
        value: step.value,
      }));
    });
    return {
      length: 16,
      durationSteps: pattern.durationBars * 16,
      events: [],
      automationSteps: automationSteps.sort(
        (left, right) =>
          left.positionTicks - right.positionTicks ||
          left.parameterId.localeCompare(right.parameterId),
      ),
    };
  });
  return { parts, targets };
}
