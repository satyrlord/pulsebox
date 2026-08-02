/**
 * The Gray Ghost voice roster. Data only, so the manifest and the composition
 * root can name voices without importing the DSP core, which must execute only
 * inside an AudioWorklet.
 */

export const DIGIT_SEVEN_VOICE_IDS = [
  "kick",
  "snare",
  "clap",
  "tom",
  "closed-hat",
  "open-hat",
  "crash",
] as const;

export type DigitSevenVoiceId = (typeof DIGIT_SEVEN_VOICE_IDS)[number];

export const DIGIT_SEVEN_VOICE_NAMES: Readonly<Record<DigitSevenVoiceId, string>> = {
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  tom: "Tom",
  "closed-hat": "Closed hat",
  "open-hat": "Open hat",
  crash: "Crash",
};

/**
 * Note numbers select the voice, so one drum lane per voice needs no change to
 * the shared pattern model. The roster starts at C2.
 */
const DIGIT_SEVEN_BASE_NOTE = 36;

export function digitSevenVoiceNote(voiceId: DigitSevenVoiceId): number {
  return DIGIT_SEVEN_BASE_NOTE + DIGIT_SEVEN_VOICE_IDS.indexOf(voiceId);
}

export function digitSevenVoiceForNote(note: number): DigitSevenVoiceId | undefined {
  return DIGIT_SEVEN_VOICE_IDS[note - DIGIT_SEVEN_BASE_NOTE];
}
