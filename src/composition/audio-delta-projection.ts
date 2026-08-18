import type { ModuleInstanceId, PatternId, SendBusId } from "../contracts/ids";
import type { PulseEngineDelta, PulseState } from "../state/public";

/**
 * Translates durable state IDs into the ordered numeric view used only by the
 * transport runtime. The state delta remains the authority for its revision.
 */
export function toTransportDelta(
  delta: PulseEngineDelta,
  state: Readonly<PulseState>,
): PulseEngineDelta {
  if (delta.kind === "module-effects-set") {
    if (delta.payload.audioUnchanged === true) {
      return { ...delta, payload: { ...delta.payload, audioScope: "none" } };
    }
    const chain = readEffectChain(delta.payload.chain);
    if (chain?.scope === "module") {
      return {
        ...delta,
        payload: {
          ...delta.payload,
          audioScope: "module",
          moduleId: chain.targetId,
        },
      };
    }
    if (chain?.scope === "send") {
      return {
        ...delta,
        payload: {
          ...delta.payload,
          audioScope: "send",
          sendBusId: chain.targetId,
        },
      };
    }
    if (chain?.scope === "master") {
      return { ...delta, payload: { ...delta.payload, audioScope: "master" } };
    }
    return { ...delta, kind: "project-replace", payload: {} };
  }
  if (delta.kind === "pattern-select") {
    return {
      ...delta,
      payload: { patternIndex: requirePatternIndex(state, delta.payload.patternId) },
    };
  }

  if (delta.kind === "song-set") {
    return {
      ...delta,
      payload: {
        enabled: state.project.song.enabled,
        entries: state.project.song.placements.map((placement) => ({
          patternIndex: requirePatternIndex(state, placement.patternId),
          repeats: placement.repeatCount,
        })),
      },
    };
  }

  if (delta.kind === "pattern-timing-set") {
    if (typeof delta.payload.durationBars === "number") {
      return { ...delta, kind: "project-replace", payload: {} };
    }
    if (typeof delta.payload.scale === "string") {
      return { ...delta, kind: "pattern-rename", payload: {} };
    }
    return {
      ...delta,
      payload: {
        ...delta.payload,
        patternIndex: requirePatternIndex(state, delta.payload.patternId),
      },
    };
  }

  if (delta.kind === "pattern-events-set") {
    const moduleIds = affectedModuleIds(delta, state);
    if (moduleIds.length !== 1) {
      return { ...delta, kind: "project-replace", payload: {} };
    }
    return {
      ...delta,
      payload: { ...delta.payload, moduleId: moduleIds[0] },
    };
  }

  return delta;
}

function readEffectChain(
  value: unknown,
):
  | { readonly scope: "module"; readonly targetId: ModuleInstanceId }
  | { readonly scope: "send"; readonly targetId: SendBusId }
  | { readonly scope: "master" }
  | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const chain = value as Record<string, unknown>;
  if (chain.scope === "master") return { scope: "master" };
  if (chain.scope === "module" && typeof chain.targetId === "string") {
    return { scope: "module", targetId: chain.targetId as ModuleInstanceId };
  }
  if (chain.scope === "send" && typeof chain.targetId === "string") {
    return { scope: "send", targetId: chain.targetId as SendBusId };
  }
  return undefined;
}

function affectedModuleIds(
  delta: PulseEngineDelta,
  state: Readonly<PulseState>,
): readonly ModuleInstanceId[] {
  return delta.targetIds.filter(
    (targetId): targetId is ModuleInstanceId => state.project.modules[targetId as ModuleInstanceId] !== undefined,
  );
}

function requirePatternIndex(state: Readonly<PulseState>, value: unknown): number {
  const patternId = value as PatternId;
  const index = state.project.patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) throw new Error("The engine delta references a missing Pattern.");
  return index;
}
