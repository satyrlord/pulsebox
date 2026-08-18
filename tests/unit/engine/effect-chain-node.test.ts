import { describe, expect, it, vi } from "vitest";

import type { EffectInstanceId } from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import { EffectChainNode } from "../../../src/engine/routing/effect-chain-node";

const EFFECT = "20000000-0000-4000-8000-000000000001" as EffectInstanceId;

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
  const gains: ReturnType<typeof parameter>[] = [];
  const value = {
    currentTime: 0,
    sampleRate: 48_000,
    createGain: vi.fn(() => {
      const gain = parameter();
      gains.push(gain);
      return node({ gain });
    }),
  };
  return { value: value as unknown as AudioContext, gains };
}

describe("effect chain scheduling", () => {
  it("starts effect and chain ramps at the target frame", async () => {
    const stub = context();
    const effectNode = node();
    const chain = new EffectChainNode(stub.value, () => Promise.resolve({
      input: effectNode as unknown as AudioNode,
      output: effectNode as unknown as AudioNode,
      dispose: vi.fn(),
    }));
    await chain.replace([{
      id: EFFECT,
      pluginId: "delay" as PluginId,
      state: {},
      bypassed: false,
      wetDry: 1,
      wetDryLaw: "linear",
    }], false);
    for (const gain of stub.gains) {
      gain.setValueAtTime.mockClear();
      gain.linearRampToValueAtTime.mockClear();
    }

    chain.scheduleEffectWetDry(4_800, EFFECT, 0.25);
    chain.scheduleEffectBypass(9_600, EFFECT, true);
    chain.scheduleBypass(14_400, true);

    const calls = stub.gains.flatMap((gain) => gain.setValueAtTime.mock.calls);
    const ramps = stub.gains.flatMap((gain) => gain.linearRampToValueAtTime.mock.calls);
    expect(calls.some(([, time]) => Math.abs(time - 0.1) < 1e-12)).toBe(true);
    expect(calls.some(([, time]) => Math.abs(time - 0.2) < 1e-12)).toBe(true);
    expect(calls.some(([, time]) => Math.abs(time - 0.3) < 1e-12)).toBe(true);
    expect(ramps.some(([, time]) => Math.abs(time - 0.104) < 1e-12)).toBe(true);
    expect(ramps.some(([, time]) => Math.abs(time - 0.204) < 1e-12)).toBe(true);
    expect(ramps.some(([, time]) => Math.abs(time - 0.304) < 1e-12)).toBe(true);
    chain.dispose();
  });
});
