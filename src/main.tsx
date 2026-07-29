import {
  browserIdFactory,
  type ModuleInstanceId,
  type PluginId,
  type ProjectRevision,
} from "./contracts";
import {
  ACID_BASS_DEFAULT_PARAMETERS,
  ACID_BASS_MANIFEST,
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
  TransportRuntime,
  auditionNoteFor,
  createBassVoiceAdapter,
  createBoomVoiceAdapter,
  createDigitFiveVoiceAdapter,
  createDigitSevenVoiceAdapter,
  createDrumlineVoiceAdapter,
  createHybridVoiceAdapter,
  createPluginRegistry,
  drumVoiceNote,
  type TransportModule,
  type VoiceAdapterFactory,
} from "./engine/public";
import {
  createAutosave,
  commitPortableProjectImport,
  createDefaultState,
  createSilentSteps,
  createMemoryProjectRepository,
  documentToState,
  nextProjectRevision,
  parseStoredProject,
  projectRevisionFromMetadata,
  PulseStore,
  restoreAutosave,
  serializeProject,
  serializePortableProject,
  type ModuleSeed,
  type ParameterValue,
  type PulseEngineDelta,
  type PulseState,
  type RackModuleState,
} from "./state/public";
import { createIndexedDbProjectRepository } from "./persistence/public";
import { mountPulseboxApp, type PulseboxAppHandle } from "./ui/public";

// Section 9.1: the MVP rack is exactly eight slots, six loaded and two empty.
const visibleSlotCount = 8;
const initialSteps = Object.freeze(
  [36, 36, 43, 39, 36, 46, 43, 39, 36, 39, 48, 43, 36, 46, 39, 43].map((note, index) =>
    Object.freeze({
      active: index % 4 !== 3,
      note,
      velocity: index % 4 === 0 ? 0.92 : 0.68,
      accent: index % 8 === 0,
      slide: index === 5 || index === 13,
    }),
  ),
);

// A drum module selects its voice by note number, so a drum pattern is an
// ordinary note pattern in the shared model. Section 9.1 requires an original
// coherent demo loop, so each machine below plays one distinct role rather than
// every machine restating the same backbeat.
interface DemoHit {
  /** Voice index within the module's own roster, in rack order. */
  readonly voice: number;
  readonly steps: readonly number[];
  readonly velocity?: number;
}

function demoSteps(baseNote: number, hits: readonly DemoHit[]) {
  const byStep = new Map<number, DemoHit>();
  for (const hit of hits) {
    for (const step of hit.steps) byStep.set(step, hit);
  }
  return Object.freeze(
    Array.from({ length: 16 }, (_, index) => {
      const hit = byStep.get(index);
      return Object.freeze({
        active: hit !== undefined,
        note: baseNote + (hit?.voice ?? 0),
        velocity: hit?.velocity ?? 0.7,
        accent: index % 8 === 0 && hit !== undefined,
        slide: false,
      });
    }),
  );
}

const DRUM_BASE = drumVoiceNote("kick");

/** Drumline Six keeps the backbeat: kick, snare, and a closed-hat pulse. */
const drumlineSteps = demoSteps(DRUM_BASE, [
  { voice: 0, steps: [0, 6, 10], velocity: 0.95 },
  { voice: 1, steps: [4, 12], velocity: 0.85 },
  { voice: 4, steps: [2, 14], velocity: 0.55 },
]);

/** Boom Eight adds weight on the downbeats and a tom fill at the turnaround. */
const boomSteps = demoSteps(DRUM_BASE, [
  { voice: 1, steps: [0, 8], velocity: 0.9 },
  { voice: 4, steps: [13], velocity: 0.7 },
  { voice: 5, steps: [15], velocity: 0.75 },
]);

