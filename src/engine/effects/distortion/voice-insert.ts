/**
 * Fixed Drive-mode transfer for the first voice-insert effect. Module DSP
 * calls this only inside its AudioWorklet processor.
 */
const DRIVE = 3.2;
const OUTPUT_GAIN = 1 / DRIVE;

export function processDistortionVoiceInsert(input: number): number {
  if (!Number.isFinite(input)) return 0;
  // The reciprocal gain keeps the small-signal slope at unity. Because
  // |tanh(x)| never exceeds |x|, this mode cannot increase sample magnitude.
  return Math.tanh(input * DRIVE) * OUTPUT_GAIN;
}
