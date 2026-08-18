import { describe, expect, it, vi } from "vitest";

import type {
  EffectInstanceId,
  ModuleInstanceId,
  SendBusId,
  StateRevision,
} from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import {
  EFFECT_PARAMETER_QUEUE_CAPACITY,
  EffectParameterQueue,
} from "../../../src/engine/effects/registry/parameter-queue";
import { MixerRoutingGraph } from "../../../src/engine/routing/mixer-routing-graph";
import {
  TransportRuntime,
  scheduleExternalAutomationWindow,
  type TransportExternalAutomationProjection,
} from "../../../src/engine/transport/transport-runtime";
import type { VoiceAdapterPort } from "../../../src/engine/transport/voice-adapter";
import { TEST_UUID } from "../contracts/fixtures";

const MODULE = "10000000-0000-4000-8000-000000000001" as ModuleInstanceId;
const EFFECT = "20000000-0000-4000-8000-000000000001" as EffectInstanceId;
const SEND_A = "send-a" as SendBusId;

function parameter(value = 0) {
  const result = {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((next: number, time: number) => { void time; result.value = next; }),
    linearRampToValueAtTime: vi.fn((next: number, time: number) => { void time; result.value = next; }),
  };
  return result;
}

function node(extra: Readonly<Record<string, unknown>> = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
}

function context() {
  const parameters: ReturnType<typeof parameter>[] = [];
  const makeParameter = (value = 0) => {
    const result = parameter(value);
    parameters.push(result);
    return result;
  };
  const result = {
    currentTime: 0,
    sampleRate: 48_000,
    destination: node(),
    createGain: vi.fn(() => node({ gain: makeParameter() })),
    createStereoPanner: vi.fn(() => node({ pan: makeParameter() })),
    createDynamicsCompressor: vi.fn(() => node({
      threshold: makeParameter(), knee: makeParameter(), ratio: makeParameter(),
      attack: makeParameter(), release: makeParameter(),
    })),
    createChannelSplitter: vi.fn(() => node()),
    createChannelMerger: vi.fn(() => node()),
    createAnalyser: vi.fn(() => node({
      fftSize: 2048,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: (data: Float32Array) => data.fill(0),
    })),
  };
  return { context: result as unknown as AudioContext, parameters };
}

