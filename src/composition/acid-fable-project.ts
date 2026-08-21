/**
 * The supplied demo song `Acid Fable` (section 9.3), which the second built-in
 * template creates. Data only: this module holds the original song note data,
 * the rack seed list, the mixer balance, and the automation lanes, so unit
 * tests can assert the section 9.3 contract without mounting the application.
 * All note data below is original and hand-authored; none of it is copied from
 * any existing pattern, preset, or recording.
 */

import { SEND_BUS_IDS, type IdFactory } from "../contracts/ids";
import type { ParameterValue } from "../contracts/parameters";
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
  PATTERN_TICKS_PER_STEP,
  type DefaultEffectInstanceFactory,
  type PatternEventSeed,
  type PulseState,
  type SuppliedAutomationSeed,
  type SuppliedModuleSeed,
  type SuppliedPatternSeed,
} from "../state/public";
import { drumVoiceIdsFor, toParameterValues } from "./default-project";

export const ACID_FABLE_PROJECT_NAME = "Acid Fable";
export const ACID_FABLE_TEMPO = 134;

/** One pitched step: step, note, velocity, and optional accent or slide flags. */
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

interface DrumHit {
  /**
   * Voice index into the target machine's own roster. Every roster starts at
   * the same base note but lists different voices, so the same index names a
   * different drum on each machine. Read the machine's `voices.ts` before you
   * change a number here.
   */
  readonly voice: number;
  readonly steps: readonly number[];
  readonly velocity: number;
}

// Every shipped machine's roster starts at the kick's note. The manifest
// declares it.
const DRUM_BASE = auditionNoteFor(DRUMLINE_SIX_MANIFEST, "kick");

function drumHits(hits: readonly DrumHit[]): readonly PatternEventSeed[] {
  return Object.freeze(
    hits.flatMap((hit) =>
      hit.steps.map((step) =>
        Object.freeze({
          type: "trigger" as const,
          positionTicks: step * PATTERN_TICKS_PER_STEP,
          data: Object.freeze({
            note: DRUM_BASE + hit.voice,
            velocity: hit.velocity,
            accent: step % 8 === 0,
            slide: false,
          }),
        }),
      ),
    ),
  );
}

// --- The story, told in A minor around A1 (note 33). ---

/** Once Upon: the low serpent wakes with a sparse root pulse. */
const introBass = bassLine([
  [0, 33, 0.9, "a"],
  [3, 33, 0.6],
  [6, 33, 0.66],
  [8, 33, 0.9, "a"],
  [11, 45, 0.55, "s"],
  [12, 33, 0.72],
  [14, 31, 0.6],
]);

/** First Steps and The Serpent: the driving main line with slides and accents. */
const mainBass = bassLine([
  [0, 33, 0.95, "a"],
  [1, 33, 0.6],
  [2, 45, 0.72, "s"],
  [3, 33, 0.6],
  [4, 36, 0.78, "a"],
  [5, 33, 0.58],
  [6, 40, 0.7, "s"],
  [7, 38, 0.6],
  [8, 33, 0.95, "a"],
  [9, 33, 0.6],
  [10, 45, 0.72],
  [11, 43, 0.64, "s"],
  [12, 36, 0.78, "a"],
  [13, 31, 0.6],
  [14, 33, 0.7],
  [15, 45, 0.55, "s"],
]);

/** Deep Woods: the line slows into long slides. */
const breakBass = bassLine([
  [0, 33, 0.7],
  [3, 40, 0.6, "s"],
  [4, 38, 0.62],
  [7, 36, 0.55, "s"],
  [8, 33, 0.7],
  [11, 45, 0.5, "s"],
  [12, 43, 0.55, "s"],
  [14, 40, 0.5],
]);

