/**
 * Default project content (section 9.1), which the section 9.2 starter template
 * also creates. Data only: this module holds the original arranged-song data
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
  createSuppliedProjectState,
  DEFAULT_PROJECT_NAME,
  PATTERN_TICKS_PER_STEP,
  type DefaultEffectInstanceFactory,
  type PatternEventSeed,
  type PulseState,
  type SuppliedModuleSeed,
  type SuppliedPatternSeed,
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

type BassStep = readonly [number, number, number, ("a" | "s" | "as")?];

function bassLine(steps: readonly BassStep[]): readonly PatternEventSeed[] {
  return Object.freeze(
    steps.map(([step, note, velocity, flags]) =>
      Object.freeze({
        type: "note" as const,
        positionTicks: step * PATTERN_TICKS_PER_STEP,
        durationTicks: PATTERN_TICKS_PER_STEP,
        data: Object.freeze({
          note,
          velocity,
          accent: flags === "a" || flags === "as",
          slide: flags === "s" || flags === "as",
        }),
      }),
    ),
  );
}

/** Intro: a sparse D-minor pulse leaves space for the rhythm to enter. */
const introBass = bassLine([
  [0, 36, 0.9, "a"],
  [6, 36, 0.62],
  [8, 43, 0.7],
  [14, 39, 0.58, "s"],
]);

/** Verse: the original driving line establishes the main groove. */
const verseBass = bassLine([
  [0, 36, 0.92, "a"],
  [1, 36, 0.68],
  [2, 43, 0.68],
  [4, 36, 0.92],
  [5, 46, 0.68, "s"],
  [6, 43, 0.68],
  [8, 36, 0.92, "a"],
  [9, 39, 0.68],
  [10, 48, 0.68],
  [12, 36, 0.92],
  [13, 46, 0.68, "s"],
  [14, 39, 0.68],
]);

/** Break: a slower answer opens the middle of the arrangement. */
const breakBass = bassLine([
  [0, 36, 0.74, "a"],
  [4, 43, 0.62, "s"],
  [8, 34, 0.68],
  [12, 39, 0.58, "s"],
]);

/** Drop: the line fills every step and raises the section's energy. */
const dropBass = bassLine([
  [0, 36, 0.96, "a"],
  [1, 36, 0.68],
  [2, 43, 0.74, "s"],
  [3, 39, 0.66],
  [4, 36, 0.9, "a"],
  [5, 46, 0.74, "s"],
  [6, 43, 0.7],
  [7, 39, 0.66],
  [8, 36, 0.96, "a"],
  [9, 39, 0.7],
  [10, 48, 0.76, "s"],
  [11, 43, 0.68],
  [12, 36, 0.9, "a"],
  [13, 46, 0.74, "s"],
  [14, 39, 0.7],
  [15, 43, 0.62],
]);

/** Outro: the root pulse remains while the upper rhythm falls away. */
const outroBass = bassLine([
  [0, 36, 0.86, "a"],
  [8, 36, 0.72],
  [12, 43, 0.58],
  [14, 36, 0.5, "s"],
]);

// A drum module selects its voice by note number, so a drum pattern is an
// ordinary note pattern in the shared model. Section 9.1 requires an original
// coherent song, so each machine below plays one distinct role rather than
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

/** Verse drums: Tin Soldier keeps the backbeat. */
const verseDrumline = demoEvents(DRUM_BASE, [
  { voice: 0, steps: [0, 6, 10], velocity: 0.95 },
  { voice: 1, steps: [4, 12], velocity: 0.85 },
  { voice: 4, steps: [2, 14], velocity: 0.55 },
]);

/**
 * Soft Thunder adds weight on the downbeats and a tom fill at the turnaround.
 * Voice 1 is this machine's sub kick, which is the weight Tin Soldier has no
 * voice for. Voices 4 and 5 are its low and high toms.
 */