describe("external automation audio scheduling", () => {
  it("maps Pattern steps to exact AudioContext frames and stable routing targets", () => {
    const projection: TransportExternalAutomationProjection = {
      parts: [],
      targets: {
        lane: { scope: "mixer", targetId: MODULE, parameterId: "level" },
      },
    };
    const changes = scheduleExternalAutomationWindow(projection, {
      resolveStep: (absoluteStep) => absoluteStep === 1
        ? {
            patternIndex: 0,
            stepInPattern: 1,
            events: [],
            automationSteps: [{ parameterId: "lane", positionTicks: 240, value: 0.25 }],
          }
        : undefined,
      stepFrames: 6_000,
      swing: 0,
      windowStartFrame: 0,
      windowEndFrame: 12_000,
      patternStartFrame: 0,
    });
    expect(changes).toEqual([{
      atFrame: 6_000,
      occurrenceId: "0:lane:1",
      scope: "mixer",
      targetId: MODULE,
      parameterId: "level",
      value: 0.25,
    }]);
  });

  it("keeps old external automation when a timing rebuild crosses its replacement", async () => {
    vi.useFakeTimers();
    const stub = context();
    let crossReplacement = false;
    const adapter: VoiceAdapterPort = {
      prepare: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn(),
      replaceState: vi.fn(),
      setProjectRevision: vi.fn(),
      setParameters: vi.fn(),
      previewParameters: vi.fn(),
      scheduleParameters: vi.fn(),
      schedule: vi.fn(),
      clearScheduledEvents: vi.fn(() => {
        if (crossReplacement) {
          (stub.context as unknown as { currentTime: number }).currentTime = 10_000 / 48_000;
        }
      }),
      resume: vi.fn(),
      suspend: vi.fn(),
      dispose: vi.fn(),
    };
    const runtime = new TransportRuntime({
      createContext: () => Object.assign(stub.context, {
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      adapterFactoryFor: () => () => adapter,
    });
    const automationPart = {
      length: 16,
      events: [],
      automationSteps: [{ parameterId: "lane", positionTicks: 480, value: 0.25 }],
    };
    runtime.setRoutingProjection({
      sends: [],
      master: { level: 0.8, effects: [], effectsBypassed: false, limiterBypassed: false },
      automation: {
        parts: [automationPart],
        targets: { lane: { scope: "mixer", targetId: MODULE, parameterId: "level" } },
      },
    });
    await runtime.replaceFromCurrentState([{
      id: MODULE,
      pluginId: "bass-mono" as PluginId,
      parameters: {},
      parts: [{ length: 16, events: [] }],
      mix: { level: 0.8, pan: 0, muted: false, solo: false },
    }], { epoch: TEST_UUID, counter: 0 } as StateRevision);
    await runtime.play(120);
    (stub.context as unknown as { currentTime: number }).currentTime = 5_900 / 48_000;
    crossReplacement = true;
    runtime.setTempo(240);

    const retainedOldOccurrence = stub.parameters
      .flatMap((one) => one.setValueAtTime.mock.calls)
      .filter((call) => call[0] === 0.25 && call[1] === 12_960 / 48_000);
    expect(retainedOldOccurrence).toHaveLength(2);
    runtime.dispose();
    vi.useRealTimers();
  });

  it("queues all routing scopes at their exact frame without rebuilding the graph", async () => {
    const stub = context();
    const scheduledEffectParameters = vi.fn();
    const clearedEffectParameters = vi.fn();
    const factory = vi.fn(() => {
      const port = node();
      return Promise.resolve({
        input: port as unknown as AudioNode,
        output: port as unknown as AudioNode,
        scheduleParameter: scheduledEffectParameters,
        clearScheduledParameters: clearedEffectParameters,
        dispose: vi.fn(),
      });
    });
    const graph = new MixerRoutingGraph(stub.context, factory, MODULE);
    await graph.setChannel(MODULE, {
      level: 0.8, pan: 0, muted: false, solo: false,
      sends: [{ busId: SEND_A, amount: 0.2 }],
      effectsBypassed: false,
      effects: [{ id: EFFECT, pluginId: "delay" as PluginId, state: {}, bypassed: false, mix: 1, gainDecibels: 0 }],
    });
    await graph.setSend({ busId: SEND_A, returnLevel: 0.7, effects: [], effectsBypassed: false });
    await graph.setMaster({ level: 0.9, effects: [], effectsBypassed: false, limiterBypassed: false });
    const allocations = stub.parameters.length;
    graph.scheduleAutomation([
      { atFrame: 4_800, scope: "mixer", targetId: MODULE, parameterId: "level", value: 0.5 },
      { atFrame: 4_800, scope: "mixer", targetId: MODULE, parameterId: "pan", value: -0.25 },
      { atFrame: 4_800, scope: "mixer", targetId: MODULE, parameterId: "solo", value: true },
      { atFrame: 4_800, scope: "send", targetId: MODULE, parameterId: "send-a-amount", value: 0.6 },
      { atFrame: 4_800, scope: "send-return", targetId: SEND_A, parameterId: "return-level", value: 0.4 },
      { atFrame: 4_800, scope: "send-return", targetId: SEND_A, parameterId: "chain-bypassed", value: true },
      { atFrame: 4_800, scope: "effect", targetId: EFFECT, parameterId: "feedback", value: 0.3 },
      { atFrame: 4_800, scope: "effect", targetId: EFFECT, parameterId: "mix", value: 0.5 },
      { atFrame: 4_800, scope: "effect", targetId: EFFECT, parameterId: "gain", value: -3 },
      { atFrame: 4_800, scope: "effect", targetId: EFFECT, parameterId: "bypassed", value: false },
      { atFrame: 4_800, scope: "master", targetId: "master", parameterId: "level", value: 0.75 },
      { atFrame: 4_800, scope: "master", targetId: "master", parameterId: "effects-bypassed", value: true },
    ]);
    expect(stub.parameters).toHaveLength(allocations);
    expect(stub.parameters.flatMap((one) => one.setValueAtTime.mock.calls).some((call) => call[1] === 0.1)).toBe(true);
    expect(scheduledEffectParameters).toHaveBeenCalledWith(4_800, "feedback", 0.3);
    graph.clearAutomation(4_800);
    expect(clearedEffectParameters).toHaveBeenCalledWith(4_800);
    graph.dispose();
  });

  it("keeps the worklet parameter queue sorted and below 256 entries", () => {
    const queue = new EffectParameterQueue();
    for (let index = EFFECT_PARAMETER_QUEUE_CAPACITY - 1; index >= 0; index -= 1) {
      expect(queue.enqueue(index + 1, `p-${String(index)}`, index)).toBe(true);
    }
    expect(queue.count).toBe(EFFECT_PARAMETER_QUEUE_CAPACITY);
    expect(queue.firstFrame).toBe(1);
    expect(queue.enqueue(999, "overflow", 1)).toBe(false);
    expect(queue.enqueue(1, "p-0", 0.5)).toBe(true);
    expect(queue.count).toBe(EFFECT_PARAMETER_QUEUE_CAPACITY);
    expect(queue.firstValue).toBe(0.5);
    queue.clearFrom(128);
    expect(queue.count).toBe(127);
  });
});
