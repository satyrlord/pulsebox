import { describe, expect, it } from "vitest";

import type {
  EffectInstanceId,
  IdFactory,
  ModuleInstanceId,
  SendBusId,
} from "../../../src/contracts/ids";
import { toTransportDelta } from "../../../src/composition/audio-delta-projection";
import { createDefaultProjectState } from "../../../src/composition/default-project";
import type { PulseEngineDelta } from "../../../src/state/public";

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function delta(
  state: ReturnType<typeof createDefaultProjectState>,
  kind: PulseEngineDelta["kind"],
  payload: Readonly<Record<string, unknown>>,
  targetIds: PulseEngineDelta["targetIds"] = [],
): PulseEngineDelta {
  return { kind, payload, targetIds, projectRevision: state.project.revision };
}

describe("audio delta projection", () => {
  const state = createDefaultProjectState(deterministicIds());
  const firstPattern = state.project.patterns[0];
  const firstModule = Object.keys(state.project.modules)[0] as ModuleInstanceId | undefined;

  it("translates a stable Pattern selection without changing delta order or revision", () => {
    if (firstPattern === undefined) throw new Error("Expected a Pattern.");
    const source = delta(state, "pattern-select", { patternId: firstPattern.id }, [firstPattern.id]);

    expect(toTransportDelta(source, state)).toEqual({
      ...source,
      payload: { patternIndex: 0 },
    });
  });

  it("projects the stable Playlist into numeric transport entries", () => {
    const projected = toTransportDelta(delta(state, "song-set", {}), state);

    expect(projected.payload).toEqual({
      enabled: true,
      entries: [
        { patternIndex: 0, repeats: 8 },
        { patternIndex: 1, repeats: 16 },
        { patternIndex: 2, repeats: 8 },
        { patternIndex: 3, repeats: 16 },
        { patternIndex: 4, repeats: 8 },
      ],
    });
  });

  it("uses a full projection for duration and multi-module event changes", () => {
    if (firstPattern === undefined || firstModule === undefined) {
      throw new Error("Expected default content.");
    }
    const duration = toTransportDelta(
      delta(state, "pattern-timing-set", { patternId: firstPattern.id, durationBars: 2 }),
      state,
    );
    const multi = toTransportDelta(
      delta(state, "pattern-events-set", {}, [firstModule, Object.keys(state.project.modules)[1] as ModuleInstanceId]),
      state,
    );

    expect(duration.kind).toBe("project-replace");
    expect(multi.kind).toBe("project-replace");
  });

  it("keeps scale changes out of audio scheduling and supplies one module target", () => {
    if (firstPattern === undefined || firstModule === undefined) {
      throw new Error("Expected default content.");
    }
    expect(
      toTransportDelta(
        delta(state, "pattern-timing-set", { patternId: firstPattern.id, scale: "Minor" }),
        state,
      ).kind,
    ).toBe("pattern-rename");
    expect(
      toTransportDelta(delta(state, "pattern-events-set", {}, [firstModule]), state).payload,
    ).toEqual({ moduleId: firstModule });
  });

  it("keeps effect edits bounded to their owning audio target", () => {
    if (firstModule === undefined) throw new Error("Expected default content.");
    const effectId = "20000000-0000-4000-8000-000000000001" as EffectInstanceId;
    const sendBusId = "send-a" as SendBusId;

    const sendProjection = toTransportDelta(
      delta(state, "module-effects-set", {
        effectId,
        parameterId: "mix",
        value: 0.4,
        chain: { scope: "send", targetId: sendBusId },
      }),
      state,
    );
    expect(sendProjection.kind).toBe("module-effects-set");
    expect(sendProjection.payload.audioScope).toBe("send");
    expect(sendProjection.payload.sendBusId).toBe(sendBusId);
    expect(
      toTransportDelta(
        delta(state, "module-effects-set", {
          effectId,
          chain: { scope: "module", targetId: firstModule },
        }),
        state,
      ).payload,
    ).toEqual(expect.objectContaining({ audioScope: "module", moduleId: firstModule }));
    expect(
      toTransportDelta(
        delta(state, "module-effects-set", { audioUnchanged: true }),
        state,
      ).payload,
    ).toEqual(expect.objectContaining({ audioScope: "none" }));
  });

  it("uses a full projection when an effect delta has no bounded target", () => {
    expect(
      toTransportDelta(delta(state, "module-effects-set", { effectId: "missing" }), state)
        .kind,
    ).toBe("project-replace");
  });

  it("projects the group bypass overrides without rebuilding unrelated audio", () => {
    if (firstModule === undefined) throw new Error("Expected default content.");
    const sendBusId = "send-a" as SendBusId;
    const bypassedState = {
      ...state,
      project: {
        ...state.project,
        effects: { ...state.project.effects, sendEffectsBypassed: true },
      },
    };

    expect(
      toTransportDelta(
        delta(bypassedState, "module-effects-set", { sendEffectsBypassed: true }),
        bypassedState,
      ).payload,
    ).toEqual(expect.objectContaining({ audioScope: "send-all" }));
    expect(
      toTransportDelta(
        delta(bypassedState, "module-effects-set", {
          bypassed: false,
          chain: { scope: "send", targetId: sendBusId },
        }),
        bypassedState,
      ).payload,
    ).toEqual(
      expect.objectContaining({ audioScope: "send", sendBusId, bypassed: true }),
    );
    expect(
      toTransportDelta(
        delta(state, "module-effects-set", {
          bypassed: true,
          chain: { scope: "module", targetId: firstModule },
        }),
        state,
      ).payload,
    ).toEqual(
      expect.objectContaining({
        audioScope: "module",
        moduleId: firstModule,
        bypassed: true,
      }),
    );
    expect(
      toTransportDelta(
        delta(bypassedState, "module-effects-set", {
          effectId: "20000000-0000-4000-8000-000000000001",
          bypassed: false,
          chain: { scope: "send", targetId: sendBusId },
        }),
        bypassedState,
      ).payload,
    ).toEqual(
      expect.objectContaining({
        audioScope: "send",
        sendBusId,
        bypassed: false,
      }),
    );
  });
});