const verseBoom = demoEvents(DRUM_BASE, [
  { voice: 1, steps: [0, 8], velocity: 0.9 },
  { voice: 4, steps: [13], velocity: 0.7 },
  { voice: 5, steps: [15], velocity: 0.75 },
]);

/** Twin Engine carries the offbeat hat and a ride accent. */
const verseHybrid = demoEvents(DRUM_BASE, [
  { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.45 },
  { voice: 8, steps: [4, 12], velocity: 0.5 },
]);

/** Gray Ghost answers with a clap on the backbeat. */
const verseDigitSeven = demoEvents(DRUM_BASE, [
  { voice: 2, steps: [4, 12], velocity: 0.62 },
]);

/** Dusty Mosaic lays a shaker and clave pattern over the top. */
const verseDigitFive = demoEvents(DRUM_BASE, [
  { voice: 6, steps: [2, 6, 10, 14], velocity: 0.4 },
  { voice: 7, steps: [3, 11], velocity: 0.5 },
]);

const moduleSeed = (
  manifest: {
    readonly pluginId: PluginId;
    readonly acceptedEvents: readonly { readonly id: string }[];
    readonly voices: readonly { readonly id: string | VoiceId }[];
  },
  defaults: Readonly<Record<string, unknown>>,
): SuppliedModuleSeed => {
  const voiceIds = drumVoiceIdsFor(manifest);
  return {
    pluginId: manifest.pluginId,
    parameters: toParameterValues(defaults),
    ...(voiceIds.length > 0 ? { voiceIds } : {}),
  };
};

/** Section 9.1 rack order: six loaded modules, slots seven and eight empty. */
const DEFAULT_RACK: readonly SuppliedModuleSeed[] = [
  moduleSeed(BASS_MONO_MANIFEST, BASS_MONO_DEFAULT_PARAMETERS),
  moduleSeed(DRUMLINE_SIX_MANIFEST, DRUMLINE_SIX_DEFAULT_PARAMETERS),
  moduleSeed(BOOM_EIGHT_MANIFEST, BOOM_EIGHT_DEFAULT_PARAMETERS),
  moduleSeed(HYBRID_NINE_MANIFEST, HYBRID_NINE_DEFAULT_PARAMETERS),
  moduleSeed(DIGIT_SEVEN_MANIFEST, DIGIT_SEVEN_DEFAULT_PARAMETERS),
  moduleSeed(DIGIT_FIVE_MANIFEST, DIGIT_FIVE_DEFAULT_PARAMETERS),
];

const BASS = 0;
const TIN_SOLDIER = 1;
const SOFT_THUNDER = 2;
const TWIN_ENGINE = 3;
const GRAY_GHOST = 4;
const DUSTY_MOSAIC = 5;

