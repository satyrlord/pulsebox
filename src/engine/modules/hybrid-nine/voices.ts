/**
 * The Twin Engine voice roster. Data only, so the manifest and the composition
 * root can name voices without importing the DSP core, which must execute only
 * inside an AudioWorklet.
 */

export const HYBRID_VOICE_IDS = [
  "kick",
  "snare",
  "clap",
  "rim",
  "low-tom",
  "high-tom",
  "closed-hat",
  "open-hat",
  "ride",
] as const;

export type HybridVoiceId = (typeof HYBRID_VOICE_IDS)[number];

export const HYBRID_VOICE_NAMES: Readonly<Record<HybridVoiceId, string>> = {
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  rim: "Rim",
  "low-tom": "Low tom",
  "high-tom": "High tom",
  "closed-hat": "Closed hat",
  "open-hat": "Open hat",
  ride: "Ride",
};

/**
 * Note numbers select the voice, so one drum lane per voice needs no change to
 * the shared pattern model. The roster starts at C2.
 */
const HYBRID_BASE_NOTE = 36;

export function hybridVoiceNote(voiceId: HybridVoiceId): number {
  return HYBRID_BASE_NOTE + HYBRID_VOICE_IDS.indexOf(voiceId);
}

export function hybridVoiceForNote(note: number): HybridVoiceId | undefined {
  return HYBRID_VOICE_IDS[note - HYBRID_BASE_NOTE];
}
