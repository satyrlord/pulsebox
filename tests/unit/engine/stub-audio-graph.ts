import { vi } from "vitest";

/**
 * The mixer nodes a `TransportRuntime` builds around every voice. Tests that
 * stand up a runtime need these on their stub context, because a voice is always
 * routed through its channel rather than straight to the destination.
 */
export function stubAudioParam() {
  return {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

export function stubMixerNodes() {
  return {
    createGain: vi.fn(() => ({ gain: stubAudioParam(), connect: vi.fn(), disconnect: vi.fn() })),
    createStereoPanner: vi.fn(() => ({
      pan: stubAudioParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    // The master chain: protective limiter plus the non-audible analysis branch.
    createDynamicsCompressor: vi.fn(() => ({
      threshold: stubAudioParam(),
      knee: stubAudioParam(),
      ratio: stubAudioParam(),
      attack: stubAudioParam(),
      release: stubAudioParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createChannelSplitter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser: vi.fn(() => ({
      fftSize: 2048,
      smoothingTimeConstant: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((data: Float32Array) => {
        data.fill(0);
      }),
    })),
    createOscillator: vi.fn(() => ({
      frequency: stubAudioParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    })),
  };
}