const DEFAULT_PATTERNS: readonly SuppliedPatternSeed[] = [
  {
    name: "Intro",
    color: "#E6A23C",
    parts: {
      [BASS]: introBass,
      [TIN_SOLDIER]: demoEvents(DRUM_BASE, [
        { voice: 0, steps: [0, 8], velocity: 0.92 },
        { voice: 4, steps: [6, 14], velocity: 0.42 },
      ]),
      [SOFT_THUNDER]: demoEvents(DRUM_BASE, [{ voice: 1, steps: [0], velocity: 0.82 }]),
      [TWIN_ENGINE]: demoEvents(DRUM_BASE, [
        { voice: 6, steps: [3, 7, 11, 15], velocity: 0.32 },
      ]),
      [DUSTY_MOSAIC]: demoEvents(DRUM_BASE, [
        { voice: 6, steps: [2, 6, 10, 14], velocity: 0.28 },
      ]),
    },
  },
  {
    name: "Verse",
    color: "#F26D6D",
    parts: {
      [BASS]: verseBass,
      [TIN_SOLDIER]: verseDrumline,
      [SOFT_THUNDER]: verseBoom,
      [TWIN_ENGINE]: verseHybrid,
      [GRAY_GHOST]: verseDigitSeven,
      [DUSTY_MOSAIC]: verseDigitFive,
    },
  },
  {
    name: "Break",
    color: "#58B8F6",
    parts: {
      [BASS]: breakBass,
      [TIN_SOLDIER]: demoEvents(DRUM_BASE, [
        { voice: 1, steps: [4, 12], velocity: 0.62 },
        { voice: 4, steps: [2, 10], velocity: 0.36 },
      ]),
      [SOFT_THUNDER]: demoEvents(DRUM_BASE, [
        { voice: 4, steps: [0, 7], velocity: 0.64 },
        { voice: 5, steps: [3, 12, 15], velocity: 0.58 },
      ]),
      [TWIN_ENGINE]: demoEvents(DRUM_BASE, [
        { voice: 8, steps: [4, 12], velocity: 0.38 },
      ]),
      [GRAY_GHOST]: demoEvents(DRUM_BASE, [{ voice: 2, steps: [12], velocity: 0.45 }]),
      [DUSTY_MOSAIC]: demoEvents(DRUM_BASE, [
        { voice: 7, steps: [3, 7, 11, 15], velocity: 0.38 },
      ]),
    },
  },
  {
    name: "Drop",
    color: "#A87CFF",
    parts: {
      [BASS]: dropBass,
      [TIN_SOLDIER]: demoEvents(DRUM_BASE, [
        { voice: 0, steps: [0, 3, 6, 8, 10, 14], velocity: 0.98 },
        { voice: 1, steps: [4, 12], velocity: 0.9 },
        { voice: 4, steps: [2, 6, 10, 14], velocity: 0.58 },
      ]),
      [SOFT_THUNDER]: demoEvents(DRUM_BASE, [
        { voice: 1, steps: [0, 8], velocity: 0.92 },
        { voice: 4, steps: [13], velocity: 0.72 },
        { voice: 5, steps: [15], velocity: 0.78 },
      ]),
      [TWIN_ENGINE]: demoEvents(DRUM_BASE, [
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.5 },
        { voice: 8, steps: [0, 8], velocity: 0.52 },
      ]),
      [GRAY_GHOST]: demoEvents(DRUM_BASE, [
        { voice: 2, steps: [4, 12], velocity: 0.7 },
        { voice: 6, steps: [0, 8], velocity: 0.5 },
      ]),
      [DUSTY_MOSAIC]: demoEvents(DRUM_BASE, [
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.38 },
        { voice: 7, steps: [3, 11], velocity: 0.54 },
      ]),
    },
  },
  {
    name: "Outro",
    color: "#63C78F",
    parts: {
      [BASS]: outroBass,
      [TIN_SOLDIER]: demoEvents(DRUM_BASE, [
        { voice: 0, steps: [0, 8], velocity: 0.88 },
        { voice: 1, steps: [4], velocity: 0.58 },
      ]),
      [SOFT_THUNDER]: demoEvents(DRUM_BASE, [{ voice: 1, steps: [0], velocity: 0.75 }]),
      [TWIN_ENGINE]: demoEvents(DRUM_BASE, [
        { voice: 6, steps: [3, 7, 11, 15], velocity: 0.3 },
      ]),
      [DUSTY_MOSAIC]: demoEvents(DRUM_BASE, [
        { voice: 6, steps: [2, 6, 10, 14], velocity: 0.25 },
      ]),
    },
  },
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
  return createSuppliedProjectState(
    idFactory,
    {
      name: DEFAULT_PROJECT_NAME,
      tempo: 128,
      modules: DEFAULT_RACK,
      patterns: DEFAULT_PATTERNS,
      activePattern: 1,
      song: {
        enabled: true,
        placements: [
          { pattern: 0, repeatCount: 8 },
          { pattern: 1, repeatCount: 16 },
          { pattern: 2, repeatCount: 8 },
          { pattern: 3, repeatCount: 16 },
          { pattern: 4, repeatCount: 8 },
        ],
      },
    },
    undefined,
    createEffectInstance,
  );
}
