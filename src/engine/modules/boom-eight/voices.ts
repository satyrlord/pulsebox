/**
 * The Soft Thunder voice roster. Data only, so the manifest and the composition
 * root can name voices without importing the DSP core, which must execute only
 * inside an AudioWorklet.
 */

export const BOOM_VOICE_IDS = [
  "kick",
  "sub-kick",
  "snare",
  "rim",
  "low-tom",
  "high-tom",
  "closed-hat",
  "open-hat",
] as const;

export type BoomVoiceId = (typeof BOOM_VOICE_IDS)[number];

export const BOOM_VOICE_NAMES: Readonly<Record<BoomVoiceId, string>> = {
  kick: "Kick",
  "sub-kick": "Sub kick",
  snare: "Snare",
  rim: "Rim",
  "low-tom": "Low tom",
  "high-tom": "High tom",
  "closed-hat": "Closed hat",
  "open-hat": "Open hat",
};

/**
 * Note numbers select the voice, so one drum lane per voice needs no change to
 * the shared pattern model. The roster starts at C2.
 */
const BOOM_BASE_NOTE = 36;

export function boomVoiceNote(voiceId: BoomVoiceId): number {
  return BOOM_BASE_NOTE + BOOM_VOICE_IDS.indexOf(voiceId);
}

export function boomVoiceForNote(note: number): BoomVoiceId | undefined {
  return BOOM_VOICE_IDS[note - BOOM_BASE_NOTE];
}
