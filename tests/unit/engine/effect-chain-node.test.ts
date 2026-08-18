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
      mix: 1,
      gainDecibels: 0,
    }], false);
    for (const gain of stub.gains) {
      gain.setValueAtTime.mockClear();
      gain.linearRampToValueAtTime.mockClear();
    }

    chain.scheduleEffectMix(4_800, EFFECT, 0.25);
    chain.scheduleEffectGain(7_200, EFFECT, -6);
    chain.scheduleEffectBypass(9_600, EFFECT, true);
    chain.scheduleBypass(14_400, true);

    const calls = stub.gains.flatMap((gain) => gain.setValueAtTime.mock.calls);
    const ramps = stub.gains.flatMap((gain) => gain.linearRampToValueAtTime.mock.calls);
    expect(calls.some(([, time]) => Math.abs(time - 0.1) < 1e-12)).toBe(true);
    expect(calls.some(([, time]) => Math.abs(time - 0.15) < 1e-12)).toBe(true);
    expect(calls.some(([, time]) => Math.abs(time - 0.2) < 1e-12)).toBe(true);
    expect(calls.some(([, time]) => Math.abs(time - 0.3) < 1e-12)).toBe(true);
    expect(ramps.some(([, time]) => Math.abs(time - 0.104) < 1e-12)).toBe(true);
    expect(ramps.some(([, time]) => Math.abs(time - 0.204) < 1e-12)).toBe(true);
    expect(ramps.some(([, time]) => Math.abs(time - 0.304) < 1e-12)).toBe(true);
    chain.dispose();
  });

  it.each([44_100, 48_000])(
    "drops canceled future Mix and Gain mirrors at %i Hz",
    async (sampleRate) => {
      const stub = context();
      (stub.value as unknown as { sampleRate: number }).sampleRate = sampleRate;
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
        mix: 1,
        gainDecibels: 0,
      }], false);
      const firstFrame = Math.round(sampleRate * 0.1);
      const secondFrame = Math.round(sampleRate * 0.2);
      chain.scheduleEffectMix(firstFrame, EFFECT, 0.2);
      chain.scheduleEffectMix(secondFrame, EFFECT, 0.8);
      chain.scheduleEffectGain(firstFrame, EFFECT, -6);
      chain.scheduleEffectGain(secondFrame, EFFECT, 12);
      chain.clearAutomation(Math.round(sampleRate * 0.05));
      for (const gain of stub.gains) gain.setValueAtTime.mockClear();

      chain.scheduleEffectMix(firstFrame, EFFECT, 0.3);
      chain.scheduleEffectGain(firstFrame, EFFECT, -3);

      const starts = stub.gains.flatMap((gain) => gain.setValueAtTime.mock.calls)
        .filter(([, time]) => Math.abs(time - 0.1) < 1e-12)
        .map(([value]) => value);
      expect(starts.some((value) => Math.abs(value) < 1e-12)).toBe(true);
      expect(starts.filter((value) => Math.abs(value - 1) < 1e-12).length).toBeGreaterThanOrEqual(2);
      chain.dispose();
    },
  );
});
