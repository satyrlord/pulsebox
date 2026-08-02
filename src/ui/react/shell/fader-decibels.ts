/**
 * Shared decibel display conversion. Every gain-to-dB readout in the shell
 * uses this one conversion; only the floor differs by surface. Faders bottom
 * out at the fader floor, and the header meter readout uses its deeper one.
 */

export const MINIMUM_FADER_DB = -60;

export function gainToDecibels(gain: number, floor: number = MINIMUM_FADER_DB): number {
  return gain <= 0 ? floor : Math.max(floor, 20 * Math.log10(gain));
}

export function decibelsToGain(decibels: number): number {
  return decibels <= MINIMUM_FADER_DB ? 0 : 10 ** (decibels / 20);
}
