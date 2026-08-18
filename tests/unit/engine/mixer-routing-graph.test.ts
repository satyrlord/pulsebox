import { describe, expect, it, vi } from "vitest";

import type {
  EffectInstanceId,
  ModuleInstanceId,
  SendBusId,
} from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import { EFFECT_TRANSPORT_TEMPO_PARAMETER } from "../../../src/engine/effects/dsp";
import {
  createLimiterCeilingCurve,
  MixerRoutingGraph,
} from "../../../src/engine/routing/mixer-routing-graph";

const FIRST = "10000000-0000-4000-8000-000000000001" as ModuleInstanceId;
const SECOND = "10000000-0000-4000-8000-000000000002" as ModuleInstanceId;
const SEND_A = "send-a" as SendBusId;

function parameter(value = 0) {
  const result = {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((next: number, time: number) => {
      void time;
      result.value = next;
    }),
    linearRampToValueAtTime: vi.fn((next: number, time: number) => {
      void time;
      result.value = next;
    }),
  };
  return result;
}

interface StubNode {
  readonly connect: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
}

function node(extra: Readonly<Record<string, unknown>> = {}): StubNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extra,
  };
}

function context() {
  const gains: (StubNode & { readonly gain: ReturnType<typeof parameter> })[] = [];
  const compressors: StubNode[] = [];
  const waveShapers: (StubNode & { curve: Float32Array<ArrayBuffer> | null; oversample: string })[] = [];
  const analysers: (StubNode & {
    fftSize: number;
    smoothingTimeConstant: number;
    getFloatTimeDomainData: (data: Float32Array) => void;
  })[] = [];
  const result = {
    currentTime: 0,
    sampleRate: 48_000,
    destination: node(),
    createGain: vi.fn(() => {
      const gain = node({ gain: parameter() }) as StubNode & {
        readonly gain: ReturnType<typeof parameter>;
      };
      gains.push(gain);
      return gain;
    }),
    createStereoPanner: vi.fn(() => node({ pan: parameter() })),
    createDynamicsCompressor: vi.fn(() => {
      const compressor = node({
        reduction: -3,
        threshold: parameter(),
        knee: parameter(),
        ratio: parameter(),
        attack: parameter(),
        release: parameter(),
      });
      compressors.push(compressor);
      return compressor;
    }),
    createWaveShaper: vi.fn(() => {
      const waveShaper = node({ curve: null, oversample: "none" }) as StubNode & {
        curve: Float32Array<ArrayBuffer> | null;
        oversample: string;
      };
      waveShapers.push(waveShaper);
      return waveShaper;
    }),
    createChannelSplitter: vi.fn(() => node()),
    createChannelMerger: vi.fn(() => node()),
    createAnalyser: vi.fn(() => {
      const analyser = node({
        fftSize: 2048,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData: (data: Float32Array) => data.fill(0),
      }) as (typeof analysers)[number];
      analysers.push(analyser);
      return analyser;
    }),
  };
  return { result: result as unknown as AudioContext, gains, compressors, waveShapers, analysers };
}

