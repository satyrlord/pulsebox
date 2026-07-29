/**
 * The Drumline Six voice roster. Data only, so the manifest and the composition
 * root can name voices without importing the DSP core, which must execute only
 * inside an AudioWorklet.
 */

export const DRUM_VOICE_IDS = ["kick", "snare", "rim", "clap", "closed-hat", "open-hat"] as const;

export type DrumVoiceId = (typeof DRUM_VOICE_IDS)[number];

export const DRUM_VOICE_NAMES: Readonly<Record<DrumVoiceId, string>> = {
  kick: "Kick",
  snare: "Snare",
  rim: "Rim",
  clap: "Clap",
  "closed-hat": "Closed hat",
  "open-hat": "Open hat",
};

/**
 * Note numbers select the voice, so one drum lane per voice needs no change to
 * the shared pattern model. The roster starts at C1.
 */
export const DRUM_BASE_NOTE = 36;

export function drumVoiceNote(voiceId: DrumVoiceId): number {
  return DRUM_BASE_NOTE + DRUM_VOICE_IDS.indexOf(voiceId);
}

export function drumVoiceForNote(note: number): DrumVoiceId | undefined {
  return DRUM_VOICE_IDS[note - DRUM_BASE_NOTE];
}
