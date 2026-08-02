/**
 * Voice-roster lookup for the shipped instruments.
 *
 * Every drum module maps a note number to a voice, and every module needs an
 * audition pitch. Without one place to ask, the composition root would have to
 * branch on plugin ID to pick either, which section 6.5 forbids outside the
 * registry. This table is that one place: a module contributes its roster here
 * and the rack, the audition control, and the default project stay generic.
 *
 * Data only. It holds no DOM handle and no AudioNode, and it names no DSP, so
 * it stays outside the worklet-only rule that governs the DSP cores.
 */

import type { PluginId } from "../../contracts/parameters";
import { BOOM_VOICE_IDS, BOOM_VOICE_NAMES, boomVoiceNote } from "./boom-eight/voices";
import {
  DIGIT_FIVE_VOICE_IDS,
  DIGIT_FIVE_VOICE_NAMES,
  digitFiveVoiceNote,
} from "./digit-five/voices";
import {
  DIGIT_SEVEN_VOICE_IDS,
  DIGIT_SEVEN_VOICE_NAMES,
  digitSevenVoiceNote,
} from "./digit-seven/voices";
import { DRUM_VOICE_IDS, DRUM_VOICE_NAMES, drumVoiceNote } from "./drumline-six/voices";
import { HYBRID_VOICE_IDS, HYBRID_VOICE_NAMES, hybridVoiceNote } from "./hybrid-nine/voices";

interface VoiceRoster {
  /** Voice IDs in rack order. Empty for a pitched instrument. */
  readonly voiceIds: readonly string[];
  readonly nameFor: (voiceId: string) => string | undefined;
  /** Note number that sounds the given voice. */
  readonly noteFor: (voiceId: string) => number | undefined;
  /**
   * Note sounded when no voice is selected. Section 15.0 requires a drum module
   * to audition its selected voice and a pitched module a documented fixed
   * pitch, which is C2 for Silver Serpent.
   */
  readonly defaultAuditionNote: number;
}

function drumRoster<TVoiceId extends string>(
  // A non-empty tuple, so the first voice is present by type rather than by
  // assertion. Every roster below is a `as const` array, which satisfies this.
  voiceIds: readonly [TVoiceId, ...TVoiceId[]],
  names: Readonly<Record<TVoiceId, string>>,
  noteFor: (voiceId: TVoiceId) => number,
): VoiceRoster {
  const isVoiceId = (value: string): value is TVoiceId =>
    (voiceIds as readonly string[]).includes(value);
  return {
    voiceIds,
    nameFor: (voiceId) => (isVoiceId(voiceId) ? names[voiceId] : undefined),
    noteFor: (voiceId) => (isVoiceId(voiceId) ? noteFor(voiceId) : undefined),
    // The first voice is the kick on every shipped machine, which is the most
    // useful thing to hear when nothing is selected yet.
    defaultAuditionNote: noteFor(voiceIds[0]),
  };
}

const BASS_MONO_AUDITION_NOTE = 36;

const ROSTERS: Readonly<Record<string, VoiceRoster>> = {
  "bass-mono": {
    voiceIds: [],
    nameFor: () => undefined,
    noteFor: () => undefined,
    defaultAuditionNote: BASS_MONO_AUDITION_NOTE,
  },
  "drum-analog-small": drumRoster(DRUM_VOICE_IDS, DRUM_VOICE_NAMES, drumVoiceNote),
  "drum-analog-large": drumRoster(BOOM_VOICE_IDS, BOOM_VOICE_NAMES, boomVoiceNote),
  "drum-hybrid": drumRoster(HYBRID_VOICE_IDS, HYBRID_VOICE_NAMES, hybridVoiceNote),
  "drum-digital-a": drumRoster(DIGIT_SEVEN_VOICE_IDS, DIGIT_SEVEN_VOICE_NAMES, digitSevenVoiceNote),
  "drum-digital-b": drumRoster(DIGIT_FIVE_VOICE_IDS, DIGIT_FIVE_VOICE_NAMES, digitFiveVoiceNote),
};

function voiceRosterFor(pluginId: PluginId | string): VoiceRoster | undefined {
  return ROSTERS[pluginId];
}

function voiceNoteFor(
  pluginId: PluginId | string,
  voiceId: string | undefined,
): number | undefined {
  if (voiceId === undefined) return undefined;
  return voiceRosterFor(pluginId)?.noteFor(voiceId);
}

/**
 * The note an audition should sound: the selected voice when there is one, and
 * the module's documented default otherwise.
 */
export function auditionNoteFor(pluginId: PluginId | string, voiceId: string | undefined): number {
  const roster = voiceRosterFor(pluginId);
  if (roster === undefined) return BASS_MONO_AUDITION_NOTE;
  return voiceNoteFor(pluginId, voiceId) ?? roster.defaultAuditionNote;
}

/**
 * The notes a plugin can sound, or undefined when every note maps, as on a
 * pitched instrument. Section 14 swap keeps sequence data where event mapping
 * is valid and reports the rest; this set is what "valid" means for a drum
 * machine, whose voices each answer one note.
 */
export function playableNotesFor(pluginId: PluginId | string): ReadonlySet<number> | undefined {
  const roster = voiceRosterFor(pluginId);
  if (roster === undefined || roster.voiceIds.length === 0) return undefined;
  const notes = new Set<number>();
  for (const voiceId of roster.voiceIds) {
    const note = roster.noteFor(voiceId);
    if (note !== undefined) notes.add(note);
  }
  return notes;
}
