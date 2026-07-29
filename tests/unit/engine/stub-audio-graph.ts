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
  };
}