/** Hybrid Nine carries the offbeat hat and a ride accent. */
const hybridSteps = demoSteps(DRUM_BASE, [
  { voice: 6, steps: [1, 3, 5, 7, 9, 11, 13, 15], velocity: 0.45 },
  { voice: 8, steps: [4, 12], velocity: 0.5 },
]);

/** Digit Seven answers with a clap on the backbeat. */
const digitSevenSteps = demoSteps(DRUM_BASE, [{ voice: 2, steps: [4, 12], velocity: 0.62 }]);

/** Digit Five lays a shaker and clave pattern over the top. */
const digitFiveSteps = demoSteps(DRUM_BASE, [
  { voice: 6, steps: [2, 6, 10, 14], velocity: 0.4 },
  { voice: 7, steps: [3, 11], velocity: 0.5 },
]);

const seedFor = (
  manifest: { readonly pluginId: PluginId },
  defaults: Readonly<Record<string, unknown>>,
  steps: ReturnType<typeof demoSteps> | typeof initialSteps,
): ModuleSeed => ({
  pluginId: manifest.pluginId,
  parameters: toParameterValues(defaults),
  steps,
});

const defaultRack: readonly ModuleSeed[] = [
  seedFor(ACID_BASS_MANIFEST, ACID_BASS_DEFAULT_PARAMETERS, initialSteps),
  seedFor(DRUMLINE_SIX_MANIFEST, DRUMLINE_SIX_DEFAULT_PARAMETERS, drumlineSteps),
  seedFor(BOOM_EIGHT_MANIFEST, BOOM_EIGHT_DEFAULT_PARAMETERS, boomSteps),
  seedFor(HYBRID_NINE_MANIFEST, HYBRID_NINE_DEFAULT_PARAMETERS, hybridSteps),
  seedFor(DIGIT_SEVEN_MANIFEST, DIGIT_SEVEN_DEFAULT_PARAMETERS, digitSevenSteps),
  seedFor(DIGIT_FIVE_MANIFEST, DIGIT_FIVE_DEFAULT_PARAMETERS, digitFiveSteps),
];

interface RuntimePlugin {
  readonly voiceAdapterFactory: VoiceAdapterFactory;
  readonly moduleSeed: ModuleSeed;
  readonly auditionNoteForVoice: (voiceId: string | undefined) => number;
}

const appReference: { current: PulseboxAppHandle | undefined } = { current: undefined };

/**
 * The six approved MVP instruments. Registering a module is one entry here plus
 * its own folder, as section 6.5 requires: nothing below this table branches on
 * plugin ID, and the audition pitch comes from the shared voice roster.
 */
const INSTRUMENTS = [
  {
    manifest: ACID_BASS_MANIFEST,
    defaults: ACID_BASS_DEFAULT_PARAMETERS,
    adapter: createBassVoiceAdapter,
  },
  {
    manifest: DRUMLINE_SIX_MANIFEST,
    defaults: DRUMLINE_SIX_DEFAULT_PARAMETERS,
    adapter: createDrumlineVoiceAdapter,
  },
  {
    manifest: BOOM_EIGHT_MANIFEST,
    defaults: BOOM_EIGHT_DEFAULT_PARAMETERS,
    adapter: createBoomVoiceAdapter,
  },
  {
    manifest: HYBRID_NINE_MANIFEST,
    defaults: HYBRID_NINE_DEFAULT_PARAMETERS,
    adapter: createHybridVoiceAdapter,
  },
  {
    manifest: DIGIT_SEVEN_MANIFEST,
    defaults: DIGIT_SEVEN_DEFAULT_PARAMETERS,
    adapter: createDigitSevenVoiceAdapter,
  },
  {
    manifest: DIGIT_FIVE_MANIFEST,
    defaults: DIGIT_FIVE_DEFAULT_PARAMETERS,
    adapter: createDigitFiveVoiceAdapter,
  },
] as const;

