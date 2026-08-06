import {
  type EffectInstanceId,
  type EffectInstanceState,
  type ModuleInstanceId,
  type PluginId,
  type ProjectRevision,
} from "./contracts";
import { browserIdFactory } from "./composition/browser-id-factory";
import {
  BUILT_IN_MODULES,
  BUILT_IN_EFFECTS,
  TransportRuntime,
  auditionNoteFor,
  playableNotesFor,
  createPluginRegistry,
  type TransportModule,
  type VoiceAdapterFactory,
} from "./engine/public";
import {
  createAutosave,
  activateTemplateProject,
  commitPortableProjectImport,
  createProjectFromTemplate,
  createParameterValidator,
  createSilentSteps,
  DEFAULT_PROJECT_NAME,
  documentToState,
  nextProjectRevision,
  parseStoredProject,
  projectRevisionFromMetadata,
  PulseStore,
  restoreAutosave,
  serializeProject,
  serializePortableProject,
  type ModuleSeed,
  type PulseEngineDelta,
  type PulseState,
  type RackModuleState,
} from "./state/public";
import {
  createDefaultProjectState,
  drumVoiceIdsFor,
  toParameterValues,
} from "./composition/default-project";
import { createBrowserProjectRepository } from "./composition/project-repository";
import { mountPulseboxApp, type PulseboxAppHandle } from "./ui/public";

// Section 9.1: the MVP rack is exactly eight slots, six loaded and two empty.
// The default project content lives in src/composition/default-project.ts, so
// tests can assert the section 9 contract without mounting the application.
const visibleSlotCount = 8;

interface RuntimePlugin {
  readonly voiceAdapterFactory?: VoiceAdapterFactory;
  readonly moduleSeed?: ModuleSeed;
  readonly auditionNoteForVoice?: (voiceId: string | undefined) => number;
}

const appReference: { current: PulseboxAppHandle | undefined } = { current: undefined };

/**
 * The registry is built from the engine's single built-in list. Registering a
 * module is one entry in `src/engine/modules/index.ts` plus its own folder, as
 * section 6.5 requires: nothing here names or branches on a plugin ID, and the
 * audition pitch comes from each manifest's declared notes.
 */
const registry = createPluginRegistry<RuntimePlugin>([
  ...BUILT_IN_MODULES.map(({ manifest, defaultParameters, createVoiceAdapter }) => {
    const voiceIds = drumVoiceIdsFor(manifest);
    return {
      manifest,
      factory: {
        voiceAdapterFactory: createVoiceAdapter,
        moduleSeed: {
          pluginId: manifest.pluginId,
          parameters: toParameterValues(defaultParameters),
          steps: createSilentSteps(),
          ...(voiceIds.length > 0 ? { voiceIds } : {}),
        },
        auditionNoteForVoice: (voiceId: string | undefined) => auditionNoteFor(manifest, voiceId),
      },
    };
  }),
  ...BUILT_IN_EFFECTS.map(({ manifest }) => ({ manifest, factory: {} })),
]);
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
  // One validation policy: the descriptor check that guards project import
  // also guards live commands.
  createParameterValidator(
    (pluginId) => registry.get(pluginId as PluginId)?.manifest.parameters,
  ),
  createVoiceInsertEffect,
);

const host = document.querySelector<HTMLElement>("#app");
if (host === null) throw new Error("Pulsebox requires a #app mount point.");

// Select the browser adapter only after IndexedDB opens. If the browser denies
// storage, the explicit non-durable repository keeps editing and export usable.
const repositorySelection = await createBrowserProjectRepository(window.indexedDB);
const repository = repositorySelection.repository;
const registryEntries = registry.entries();
const instrumentRegistryEntries = registryEntries.filter(
  ([, entry]) => entry.manifest.kind === "instrument",
);
const voiceInsertEffectEntries = registryEntries.flatMap(([pluginId, entry]) => {
  if (entry.manifest.kind !== "effect" || !entry.manifest.placements.includes("voice-insert")) {
    return [];
  }
  return [[pluginId, entry.manifest] as const];
});
const voiceInsertEffectPluginIds = voiceInsertEffectEntries.map(([pluginId]) => pluginId);
const voiceInsertEffectsByPluginId = Object.fromEntries(
  voiceInsertEffectEntries.map(([pluginId, manifest]) => [
    pluginId,
    {
      stateSchemaVersion: manifest.stateSchemaVersion,
      parameters: manifest.parameters,
    },
  ]),
);
const parseOptions = {
  knownPluginIds: instrumentRegistryEntries.map(([pluginId]) => pluginId as string),
  parameterDescriptorsByPluginId: Object.fromEntries(
    instrumentRegistryEntries.map(([pluginId, entry]) => [pluginId, entry.manifest.parameters]),
  ),
  knownVoiceInsertEffectPluginIds: voiceInsertEffectPluginIds.map((pluginId) => pluginId as string),
  stateSchemaVersionByPluginId: Object.fromEntries(
    registryEntries.map(([pluginId, entry]) => [pluginId, entry.manifest.stateSchemaVersion]),
  ),
  voiceInsertEffectsByPluginId,
  voiceIdsByPluginId: Object.fromEntries(
    registryEntries.flatMap(([pluginId, entry]) => {
      if (entry.manifest.kind !== "instrument") return [];
      const voiceIds = drumVoiceIdsFor(entry.manifest);
      return voiceIds.length > 0 ? [[pluginId, voiceIds]] : [];
    }),
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

const projectsService = {
  save: async () => {
    const state = store.getState();
    const snapshotRevision = state.project.revision;
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
          manifestVersionFor,
        }),
      },
      browserIdFactory,
    );
    committedMetadata = {
      createdAt: committed.document.project.createdAt,
      modifiedAt: committed.document.project.modifiedAt,
      revision: projectRevisionFromMetadata(committed.document.project),
    };
    return { snapshotRevision, durable: repositorySelection.durable };
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
  open: async (id: string) => {
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
        manifestVersionFor,
      }),
    ),
  importPortable: async (bytes: Uint8Array) => {
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
    return { ok: true as const };
  },
};