describe("mixer routing graph", () => {
  it("routes one program path to the output", () => {
    const stub = context();
    const graph = new MixerRoutingGraph(stub.result, undefined, FIRST);
    expect(stub.compressors).toHaveLength(1);
    graph.dispose();
  });

  it("ramps fixed pre-fader sends on stable nodes", async () => {
    const stub = context();
    const graph = new MixerRoutingGraph(stub.result, undefined, FIRST);
    await graph.setChannel(FIRST, {
      level: 0.6,
      pan: 0,
      muted: false,
      solo: false,
      sends: [{ busId: SEND_A, amount: 0.7 }],
      effects: [],
      effectsBypassed: false,
    });
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0.7),
      ),
    ).toBe(true);

    graph.setChannelSend(FIRST, SEND_A, 0.4);
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0.4),
      ),
    ).toBe(true);
    graph.dispose();
  });

  it("gates both main and send paths under global solo without rebuilding", () => {
    const stub = context();
    const graph = new MixerRoutingGraph(stub.result, undefined, FIRST);
    graph.ensureChannel(SECOND);
    const allocations = stub.gains.length;
    graph.applySoloMute(
      new Map([
        [FIRST, { muted: false, solo: false }],
        [SECOND, { muted: false, solo: true }],
      ]),
    );
    expect(stub.gains).toHaveLength(allocations);
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0),
      ),
    ).toBe(true);
    graph.dispose();
  });

  it("builds send effects through the injected live node factory", async () => {
    const stub = context();
    const ports: StubNode[] = [];
    const scheduleParameter = vi.fn();
    const factory = vi.fn(() => {
      const port = node();
      ports.push(port);
      return Promise.resolve({
        input: port as unknown as AudioNode,
        output: port as unknown as AudioNode,
        scheduleParameter,
        getMeter: (meterId: string) => (meterId === "gain-reduction" ? 5 : 0),
        dispose: vi.fn(),
      });
    });
    const graph = new MixerRoutingGraph(stub.result, factory, FIRST);
    await graph.setSend({
      busId: SEND_A,
      returnLevel: 0.8,
      effectsBypassed: false,
      effects: [{
        id: "20000000-0000-4000-8000-000000000001" as EffectInstanceId,
        pluginId: "delay" as PluginId,
        state: { time: 0.25 },
        bypassed: false,
        mix: 0.6,
        gainDecibels: 0,
      }],
    });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(
      stub.result,
      expect.objectContaining({
        state: {
          time: 0.25,
          [EFFECT_TRANSPORT_TEMPO_PARAMETER]: 120,
        },
      }),
    );
    expect(ports[0]?.connect).toHaveBeenCalled();
    expect(scheduleParameter).toHaveBeenCalledWith(
      0,
      EFFECT_TRANSPORT_TEMPO_PARAMETER,
      120,
    );
    const effectId = "20000000-0000-4000-8000-000000000001" as EffectInstanceId;
    graph.previewEffectParameter(effectId, "time", 0.5);
    expect(scheduleParameter).toHaveBeenCalledWith(0, "time", 0.5);
    graph.setTransportTempo(90);
    expect(scheduleParameter).toHaveBeenLastCalledWith(
      0,
      EFFECT_TRANSPORT_TEMPO_PARAMETER,
      90,
    );
    expect(graph.getEffectMeter(effectId, "gain-reduction")).toBe(5);
    graph.previewEffectMix(effectId, 0.25);
    graph.previewEffectGain(effectId, -6);
    const expectedWet = Math.sin(Math.PI / 8);
    const expectedDry = Math.cos(Math.PI / 8);
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(
          ([value]) => Math.abs(value - expectedWet) < 1e-9,
        ),
      ),
    ).toBe(true);
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(
          ([value]) => Math.abs(value - expectedDry) < 1e-9,
        ),
      ),
    ).toBe(true);
    graph.previewSendReturnLevel(SEND_A, 0.2);
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0.2),
      ),
    ).toBe(true);
    graph.dispose();
  });

  it("rebuilds only the targeted chain and commits scalar edits on stable nodes", async () => {
    const stub = context();
    const scheduleParameter = vi.fn();
    const factory = vi.fn(() => {
      const port = node();
      return Promise.resolve({
        input: port as unknown as AudioNode,
        output: port as unknown as AudioNode,
        scheduleParameter,
        dispose: vi.fn(),
      });
    });
    const graph = new MixerRoutingGraph(stub.result, factory, FIRST);
    const channelEffectId = "20000000-0000-4000-8000-000000000010" as EffectInstanceId;
    const sendEffectId = "20000000-0000-4000-8000-000000000011" as EffectInstanceId;
    const masterEffectId = "20000000-0000-4000-8000-000000000012" as EffectInstanceId;
    const effect = (id: EffectInstanceId, pluginId: string) => ({
      id,
      pluginId: pluginId as PluginId,
      state: {},
      bypassed: false,
      mix: 0.5,
      gainDecibels: 0,
    });
    await graph.setChannel(FIRST, {
      level: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      sends: [],
      effects: [effect(channelEffectId, "distortion")],
      effectsBypassed: false,
    });
    await graph.setSend({
      busId: SEND_A,
      returnLevel: 0.8,
      effects: [effect(sendEffectId, "delay")],
      effectsBypassed: false,
    });
    await graph.setMaster({
      level: 0.8,
      effects: [effect(masterEffectId, "compressor")],
      effectsBypassed: false,
      limiterBypassed: false,
    });
    expect(factory).toHaveBeenCalledTimes(3);

    graph.setEffectParameter(sendEffectId, "feedback", 0.25);
    graph.setEffectMix(sendEffectId, 0.4);
    graph.setEffectGain(sendEffectId, -3);
    graph.setEffectBypassed(sendEffectId, true);
    graph.setSendReturnLevel(SEND_A, 0.3);
    expect(factory).toHaveBeenCalledTimes(3);
    expect(scheduleParameter).toHaveBeenCalledWith(0, "feedback", 0.25);

    await graph.setSendEffects(
      SEND_A,
      [effect(sendEffectId, "delay")],
      false,
    );
    expect(factory).toHaveBeenCalledTimes(4);
    graph.dispose();
  });

  it("reads gain reduction from the protected limiter by stable effect ID", async () => {
    const stub = context();
    const graph = new MixerRoutingGraph(stub.result, undefined, FIRST);
    const limiterId = "20000000-0000-4000-8000-000000000002" as EffectInstanceId;
    await graph.setMaster({
      level: 1,
      effects: [],
      effectsBypassed: false,
      limiterBypassed: false,
      limiterEffectId: limiterId,
    });
    expect(graph.getEffectMeter(limiterId, "gain-reduction")).toBe(3);
    const ceiling = 10 ** (-1 / 20);
    const shaper = stub.waveShapers[0];
    const ceilingGain = shaper?.connect.mock.calls[0]?.[0] as
      | (StubNode & { readonly gain: ReturnType<typeof parameter> })
      | undefined;
    expect(shaper).toBeDefined();
    expect(ceilingGain).toBeDefined();
    expect(shaper?.oversample).toBe("none");
    expect(
      stub.gains.filter((gain) =>
        gain.connect.mock.calls.some(([target]) => target === shaper),
      ),
    ).toHaveLength(1);
    expect(Math.max(...(shaper?.curve ?? [])) * (ceilingGain?.gain.value ?? 2))
      .toBeLessThanOrEqual(ceiling);
    graph.dispose();
  });

  it("schedules and clears protected limiter automation on exact audio frames", async () => {
    const stub = context();
    const graph = new MixerRoutingGraph(stub.result, undefined, FIRST);
    const limiterId = "20000000-0000-4000-8000-000000000003" as EffectInstanceId;
    await graph.setMaster({
      level: 1,
      effects: [],
      effectsBypassed: false,
      limiterBypassed: false,
      limiterEffectId: limiterId,
      limiterState: { ceiling: -1, input: 0, release: 80 },
      limiterMix: 1,
      limiterGainDecibels: 0,
    });
    const allocations = stub.gains.length;
    const programLimiter = stub.compressors[0] as StubNode & {
      readonly threshold: ReturnType<typeof parameter>;
      readonly release: ReturnType<typeof parameter>;
    };
    const ceilingGain = stub.waveShapers[0]?.connect.mock.calls[0]?.[0] as
      | (StubNode & { readonly gain: ReturnType<typeof parameter> })
      | undefined;
    if (ceilingGain === undefined) throw new Error("Expected the live ceiling gain.");

    graph.scheduleAutomation([
      { atFrame: 4_800, scope: "effect", targetId: limiterId, parameterId: "ceiling", value: -6 },
      { atFrame: 4_800, scope: "effect", targetId: limiterId, parameterId: "input", value: 12 },
      { atFrame: 4_800, scope: "effect", targetId: limiterId, parameterId: "release", value: 200 },
      { atFrame: 4_800, scope: "effect", targetId: limiterId, parameterId: "mix", value: 0.5 },
      { atFrame: 4_800, scope: "effect", targetId: limiterId, parameterId: "gain", value: -3 },
      { atFrame: 9_600, scope: "effect", targetId: limiterId, parameterId: "bypassed", value: true },
    ]);

    expect(stub.gains).toHaveLength(allocations);
    expect(programLimiter.threshold.setValueAtTime).toHaveBeenCalledWith(-1, 0.1);
    expect(programLimiter.threshold.linearRampToValueAtTime).toHaveBeenCalledWith(
      -6,
      0.1 + 0.008,
    );
    expect(programLimiter.release.setValueAtTime).toHaveBeenCalledWith(0.08, 0.1);
    expect(programLimiter.release.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.2,
      0.1 + 0.008,
    );
    expect(ceilingGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      10 ** (-6 / 20),
      0.1 + 0.008,
    );
    expect(
      stub.gains.some((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(
          ([value, time]) =>
            Math.abs(value - 10 ** (12 / 20)) < 1e-12 && time === 0.1 + 0.008,
        ),
      ),
    ).toBe(true);
    expect(
      stub.gains.filter((gain) =>
        gain.gain.setValueAtTime.mock.calls.some(([value, time]) => value === 0 && time === 0.2) &&
        gain.gain.linearRampToValueAtTime.mock.calls.some(
          ([value, time]) => value === 1 && time === 0.2 + 0.004,
        ),
      ),
    ).toHaveLength(1);

    graph.clearAutomation(4_800);
    expect(programLimiter.threshold.cancelScheduledValues).toHaveBeenCalledWith(0.1);
    expect(programLimiter.release.cancelScheduledValues).toHaveBeenCalledWith(0.1);
    expect(ceilingGain.gain.cancelScheduledValues).toHaveBeenCalledWith(0.1);
    for (const gain of stub.gains) gain.gain.setValueAtTime.mockClear();
    graph.scheduleAutomation([
      { atFrame: 9_600, scope: "effect", targetId: limiterId, parameterId: "mix", value: 0.25 },
      { atFrame: 9_600, scope: "effect", targetId: limiterId, parameterId: "gain", value: -6 },
    ]);
    const rescheduledStarts = stub.gains.flatMap((gain) => gain.gain.setValueAtTime.mock.calls)
      .filter(([, time]) => time === 0.2)
      .map(([value]) => value);
    expect(rescheduledStarts.some((value) => Math.abs(value) < 1e-12)).toBe(true);
    expect(rescheduledStarts.filter((value) => Math.abs(value - 1) < 1e-12).length).toBeGreaterThanOrEqual(2);
    graph.dispose();
  });

  it("builds a symmetric hard-ceiling curve for the live limiter", () => {
    const curve = createLimiterCeilingCurve(-1, 1025);
    const ceiling = 10 ** (-1 / 20);
    expect(Math.max(...curve)).toBeLessThanOrEqual(ceiling);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-ceiling);
    expect(curve[0]).toBeCloseTo(-ceiling, 6);
    expect(curve.at(-1)).toBeCloseTo(ceiling, 6);
  });

  it("switches displayed metering to the physical source and latches peak until reset", () => {
    const stub = context();
    const graph = new MixerRoutingGraph(stub.result, undefined, FIRST);
    const [left, right] = stub.analysers;
    if (left === undefined || right === undefined) throw new Error("Expected physical analysers.");
    left.getFloatTimeDomainData = (data) => {
      data.fill(0);
      data[0] = 0.99;
    };
    expect(graph.getMeter().peak).toBe(true);
    left.getFloatTimeDomainData = (data) => data.fill(0);
    expect(graph.getMeter().peak).toBe(true);
    graph.resetPeak();
    expect(graph.getMeter().peak).toBe(false);
    graph.dispose();
  });
});