const registry = createPluginRegistry<RuntimePlugin>(
  INSTRUMENTS.map(({ manifest, defaults, adapter }) => ({
    manifest,
    factory: {
      voiceAdapterFactory: adapter,
      moduleSeed: {
        pluginId: manifest.pluginId,
        parameters: toParameterValues(defaults),
        steps: createSilentSteps(),
      },
      auditionNoteForVoice: (voiceId: string | undefined) =>
        auditionNoteFor(manifest.pluginId, voiceId),
    },
  })),
);
// One transport owns the clock, the lookahead loop, and every voice. Registering
// an instrument means adding a registry entry, not touching the transport.
let audio: TransportRuntime;
function createAudioRuntime(): TransportRuntime {
  const runtime = new TransportRuntime({
    adapterFactoryFor: (pluginId) => registry.get(pluginId)?.factory.voiceAdapterFactory,
    onStatus: (status) => {
      if (runtime !== audio) return;
      appReference.current?.reportAudioStatus(
        status.state,
        status.state === "recovered" ? undefined : status.fault.message,
      );
    },
    onMeter: (moduleId, level) => {
      if (runtime === audio) appReference.current?.reportMeter(moduleId, level);
    },
  });
  return runtime;
}
audio = createAudioRuntime();
let audioProjectionQueue = Promise.resolve();
let suppressAudioProjection = false;
const store = new PulseStore(
  createDefaultState(browserIdFactory, defaultRack),
  browserIdFactory,
  (pluginId) => registry.get(pluginId)?.factory.moduleSeed,
  (delta) => queueAudioDelta(delta),
  validateParameter,
);

const host = document.querySelector<HTMLElement>("#app");
if (host === null) throw new Error("Pulsebox requires a #app mount point.");

// Projects live in IndexedDB. A browser that denies storage falls back to an
// in-memory repository so editing keeps working without persistence.
const repository = (() => {
  try {
    return createIndexedDbProjectRepository(window.indexedDB);
  } catch {
    return createMemoryProjectRepository();
  }
})();
const registryEntries = registry.entries();
const parseOptions = {
  knownPluginIds: registryEntries.map(([pluginId]) => pluginId as string),
  parameterDescriptorsByPluginId: Object.fromEntries(
    registryEntries.map(([pluginId, entry]) => [pluginId, entry.manifest.parameters]),
  ),
};
const initialProjectTimestamp = new Date().toISOString();
let committedMetadata: {
  createdAt: string;
  modifiedAt: string;
  revision: ProjectRevision;
} = {
  createdAt: initialProjectTimestamp,
  modifiedAt: initialProjectTimestamp,
  revision: nextProjectRevision(undefined, browserIdFactory),
};

