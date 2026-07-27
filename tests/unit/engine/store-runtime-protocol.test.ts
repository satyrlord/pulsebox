import { afterEach, describe, expect, it, vi } from "vitest";

import type { IdFactory } from "../../../src/contracts/ids";
import type { EngineMessageEnvelope } from "../../../src/contracts/worklet-protocol";
import { ACID_BASS_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import {
  AcidBassRuntime,
  type BassRuntimeModule,
} from "../../../src/engine/modules/bass-mono/runtime";
import { createDefaultState } from "../../../src/state/default-state";
import { PulseStore } from "../../../src/state/pulse-store";

const seed = {
  pluginId: ACID_BASS_MANIFEST.pluginId,
  parameters: { cutoff: 720, waveform: "saw", volume: 0.62 },
  steps: Array.from({ length: 16 }, () => ({
    active: true,
    note: 36,
    velocity: 0.8,
    accent: false,
    slide: false,
  })),
};

class ProtocolPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: EngineMessageEnvelope[] = [];
  readonly close = vi.fn();
  #processorSequence = 0;

  postMessage(value: unknown): void {
    const message = value as EngineMessageEnvelope;
    this.sent.push(message);
    if (message.kind === "hello") {
      this.#reply(message, "ready", { acceptedProtocolVersion: 1 });
    }
    this.#reply(message, "ack", {
      highestContiguousSequence: message.sequence,
      projectRevision: message.projectRevision,
      disposition: "applied",
    });
  }

  #reply(
    source: EngineMessageEnvelope,
    kind: "ready" | "ack",
    payload: Readonly<Record<string, unknown>>,
  ): void {
    this.onmessage?.({
      data: {
        protocolVersion: 1,
        sessionId: source.sessionId,
        nodeId: source.nodeId,
        sequence: this.#processorSequence,
        kind,
        projectRevision: source.projectRevision,
        payload,
      },
    } as MessageEvent<unknown>);
    this.#processorSequence += 1;
  }
}

class ProtocolNode extends EventTarget {
  static readonly instances: ProtocolNode[] = [];
  readonly port = new ProtocolPort();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    super();
    ProtocolNode.instances.push(this);
  }
}

afterEach(() => {
  ProtocolNode.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("store to Acid Bass worklet projection", () => {
  it("uses each accepted store revision and restores one current bounded snapshot", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    const ids = deterministicIds();
    const initialState = createDefaultState(ids, seed);
    const initialModules = toRuntimeModules(initialState);
    const context = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      close: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      sampleRate: 48_000,
    } as unknown as AudioContext;
    const runtime = new AcidBassRuntime(() => context);
    await runtime.replaceFromCurrentState(
      initialModules,
      initialState.project.revision,
    );
    await runtime.activate();

    const projections: Promise<void>[] = [];
    const store = new PulseStore(
      initialState,
      ids,
      seed,
      (delta) => projections.push(runtime.project(delta)),
    );
    const moduleId = store.getState().ui.selectedModuleId;
    if (moduleId === undefined) throw new Error("Expected a selected module.");
    const result = store.dispatch(
      store.createCommand("rack-parameter-set", {
        moduleId,
        parameter: "cutoff",
        value: 1_200,
      }),
    );
    await Promise.all(projections);
    if (result.status !== "accepted") throw new Error("Expected an accepted edit.");

    const firstNode = ProtocolNode.instances[0];
    expect(firstNode?.port.sent.at(-1)).toMatchObject({
      kind: "parameter-batch",
      projectRevision: result.projectRevision,
      payload: {
        changes: [{ parameterId: "cutoff", value: 1_200 }],
      },
    });

    firstNode?.dispatchEvent(new Event("processorerror"));
    await vi.waitFor(() => {
      expect(ProtocolNode.instances).toHaveLength(2);
      expect(ProtocolNode.instances[1]?.port.sent).toHaveLength(3);
    });
    const recoveryMessages = ProtocolNode.instances[1]?.port.sent;
    expect(recoveryMessages?.map((message) => message.kind)).toEqual([
      "hello",
      "state-snapshot",
      "resume",
    ]);
    const recoverySnapshot = recoveryMessages?.find(
      (message) => message.kind === "state-snapshot",
    );
    expect(recoverySnapshot).toMatchObject({
      kind: "state-snapshot",
      projectRevision: result.projectRevision,
    });
    expect(recoverySnapshot?.payload.parameters).toMatchObject({ cutoff: 1_200 });
    expect(runtime.projectRevision).toEqual(store.getState().project.revision);
  });
});

function toRuntimeModules(
  state: ReturnType<typeof createDefaultState>,
): BassRuntimeModule[] {
  return Object.values(state.project.modules).map((module) => ({
    id: module.id,
    parameters: module.parameters,
    steps: module.pattern.steps,
  }));
}

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () =>
      `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}
