/**
 * The engine does not yet publish a master meter frame, so the master strip
 * approximates one: the loudest instrument peak scaled by the master level.
 * The scaling is what makes the master fader visibly change its own meter. A
 * real summed master frame replaces this helper without touching its callers.
 */
export function masterMeterLevel(
  meterLevels: Readonly<Record<string, number>>,
  masterLevel: number,
): number {
  const peak = Math.max(0, ...Object.values(meterLevels));
  return Math.min(1, peak * Math.max(0, masterLevel));
}
