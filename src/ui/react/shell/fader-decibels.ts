/**
 * Shared decibel display conversion for level faders. Every level fader shows
 * dB while the stored value stays linear gain, so the mixer and the master
 * panel must use one conversion.
 */

export const MINIMUM_FADER_DB = -60;

export function gainToDecibels(gain: number): number {
  return gain <= 0 ? MINIMUM_FADER_DB : Math.max(MINIMUM_FADER_DB, 20 * Math.log10(gain));
}

export function decibelsToGain(decibels: number): number {
  return decibels <= MINIMUM_FADER_DB ? 0 : 10 ** (decibels / 20);
}
