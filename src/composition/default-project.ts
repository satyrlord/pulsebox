/**
 * Default project content (section 9.1), which the section 9.2 starter template
 * also creates. Data only: this module holds the original demo-loop note data
 * and the rack seed list, so unit tests can assert the section 9 contract
 * without mounting the application. All note data below is original and
 * hand-authored; none of it is copied from any existing pattern, preset, or
 * recording.
 */

import type { IdFactory, VoiceId } from "../contracts/ids";
import type { ParameterValue, PluginId } from "../contracts/parameters";
import {
  BASS_MONO_DEFAULT_PARAMETERS,
  BASS_MONO_MANIFEST,
  BOOM_EIGHT_DEFAULT_PARAMETERS,
  BOOM_EIGHT_MANIFEST,
  DIGIT_FIVE_DEFAULT_PARAMETERS,
  DIGIT_FIVE_MANIFEST,
  DIGIT_SEVEN_DEFAULT_PARAMETERS,
  DIGIT_SEVEN_MANIFEST,
  DRUMLINE_SIX_DEFAULT_PARAMETERS,
  DRUMLINE_SIX_MANIFEST,
  HYBRID_NINE_DEFAULT_PARAMETERS,
  HYBRID_NINE_MANIFEST,
  auditionNoteFor,
} from "../engine/public";
import {
  createDefaultState,
  PATTERN_TICKS_PER_STEP,
  type DefaultEffectInstanceFactory,
  type ModuleSeed,
  type PatternEventSeed,
  type PulseState,
} from "../state/public";

/**
 * Narrows a manifest's default-parameter record to the serializable scalars a
 * ModuleSeed carries. The composition root shares this helper for its registry
 * seeds.
 */
export function toParameterValues(
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, ParameterValue>> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, ParameterValue] => {
      const value = entry[1];
      return (
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean" ||
        typeof value === "string"
      );
    }),
  );
}

export function drumVoiceIdsFor(manifest: {
  readonly acceptedEvents: readonly { readonly id: string }[];
  readonly voices: readonly { readonly id: string | VoiceId }[];
}): readonly VoiceId[] {
  if (manifest.acceptedEvents.some((event) => event.id === "note")) return [];
  return manifest.voices.map((voice) => voice.id as VoiceId);
}

/** The default project's Silver Serpent line: a driving sixteenth run with slides. */
const bassMonoEvents: readonly PatternEventSeed[] = Object.freeze(
  [36, 36, 43, 39, 36, 46, 43, 39, 36, 39, 48, 43, 36, 46, 39, 43].flatMap(
    (note, index) =>
      index % 4 === 3
        ? []
        : [
            Object.freeze({
              type: "note" as const,
              positionTicks: index * PATTERN_TICKS_PER_STEP,
              durationTicks: PATTERN_TICKS_PER_STEP,
              data: Object.freeze({
                note,
                velocity: index % 4 === 0 ? 0.92 : 0.68,
                accent: index % 8 === 0,
                slide: index === 5 || index === 13,
              }),
            }),
          ],
  ),
);

// A drum module selects its voice by note number, so a drum pattern is an
// ordinary note pattern in the shared model. Section 9.1 requires an original
// coherent demo loop, so each machine below plays one distinct role rather than
// every machine restating the same backbeat.
interface DemoHit {
  /**
   * Voice index into the target machine's own roster. Every roster starts at
   * the same base note but lists different voices, so the same index names a
   * different drum on each machine. Read the machine's `voices.ts` before you
   * change a number here.
   */
  readonly voice: number;
  readonly steps: readonly number[];
  readonly velocity?: number;
}

function demoEvents(baseNote: number, hits: readonly DemoHit[]): readonly PatternEventSeed[] {
  return Object.freeze(
    hits.flatMap((hit) =>
      hit.steps.map((step) =>
        Object.freeze({
          type: "trigger" as const,
          positionTicks: step * PATTERN_TICKS_PER_STEP,
          data: Object.freeze({
            note: baseNote + hit.voice,
            velocity: hit.velocity ?? 0.7,
            accent: step % 8 === 0,
            slide: false,
          }),
        }),
      ),
    ),
  );
}

