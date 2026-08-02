import {
  browserIdFactory,
  type ModuleInstanceId,
  type ParameterValue,
  type PluginId,
  type ProjectRevision,
} from "./contracts";
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
  TransportRuntime,
  auditionNoteFor,
  playableNotesFor,
  createBassVoiceAdapter,
  createBoomVoiceAdapter,
  createDigitFiveVoiceAdapter,
  createDigitSevenVoiceAdapter,
  createDrumlineVoiceAdapter,
  createHybridVoiceAdapter,
  createPluginRegistry,
  type TransportModule,
  type VoiceAdapterFactory,
} from "./engine/public";
import {
  createAutosave,
  commitPortableProjectImport,
  createSilentSteps,
  createMemoryProjectRepository,
  DEFAULT_PROJECT_NAME,
  documentToState,
  nextProjectRevision,
  parseStoredProject,
  projectRevisionFromMetadata,
  PulseStore,
  restoreAutosave,
  serializeProject,
  serializePortableProject,
  validateImportedParameter,
  type ModuleSeed,
  type PulseEngineDelta,
  type PulseState,
  type RackModuleState,
} from "./state/public";
import { createIndexedDbProjectRepository } from "./persistence/public";
import { createDefaultProjectState, toParameterValues } from "./composition/default-project";
import { mountPulseboxApp, type PulseboxAppHandle } from "./ui/public";

// Section 9.1: the MVP rack is exactly eight slots, six loaded and two empty.
// The default project content lives in src/composition/default-project.ts, so
// tests can assert the section 9 contract without mounting the application.
const visibleSlotCount = 8;

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
    manifest: BASS_MONO_MANIFEST,
    defaults: BASS_MONO_DEFAULT_PARAMETERS,
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
    onStateChange: (state) => {
      if (runtime === audio) appReference.current?.reportAudioRuntimeState(state);
    },
  });
  return runtime;
}
audio = createAudioRuntime();
let audioProjectionQueue = Promise.resolve();
let suppressAudioProjection = false;

/**
 * Serializes a full projection behind every projection already queued. A
 * direct `audioProjectionQueue = replaceAudioProjection(...)` would race the
 * pending chain: two concurrent syncs both pass the adapter-existence check
 * and one module ends up with two live adapters. The state is read when the
 * projection runs, so the replacement always projects the newest state.
 */
function queueFullAudioProjection(): void {
  audioProjectionQueue = audioProjectionQueue
    .catch(() => undefined)
    .then(() => replaceAudioProjection(store.getState()));
}

