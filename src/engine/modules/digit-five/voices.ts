/**
 * The Digit Five voice roster. Data only, so the manifest and the composition
 * root can name voices without importing the DSP core, which must execute only
 * inside an AudioWorklet.
 *
 * Section 15.7 makes this the digital machine with percussion, so the roster
 * trades a second cymbal for tuned percussion voices.
 */

export const DIGIT_FIVE_VOICE_IDS = [
  "kick",
  "snare",
  "hat",
  "conga",
  "bongo",
  "cowbell",
  "shaker",
  "clave",
] as const;

export type DigitFiveVoiceId = (typeof DIGIT_FIVE_VOICE_IDS)[number];

export const DIGIT_FIVE_VOICE_NAMES: Readonly<Record<DigitFiveVoiceId, string>> = {
  kick: "Kick",
  snare: "Snare",
  hat: "Hat",
  conga: "Conga",
  bongo: "Bongo",
  cowbell: "Cowbell",
  shaker: "Shaker",
  clave: "Clave",
};

/**
 * Note numbers select the voice, so one drum lane per voice needs no change to
 * the shared pattern model. The roster starts at C1.
 */
export const DIGIT_FIVE_BASE_NOTE = 36;

export function digitFiveVoiceNote(voiceId: DigitFiveVoiceId): number {
  return DIGIT_FIVE_BASE_NOTE + DIGIT_FIVE_VOICE_IDS.indexOf(voiceId);
}

export function digitFiveVoiceForNote(note: number): DigitFiveVoiceId | undefined {
  return DIGIT_FIVE_VOICE_IDS[note - DIGIT_FIVE_BASE_NOTE];
}