/** Full Cry: every step lands; the fable reaches its loudest page. */
const dropBass = bassLine([
  [0, 33, 0.98, "a"],
  [1, 33, 0.6],
  [2, 45, 0.7, "s"],
  [3, 33, 0.74, "a"],
  [4, 36, 0.66],
  [5, 33, 0.6],
  [6, 45, 0.7, "s"],
  [7, 40, 0.62],
  [8, 33, 0.98, "a"],
  [9, 33, 0.6],
  [10, 48, 0.72, "s"],
  [11, 43, 0.74, "a"],
  [12, 36, 0.66],
  [13, 31, 0.6],
  [14, 45, 0.78, "a"],
  [15, 45, 0.55, "s"],
]);

/** Ever After: the pulse thins back to the root. */
const outroBass = bassLine([
  [0, 33, 0.85, "a"],
  [6, 33, 0.6],
  [8, 33, 0.8],
  [12, 45, 0.5, "s"],
  [14, 33, 0.55],
]);

/** The high serpent answers offbeat, one octave and a fifth above. */
const serpentHigh = bassLine([
  [2, 57, 0.6],
  [6, 60, 0.55, "s"],
  [7, 57, 0.5],
  [10, 57, 0.62],
  [14, 64, 0.5, "s"],
  [15, 62, 0.45],
]);

const breakHigh = bassLine([
  [4, 69, 0.4, "s"],
  [5, 67, 0.38],
  [12, 64, 0.4, "s"],
  [13, 62, 0.35],
]);

const dropHigh = bassLine([
  [1, 57, 0.6],
  [3, 57, 0.5],
  [5, 60, 0.6, "s"],
  [6, 57, 0.5],
  [9, 57, 0.62],
  [11, 64, 0.55, "s"],
  [12, 62, 0.5],
  [15, 57, 0.45],
]);

// Module indexes into the rack below.
const LOW_SERPENT = 0;
const HIGH_SERPENT = 1;
const TIN_SOLDIER = 2;
const SOFT_THUNDER = 3;
const TWIN_ENGINE = 4;
const GRAY_GHOST = 5;
const DUSTY_MOSAIC = 6;

/** A bar-long cutoff rise on the low serpent. The lane replays every bar. */
const serpentSweep: SuppliedAutomationSeed = {
  module: LOW_SERPENT,
  parameterId: "cutoff",
  steps: [480, 640, 840, 1080, 1360, 1700, 2100, 2600].map((value, index) => ({
    step: index * 2,
    value,
  })),
};

/** The drop sweep peaks mid-bar and falls back. */
const fullCrySweep: SuppliedAutomationSeed = {
  module: LOW_SERPENT,
  parameterId: "cutoff",
  steps: [900, 1500, 2200, 2900, 3400, 2600, 1800, 1200].map((value, index) => ({
    step: index * 2,
    value,
  })),
};