const store = new PulseStore(
  createDefaultProjectState(browserIdFactory),
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
  addablePluginIds: registryEntries.map(([pluginId]) => pluginId),
  auditionNoteFor: (pluginId: PluginId, voiceId: string | undefined) =>
    registry.require(pluginId).factory.auditionNoteForVoice(voiceId),
  playableNotesFor: (pluginId: PluginId) => playableNotesFor(pluginId),
  audio: {
    getPositionTicks: () => audio.getPositionTicks(),
    pause: () => audio.pause(),
    play: (tempo) => audio.play(tempo),
    previewParameter: (moduleId, parameter, value) => {
      audio.previewParameter(moduleId, parameter, value);
    },
    previewTempo: (tempo) => {
      audio.previewTempo(tempo);
    },
    previewSwing: (swing) => {
      audio.previewSwing(swing);
    },
    previewHumanize: (patternIndex, humanize) => {
      audio.previewPatternHumanize(patternIndex, humanize);
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
    getMasterMeter: () => audio.getMasterMeter(),
    setMetronomeEnabled: (enabled) => {
      audio.setMetronomeEnabled(enabled);
    },
    setPower: async (on) => {
      if (on) await audio.activate();
      else await audio.powerOff();
    },
    setLaunchQuantization: (steps) => {
      audio.setLaunchQuantization(steps);
    },
  },
  createPatternSeed: () => {
    const seed = new Uint32Array(1);
    crypto.getRandomValues(seed);
    return seed[0] ?? 0;
  },
  manifestFor: (pluginId) => registry.get(pluginId)?.manifest,
  store,
  visibleSlotCount,
  templates: [
    {
      id: "neon-basement",
      name: DEFAULT_PROJECT_NAME,
      // Section 9.2: the built-in starter template replaces the working project
      // with a fresh copy of the section 9.1 default project, under its own new
      // project and lineage ID.
      create: () => {
        if (store.getState().transport.status !== "stopped") {
          audio.stop();
          store.dispatch(store.createCommand("transport-stop", {}));
        }
        const next = createDefaultProjectState(browserIdFactory);
        const loaded = store.loadProject(next.project);
        if (loaded.status !== "accepted") return;
        const now = new Date().toISOString();
        committedMetadata = {
          createdAt: now,
          modifiedAt: now,
          revision: nextProjectRevision(undefined, browserIdFactory),
        };
        queueFullAudioProjection();
      },
    },
  ],
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
        .map((one) => ({
          id: one.id,
          name: one.name,
          modifiedAt: one.modifiedAt,
          favorite: one.document.project.favorite,
        }))
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
      queueFullAudioProjection();
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
queueFullAudioProjection();

const autosave = createAutosave({
  repository,
  parseOptions,
  now: () => new Date().toISOString(),
  createdAt: () => committedMetadata.createdAt,
  projectRevision: () => committedMetadata.revision,
  onError: (error) => {
    app.reportProjectNotice("Autosave failed. This browser may be blocking storage.");
    console.error("Pulsebox could not write the autosave snapshot.", error);
  },
});

store.subscribe(
  (state) => state.project.revision,
  () => {
    autosave.schedule(store.getState());
  },
);

const revisionAtMount = store.getState().project.revision;
void restoreAutosave(store.getState(), {
  repository,
  parseOptions,
  onError: (error) => {
    // The invalid snapshot is discarded, never partially applied. The user
    // sees the non-blocking notice; the console keeps the diagnostic detail.
    app.reportProjectNotice("The autosaved session could not be restored. The project starts new.");
    console.error("Pulsebox discarded an autosave snapshot that failed validation.", error);
  },
}).then((restored) => {
  if (restored.document === undefined) return;
  // An edit that landed while the snapshot loaded wins. Loading now would
  // replace the user's edited project with the snapshot and clear history.
  const current = store.getState().project.revision;
  if (current.epoch !== revisionAtMount.epoch || current.counter !== revisionAtMount.counter) {
    return;
  }
  committedMetadata = {
    createdAt: restored.document.project.createdAt,
    modifiedAt: restored.document.project.modifiedAt,
    revision: projectRevisionFromMetadata(restored.document.project),
  };
  store.loadProject(restored.state.project);
  queueFullAudioProjection();
});

/**
 * True when the event started inside a text-entry field. Such a field is the
 * one document-like surface in the shell, so it keeps the native menu with its
 * Cut, Copy, Paste, Undo, and Select all commands. `src/styles/global.css`
 * makes the same exemption for text selection.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("input, textarea, [contenteditable='true']") !== null;
}

// The app is a workstation shell, not a document. Suppress the native browser
// context menu on the shell surfaces; the app-owned module context menus
// prevent the default event themselves and still open.
window.addEventListener("contextmenu", (event) => {
  if (isTextEntryTarget(event.target)) return;
  event.preventDefault();
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

  // Undo, redo, and loads arrive as one project replacement. The module list
  // alone does not carry the arrangement, Pattern timing, Swing, or master
  // level, so those projections travel with the replacement.
  if (delta.kind === "project-replace") {
    audio.setArrangement({
      activePatternIndex: acceptedState.project.activePatternIndex,
      songEnabled: acceptedState.project.song.enabled,
      songEntries: acceptedState.project.song.entries,
    });
    audio.setPatternTiming(toPatternTiming(acceptedState));
    audio.setSwing(acceptedState.project.swing);
    audio.setMasterLevel(acceptedState.project.masterLevel);
  }

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
    candidateAudio.setPatternTiming(toPatternTiming(candidate));
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
    audio.setPatternTiming(toPatternTiming(state));
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

function toPatternTiming(state: Readonly<PulseState>) {
  return state.project.patterns.map((pattern) => ({
    humanize: pattern.humanize,
    seed: pattern.seed,
  }));
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
  // One validation policy: the descriptor check that guards project import
  // also guards live commands.
  return descriptor !== undefined && validateImportedParameter(value, descriptor) === undefined;
}