const app = mountPulseboxApp({
  host,
  addablePluginIds: registry.entries().map(([pluginId]) => pluginId),
  auditionNoteFor: (pluginId: PluginId, voiceId: string | undefined) =>
    registry.require(pluginId).factory.auditionNoteForVoice(voiceId),
  audio: {
    getPositionTicks: () => audio.getPositionTicks(),
    pause: () => audio.pause(),
    play: (tempo) => audio.play(tempo),
    previewParameter: (moduleId, parameter, value) => {
      audio.previewParameter(moduleId, parameter, value);
    },
    previewChannelMix: (moduleId, field, value) => {
      audio.previewChannelMix(moduleId, field, value);
    },
    previewMasterLevel: (level) => {
      audio.previewMasterLevel(level);
    },
    startAudition: (moduleId, note) => audio.startAudition(moduleId, note),
    stopAudition: (moduleId) => {
      audio.stopAudition(moduleId);
    },
    stop: () => audio.stop(),
    setSwing: (swing) => {
      audio.setSwing(swing);
    },
  },
  manifestFor: (pluginId) => registry.get(pluginId)?.manifest,
  store,
  visibleSlotCount,
  projects: {
    save: async () => {
      const state = store.getState();
      const now = new Date().toISOString();
      const committed = await repository.save(
        {
          id: state.project.id,
          name: state.project.name,
          modifiedAt: now,
          document: serializeProject(state, {
            createdAt: committedMetadata.createdAt,
            modifiedAt: now,
            projectRevision: committedMetadata.revision,
          }),
        },
        browserIdFactory,
      );
      committedMetadata = {
        createdAt: committed.document.project.createdAt,
        modifiedAt: committed.document.project.modifiedAt,
        revision: projectRevisionFromMetadata(committed.document.project),
      };
    },
    list: async () => {
      const stored = await repository.list();
      return stored
        .map((one) => ({ id: one.id, name: one.name, modifiedAt: one.modifiedAt }))
        .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    },
    open: async (id) => {
      const stored = await repository.load(id);
      if (stored === undefined) throw new Error("Project not found.");
      const parsed = parseStoredProject(stored, parseOptions);
      if (!parsed.ok) throw new Error(parsed.issues[0]?.message ?? "Stored project is invalid.");
      const next = documentToState(parsed.value.document, store.getState());
      store.loadProject(next.project);
      committedMetadata = {
        createdAt: parsed.value.document.project.createdAt,
        modifiedAt: parsed.value.document.project.modifiedAt,
        revision: projectRevisionFromMetadata(parsed.value.document.project),
      };
      audioProjectionQueue = replaceAudioProjection(store.getState());
    },
    exportPortable: () =>
      serializePortableProject(
        serializeProject(store.getState(), {
          createdAt: committedMetadata.createdAt,
          modifiedAt: committedMetadata.modifiedAt,
          projectRevision: committedMetadata.revision,
        }),
      ),
    importPortable: async (bytes) => {
      const result = await commitPortableProjectImport(bytes, {
        repository,
        parseOptions,
        idFactory: browserIdFactory,
        currentState: () => store.getState(),
        prepareCandidate: prepareImportedProject,
      });
      if (!result.ok) return result;
      committedMetadata = {
        createdAt: result.committed.document.project.createdAt,
        modifiedAt: result.committed.document.project.modifiedAt,
        revision: projectRevisionFromMetadata(result.committed.document.project),
      };
      return { ok: true };
    },
  },
});
appReference.current = app;
audioProjectionQueue = replaceAudioProjection(store.getState());

const autosave = createAutosave({
  repository,
  parseOptions,
  now: () => new Date().toISOString(),
  createdAt: () => committedMetadata.createdAt,
  projectRevision: () => committedMetadata.revision,
});

store.subscribe(
  (state) => state.project.revision,
  () => {
    autosave.schedule(store.getState());
  },
);

void restoreAutosave(store.getState(), { repository, parseOptions }).then(async (restored) => {
  if (restored === store.getState()) return;
  const storedAutosave = await repository.loadAutosave();
  const parsedAutosave =
    storedAutosave === undefined ? undefined : parseStoredProject(storedAutosave, parseOptions);
  if (parsedAutosave?.ok === true) {
    committedMetadata = {
      createdAt: parsedAutosave.value.document.project.createdAt,
      modifiedAt: parsedAutosave.value.document.project.modifiedAt,
      revision: projectRevisionFromMetadata(parsedAutosave.value.document.project),
    };
  }
  store.loadProject(restored.project);
  audioProjectionQueue = replaceAudioProjection(store.getState());
});

// `pagehide` also fires when the page enters the back/forward cache, where the
// document stays alive and can be restored. Tearing the app down there would
// leave an empty shell on the way back, so only a real unload disposes; a
// cached page just persists its work and keeps running.
window.addEventListener("pagehide", (event) => {
  void autosave.flush(store.getState());
  if (event.persisted) return;
  autosave.dispose();
  app.dispose();
  audio.dispose();
});