const PATTERNS: readonly SuppliedPatternSeed[] = [
  {
    name: "Once Upon",
    color: "#63C78F",
    parts: {
      [LOW_SERPENT]: introBass,
      [TIN_SOLDIER]: drumHits([
        { voice: 0, steps: [0, 4, 8, 12], velocity: 0.95 },
        { voice: 4, steps: [2, 6, 10, 14], velocity: 0.5 },
      ]),
      [DUSTY_MOSAIC]: drumHits([
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.35 },
      ]),
    },
  },
  {
    name: "First Steps",
    color: "#E6A23C",
    parts: {
      [LOW_SERPENT]: mainBass,
      [TIN_SOLDIER]: drumHits([
        { voice: 0, steps: [0, 4, 8, 12], velocity: 0.95 },
        { voice: 4, steps: [2, 6, 10, 14], velocity: 0.55 },
        { voice: 2, steps: [7, 15], velocity: 0.4 },
      ]),
      [SOFT_THUNDER]: drumHits([{ voice: 1, steps: [0, 8], velocity: 0.85 }]),
      [TWIN_ENGINE]: drumHits([
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.4 },
      ]),
      [GRAY_GHOST]: drumHits([{ voice: 2, steps: [4, 12], velocity: 0.6 }]),
      [DUSTY_MOSAIC]: drumHits([
        { voice: 6, steps: [2, 6, 10, 14], velocity: 0.35 },
        { voice: 7, steps: [3, 11], velocity: 0.45 },
      ]),
    },
  },
  {
    name: "The Serpent",
    color: "#F2D530",
    parts: {
      [LOW_SERPENT]: mainBass,
      [HIGH_SERPENT]: serpentHigh,
      [TIN_SOLDIER]: drumHits([
        { voice: 0, steps: [0, 4, 8, 12], velocity: 0.95 },
        { voice: 4, steps: [2, 6, 10, 14], velocity: 0.55 },
      ]),
      [SOFT_THUNDER]: drumHits([
        { voice: 1, steps: [0, 8], velocity: 0.85 },
        { voice: 5, steps: [15], velocity: 0.6 },
      ]),
      [TWIN_ENGINE]: drumHits([
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.45 },
        { voice: 7, steps: [10], velocity: 0.5 },
      ]),
      [GRAY_GHOST]: drumHits([{ voice: 2, steps: [4, 12], velocity: 0.62 }]),
      [DUSTY_MOSAIC]: drumHits([
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.32 },
        { voice: 7, steps: [3, 11], velocity: 0.45 },
      ]),
    },
    automation: [serpentSweep],
  },
  {
    name: "Deep Woods",
    color: "#58B8F6",
    parts: {
      [LOW_SERPENT]: breakBass,
      [HIGH_SERPENT]: breakHigh,
      [TIN_SOLDIER]: drumHits([{ voice: 5, steps: [8], velocity: 0.45 }]),
      [SOFT_THUNDER]: drumHits([
        { voice: 4, steps: [0, 7], velocity: 0.6 },
        { voice: 5, steps: [3, 12], velocity: 0.5 },
      ]),
      [TWIN_ENGINE]: drumHits([{ voice: 8, steps: [2, 6, 10, 14], velocity: 0.4 }]),
      [DUSTY_MOSAIC]: drumHits([
        { voice: 3, steps: [1, 4, 9, 12], velocity: 0.5 },
        { voice: 4, steps: [6, 14], velocity: 0.45 },
        { voice: 5, steps: [10], velocity: 0.4 },
      ]),
    },
  },
  {
    name: "Full Cry",
    color: "#F26D6D",
    parts: {
      [LOW_SERPENT]: dropBass,
      [HIGH_SERPENT]: dropHigh,
      [TIN_SOLDIER]: drumHits([
        { voice: 0, steps: [0, 4, 8, 12], velocity: 0.98 },
        { voice: 1, steps: [4, 12], velocity: 0.8 },
        { voice: 4, steps: [2, 6, 10, 14], velocity: 0.6 },
      ]),
      [SOFT_THUNDER]: drumHits([
        { voice: 1, steps: [0, 8], velocity: 0.9 },
        { voice: 4, steps: [13], velocity: 0.65 },
        { voice: 5, steps: [15], velocity: 0.7 },
      ]),
      [TWIN_ENGINE]: drumHits([
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.5 },
        { voice: 7, steps: [10], velocity: 0.55 },
        { voice: 8, steps: [0, 8], velocity: 0.45 },
      ]),
      [GRAY_GHOST]: drumHits([
        { voice: 2, steps: [4, 12], velocity: 0.68 },
        { voice: 6, steps: [0], velocity: 0.6 },
      ]),
      [DUSTY_MOSAIC]: drumHits([
        { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.35 },
        { voice: 7, steps: [3, 11], velocity: 0.5 },
        { voice: 5, steps: [7], velocity: 0.4 },
      ]),
    },
    automation: [fullCrySweep],
  },
  {
    name: "Ever After",
    color: "#A87CFF",
    parts: {
      [LOW_SERPENT]: outroBass,
      [TIN_SOLDIER]: drumHits([
        { voice: 0, steps: [0, 4, 8, 12], velocity: 0.9 },
        { voice: 4, steps: [2, 10], velocity: 0.4 },
      ]),
      [TWIN_ENGINE]: drumHits([{ voice: 8, steps: [0], velocity: 0.35 }]),
      [DUSTY_MOSAIC]: drumHits([{ voice: 6, steps: [3, 7, 11, 15], velocity: 0.3 }]),
    },
  },
];