const app = mountPulseboxApp({
  host,
  idFactory: browserIdFactory,
  addablePluginIds: registryEntries
    .filter(([, entry]) => entry.manifest.kind === "instrument")
    .map(([pluginId]) => pluginId),
  auditionNoteFor: (pluginId: PluginId, voiceId: string | undefined) =>
    requireInstrumentRuntime(pluginId).auditionNoteForVoice(voiceId),
  playableNotesFor: (pluginId: PluginId) => {
    const entry = registry.get(pluginId);
    return entry?.manifest.kind === "instrument" ? playableNotesFor(entry.manifest) : undefined;
  },
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
      create: () =>
        createProjectFromTemplate({
          storageAvailable: repositorySelection.durable,
          save: projectsService.save,
          currentRevision: () => store.getState().project.revision,
          createFresh: () => createDefaultProjectState(browserIdFactory),
          activateFresh: (next) => {
            if (!activateTemplateProject(store, next, () => audio.stop())) return false;
            const now = new Date().toISOString();
            committedMetadata = {
              createdAt: now,
              modifiedAt: now,
              revision: nextProjectRevision(undefined, browserIdFactory),
            };
            queueFullAudioProjection();
            return true;
          },
        }),
    },
  ],
  projects: projectsService,
});
appReference.current = app;
queueFullAudioProjection();

const autosave = createAutosave({
  repository,
  parseOptions,
  now: () => new Date().toISOString(),
  createdAt: () => committedMetadata.createdAt,
  projectRevision: () => committedMetadata.revision,
  manifestVersionFor,
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
  const moduleProjection =
    module === undefined ? undefined : toAudioModule(acceptedState, module);
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
      appReference.current?.reportAudioRuntimeState(audio.state);
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
  return Object.values(state.project.modules).map((module) => toAudioModule(state, module));
}

function toPatternTiming(state: Readonly<PulseState>) {
  return state.project.patterns.map((pattern) => ({
    humanize: pattern.humanize,
    seed: pattern.seed,
  }));
}

function toAudioModule(state: Readonly<PulseState>, module: RackModuleState): TransportModule {
  const slots = state.project.effects.voiceInserts[module.id];
  const voiceInserts =
    slots === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(slots).map(([voiceId, effectInstanceId]) => {
            const effect =
              effectInstanceId === null
                ? undefined
                : state.project.effects.instances[effectInstanceId];
            return [
              voiceId,
              effect === undefined ? null : { pluginId: effect.pluginId, state: effect.state },
            ];
          }),
        );
  return {
    id: module.id,
    pluginId: module.pluginId,
    parameters: module.parameters,
    ...(voiceInserts === undefined ? {} : { voiceInserts }),
    parts: module.parts,
    mix: {
      level: module.level,
      pan: module.pan,
      muted: module.muted,
      solo: module.solo,
    },
  };
}

function requireInstrumentRuntime(pluginId: PluginId): Required<RuntimePlugin> {
  const runtime = registry.require(pluginId).factory;
  if (
    runtime.voiceAdapterFactory === undefined ||
    runtime.moduleSeed === undefined ||
    runtime.auditionNoteForVoice === undefined
  ) {
    throw new Error("The requested plugin is not an instrument.");
  }
  return runtime as Required<RuntimePlugin>;
}

function createVoiceInsertEffect(
  id: EffectInstanceId,
  pluginId: PluginId,
): EffectInstanceState | undefined {
  const entry = registry.get(pluginId);
  if (
    entry?.manifest.kind !== "effect" ||
    !entry.manifest.placements.includes("voice-insert")
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    pluginId,
    stateVersion: entry.manifest.stateSchemaVersion,
    state: Object.freeze(effectStateDefaultsFor(entry.manifest.defaultState)),
  });
}

function effectStateDefaultsFor(
  defaultState: Readonly<Record<string, unknown>>,
): Readonly<Record<string, number | boolean | string>> {
  const state = toParameterValues(defaultState);
  if (Object.keys(state).length !== Object.keys(defaultState).length) {
    throw new Error("Voice insert state must contain only finite scalar values.");
  }
  return state;
}

function manifestVersionFor(pluginId: string): number {
  const manifest = registry.get(pluginId as PluginId)?.manifest;
  if (manifest === undefined) throw new Error(`Cannot serialize an unknown plugin: ${pluginId}.`);
  return manifest.stateSchemaVersion;
}