// Every shipped machine's roster starts at the kick's note, so one base note
// serves each demo pattern below. The manifest declares it.
const DRUM_BASE = auditionNoteFor(DRUMLINE_SIX_MANIFEST, "kick");

/** Tin Soldier keeps the backbeat: kick, snare, and a closed-hat pulse. */
const drumlineEvents = demoEvents(DRUM_BASE, [
  { voice: 0, steps: [0, 6, 10], velocity: 0.95 },
  { voice: 1, steps: [4, 12], velocity: 0.85 },
  { voice: 4, steps: [2, 14], velocity: 0.55 },
]);

/**
 * Soft Thunder adds weight on the downbeats and a tom fill at the turnaround.
 * Voice 1 is this machine's sub kick, which is the weight Tin Soldier has no
 * voice for. Voices 4 and 5 are its low and high toms.
 */
const boomEvents = demoEvents(DRUM_BASE, [
  { voice: 1, steps: [0, 8], velocity: 0.9 },
  { voice: 4, steps: [13], velocity: 0.7 },
  { voice: 5, steps: [15], velocity: 0.75 },
]);

/** Twin Engine carries the offbeat hat and a ride accent. */
const hybridEvents = demoEvents(DRUM_BASE, [
  { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.45 },
  { voice: 8, steps: [4, 12], velocity: 0.5 },
]);

/** Gray Ghost answers with a clap on the backbeat. */
const digitSevenEvents = demoEvents(DRUM_BASE, [
  { voice: 2, steps: [4, 12], velocity: 0.62 },
]);

/** Dusty Mosaic lays a shaker and clave pattern over the top. */
const digitFiveEvents = demoEvents(DRUM_BASE, [
  { voice: 6, steps: [2, 6, 10, 14], velocity: 0.4 },
  { voice: 7, steps: [3, 11], velocity: 0.5 },
]);

const seedFor = (
  manifest: {
    readonly pluginId: PluginId;
    readonly acceptedEvents: readonly { readonly id: string }[];
    readonly voices: readonly { readonly id: string | VoiceId }[];
  },
  defaults: Readonly<Record<string, unknown>>,
  events: ModuleSeed["events"],
): ModuleSeed => {
  const voiceIds = drumVoiceIdsFor(manifest);
  return {
    pluginId: manifest.pluginId,
    parameters: toParameterValues(defaults),
    events,
    ...(voiceIds.length > 0 ? { voiceIds } : {}),
  };
};

/** Section 9.1 rack order: six loaded modules, slots seven and eight empty. */
const DEFAULT_RACK: readonly ModuleSeed[] = [
  seedFor(BASS_MONO_MANIFEST, BASS_MONO_DEFAULT_PARAMETERS, bassMonoEvents),
  seedFor(DRUMLINE_SIX_MANIFEST, DRUMLINE_SIX_DEFAULT_PARAMETERS, drumlineEvents),
  seedFor(BOOM_EIGHT_MANIFEST, BOOM_EIGHT_DEFAULT_PARAMETERS, boomEvents),
  seedFor(HYBRID_NINE_MANIFEST, HYBRID_NINE_DEFAULT_PARAMETERS, hybridEvents),
  seedFor(DIGIT_SEVEN_MANIFEST, DIGIT_SEVEN_DEFAULT_PARAMETERS, digitSevenEvents),
  seedFor(DIGIT_FIVE_MANIFEST, DIGIT_FIVE_DEFAULT_PARAMETERS, digitFiveEvents),
];

/**
 * The section 9.1 default project. Section 9.2 defines the built-in starter
 * template as a fresh copy of this project, so the template calls this same
 * factory. Each call produces new project, lineage, and module IDs.
 */
export function createDefaultProjectState(
  idFactory: IdFactory,
  createEffectInstance?: DefaultEffectInstanceFactory,
): PulseState {
  return createDefaultState(idFactory, DEFAULT_RACK, undefined, createEffectInstance);
}