const moduleSeed = (
  manifest: Parameters<typeof drumVoiceIdsFor>[0] & {
    readonly pluginId: SuppliedModuleSeed["pluginId"];
  },
  defaults: Readonly<Record<string, unknown>>,
  options?: {
    readonly parameters?: Readonly<Record<string, ParameterValue>>;
    readonly level?: number;
    readonly pan?: number;
    readonly sends?: SuppliedModuleSeed["sends"];
  },
): SuppliedModuleSeed => {
  const voiceIds = drumVoiceIdsFor(manifest);
  return {
    pluginId: manifest.pluginId,
    parameters: { ...toParameterValues(defaults), ...options?.parameters },
    ...(voiceIds.length > 0 ? { voiceIds } : {}),
    ...(options?.level === undefined ? {} : { level: options.level }),
    ...(options?.pan === undefined ? {} : { pan: options.pan }),
    ...(options?.sends === undefined ? {} : { sends: options.sends }),
  };
};

const [SEND_A, SEND_B] = SEND_BUS_IDS;

/** Section 9.3 rack order: seven loaded modules, slot eight empty. */
const ACID_FABLE_RACK: readonly SuppliedModuleSeed[] = [
  // The low serpent leads: a darker saw with a hotter filter envelope.
  moduleSeed(BASS_MONO_MANIFEST, BASS_MONO_DEFAULT_PARAMETERS, {
    parameters: {
      cutoff: 640,
      resonance: 0.66,
      "envelope-amount": 0.72,
      decay: 0.24,
      "accent-amount": 0.62,
      glide: 0.1,
    },
    sends: { [SEND_A]: 0.22 },
  }),
  // The high serpent answers: a quieter square, panned right, echo-heavy.
  moduleSeed(BASS_MONO_MANIFEST, BASS_MONO_DEFAULT_PARAMETERS, {
    parameters: {
      waveform: "square",
      cutoff: 1400,
      resonance: 0.5,
      "envelope-amount": 0.55,
      decay: 0.18,
      "accent-amount": 0.5,
      glide: 0.06,
      volume: 0.55,
    },
    level: 0.3,
    pan: 0.2,
    sends: { [SEND_A]: 0.35 },
  }),
  moduleSeed(DRUMLINE_SIX_MANIFEST, DRUMLINE_SIX_DEFAULT_PARAMETERS),
  moduleSeed(BOOM_EIGHT_MANIFEST, BOOM_EIGHT_DEFAULT_PARAMETERS),
  moduleSeed(HYBRID_NINE_MANIFEST, HYBRID_NINE_DEFAULT_PARAMETERS),
  moduleSeed(DIGIT_SEVEN_MANIFEST, DIGIT_SEVEN_DEFAULT_PARAMETERS, {
    sends: { [SEND_B]: 0.3 },
  }),
  moduleSeed(DIGIT_FIVE_MANIFEST, DIGIT_FIVE_DEFAULT_PARAMETERS, {
    pan: -0.15,
    sends: { [SEND_B]: 0.18 },
  }),
];

/**
 * The section 9.3 supplied demo song. The second built-in template creates a
 * fresh copy of this project. Each call produces new project, lineage, module,
 * Pattern, and lane IDs.
 */
export function createAcidFableProjectState(
  idFactory: IdFactory,
  createEffectInstance?: DefaultEffectInstanceFactory,
): PulseState {
  return createSuppliedProjectState(
    idFactory,
    {
      name: ACID_FABLE_PROJECT_NAME,
      tempo: ACID_FABLE_TEMPO,
      modules: ACID_FABLE_RACK,
      patterns: PATTERNS,
      activePattern: 2,
      song: {
        enabled: true,
        placements: [
          { pattern: 0, repeatCount: 4 },
          { pattern: 1, repeatCount: 8 },
          { pattern: 2, repeatCount: 8 },
          { pattern: 3, repeatCount: 4 },
          { pattern: 4, repeatCount: 16 },
          { pattern: 5, repeatCount: 4 },
        ],
      },
    },
    undefined,
    createEffectInstance,
  );
}