function queueAudioDelta(delta: PulseEngineDelta): void {
  if (suppressAudioProjection) return;
  const acceptedState = store.getState();
  const moduleId =
    typeof delta.payload.moduleId === "string"
      ? (delta.payload.moduleId as ModuleInstanceId)
      : undefined;
  const module = moduleId === undefined ? undefined : acceptedState.project.modules[moduleId];
  const moduleProjection = module === undefined ? undefined : toAudioModule(module);
  const fullProjection =
    delta.kind === "project-replace" ? toAudioModules(acceptedState) : undefined;

  audioProjectionQueue = audioProjectionQueue
    .then(() => audio.project(delta, moduleProjection, fullProjection))
    .catch(() => replaceAudioProjection(store.getState()));
}

async function prepareImportedProject(
  candidate: PulseState,
): Promise<{ readonly activate: () => void; readonly dispose: () => void }> {
  const candidateAudio = createAudioRuntime();
  let activated = false;
  try {
    candidateAudio.setArrangement({
      activePatternIndex: candidate.project.activePatternIndex,
      songEnabled: candidate.project.song.enabled,
      songEntries: candidate.project.song.entries,
    });
    candidateAudio.setSwing(candidate.project.swing);
    candidateAudio.setMasterLevel(candidate.project.masterLevel);
    await candidateAudio.replaceFromCurrentState(
      toAudioModules(candidate),
      candidate.project.revision,
    );
    await candidateAudio.activate();
  } catch (error) {
    candidateAudio.dispose();
    throw error;
  }

  return {
    activate: () => {
      suppressAudioProjection = true;
      try {
        if (store.getState().transport.status !== "stopped") {
          store.dispatch(store.createCommand("transport-stop", {}));
        }
        const loaded = store.loadProject(candidate.project);
        if (loaded.status !== "accepted") throw new Error(loaded.error.message);
      } finally {
        suppressAudioProjection = false;
      }
      const previousAudio = audio;
      audio = candidateAudio;
      audioProjectionQueue = Promise.resolve();
      previousAudio.dispose();
      activated = true;
    },
    dispose: () => {
      if (!activated) candidateAudio.dispose();
    },
  };
}

async function replaceAudioProjection(state: Readonly<PulseState>): Promise<void> {
  try {
    audio.setArrangement({
      activePatternIndex: state.project.activePatternIndex,
      songEnabled: state.project.song.enabled,
      songEntries: state.project.song.entries,
    });
    audio.setSwing(state.project.swing);
    audio.setMasterLevel(state.project.masterLevel);
    await audio.replaceFromCurrentState(toAudioModules(state), state.project.revision);
  } catch {
    app.markAudioUnavailable();
    if (store.getState().transport.status === "playing") {
      audio.stop();
      store.dispatch(store.createCommand("transport-stop", {}));
    }
  }
}

function toAudioModules(state: Readonly<PulseState>): readonly TransportModule[] {
  return Object.values(state.project.modules).map((module) => toAudioModule(module));
}

function toAudioModule(module: RackModuleState): TransportModule {
  return {
    id: module.id,
    pluginId: module.pluginId,
    parameters: module.parameters,
    parts: module.parts,
    mix: {
      level: module.level,
      pan: module.pan,
      muted: module.muted,
      solo: module.solo,
    },
  };
}

function validateParameter(
  module: RackModuleState,
  parameter: string,
  value: ParameterValue,
): boolean {
  const descriptor = registry
    .get(module.pluginId)
    ?.manifest.parameters.find((candidate) => candidate.id === parameter);
  if (descriptor === undefined) return false;
  if (descriptor.valueType === "enum") {
    return typeof value === "string" && descriptor.enumValues?.includes(value) === true;
  }
  if (descriptor.valueType === "boolean") return typeof value === "boolean";
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= (descriptor.minimum ?? value) &&
    value <= (descriptor.maximum ?? value)
  );
}

function toParameterValues(
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, ParameterValue>> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, ParameterValue] => {
      const value = entry[1];
      return typeof value === "number" || typeof value === "boolean" || typeof value === "string";
    }),
  );
}
