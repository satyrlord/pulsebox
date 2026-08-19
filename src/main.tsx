import {
  type EffectInstanceId,
  type EffectInstanceState,
  type PluginId,
  type ProjectRevision,
} from "./contracts";
import { browserIdFactory } from "./composition/browser-id-factory";
import { toTransportDelta } from "./composition/audio-delta-projection";
import { AudioProjectionCoordinator } from "./composition/audio-projection-coordinator";
import {
  applyFullAudioProjection,
  createAudioStateProjector,
  patternIndexFor,
} from "./composition/audio-state-projection";
import {
  BUILT_IN_MODULES,
  BUILT_IN_EFFECTS,
  TransportRuntime,
  auditionNoteFor,
  playableNotesFor,
  createPluginRegistry,
  createEffectWorkletPort,
  type VoiceAdapterFactory,
} from "./engine/public";
import {
  createAutosave,
  activateTemplateProject,
  commitPortableProjectImport,
  createProjectFromTemplate,
  createParameterValidator,
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
  type ChainEffectPlacement,
  type PulseState,
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
  readonly effectProcessorFactoryKey?: string;
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
          events: [],
          ...(voiceIds.length > 0 ? { voiceIds } : {}),
        },
        auditionNoteForVoice: (voiceId: string | undefined) => auditionNoteFor(manifest, voiceId),
      },
    };
  }),
  ...BUILT_IN_EFFECTS.map(({ manifest, processorFactoryKey }) => ({
    manifest,
    factory: { effectProcessorFactoryKey: processorFactoryKey },
  })),
]);
const audioStateProjector = createAudioStateProjector(
  (pluginId) => registry.get(pluginId)?.manifest,
);
// One transport owns the clock, the lookahead loop, and every voice. Registering
// an instrument means adding a registry entry, not touching the transport.
let audio: TransportRuntime;
function createAudioRuntime(): TransportRuntime {
  const runtime = new TransportRuntime({
    adapterFactoryFor: (pluginId) => registry.get(pluginId)?.factory.voiceAdapterFactory,
    effectChainNodeFactory: async (context, effect) => {
      const registration = registry.get(effect.pluginId);
      if (
        registration?.factory.effectProcessorFactoryKey === undefined ||
        registration.factory.effectProcessorFactoryKey !== registration.manifest.processorFactoryKey
      ) {
        throw new Error(`The effect registry cannot activate ${effect.pluginId}.`);
      }
      return createEffectWorkletPort(context, {
        pluginId: effect.pluginId,
        state: effect.state,
        onStatus: (status) => {
          if (runtime !== audio) return;
          appReference.current?.reportAudioStatus(
            status.state === "degraded" ? "recovering" : status.state,
            status.state === "recovered" ? undefined : `${status.message} ${status.recoveryAction}`,
          );
        },
      });
    },
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

/** Serializes a full state projection in the active runtime generation. */
function queueFullAudioProjection(): void {
  audioProjectionCoordinator.queueFullProjection();
}

const store = new PulseStore(
  createDefaultProjectState(browserIdFactory, createEffectInstance),
  browserIdFactory,
  (pluginId) => registry.get(pluginId)?.factory.moduleSeed,
  (delta) => audioProjectionCoordinator.queueDelta(delta),
  // One validation policy: the descriptor check that guards project import
  // also guards live commands.
  createParameterValidator(
    (pluginId) => registry.get(pluginId as PluginId)?.manifest.parameters,
  ),
  undefined,
  createParameterValidator(
    (pluginId) => registry.get(pluginId as PluginId)?.manifest.parameters,
  ),
  createEffectInstance,
);
const audioProjectionCoordinator = new AudioProjectionCoordinator({
  runtime: audio,
  getState: () => store.getState(),
  projector: audioStateProjector,
  toTransportDelta,
  onProjectionFailure: () => {
    appReference.current?.markAudioUnavailable();
    if (store.getState().transport.status === "playing") {
      audio.stop();
      store.dispatch(store.createCommand("transport-stop", {}));
    }
  },
});

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
const effectDescriptorsByPluginId = Object.fromEntries(
  registryEntries.flatMap(([pluginId, entry]) =>
    entry.manifest.kind === "effect"
      ? [[pluginId, {
          stateSchemaVersion: entry.manifest.stateSchemaVersion,
          parameters: entry.manifest.parameters,
          placements: entry.manifest.placements,
        }]]
      : [],
  ),
);
const pluginMetadataByPluginId = Object.fromEntries(
  registryEntries.map(([pluginId, entry]) => [pluginId, {
    kind: entry.manifest.kind,
    pluginVersion: entry.manifest.pluginVersion,
    apiVersion: entry.manifest.apiVersion,
    stateSchemaVersion: entry.manifest.stateSchemaVersion,
  }]),
);
const parseOptions = {
  knownPluginIds: instrumentRegistryEntries.map(([pluginId]) => pluginId as string),
  parameterDescriptorsByPluginId: Object.fromEntries(
    instrumentRegistryEntries.map(([pluginId, entry]) => [pluginId, entry.manifest.parameters]),
  ),
  stateSchemaVersionByPluginId: Object.fromEntries(
    registryEntries.map(([pluginId, entry]) => [pluginId, entry.manifest.stateSchemaVersion]),
  ),
  effectDescriptorsByPluginId,
  pluginMetadataByPluginId,
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
          pluginMetadataByPluginId,
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
        pluginMetadataByPluginId,
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
  addableEffectPluginIds: BUILT_IN_EFFECTS.map(({ manifest }) => manifest.pluginId),
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
    previewHumanize: (patternId, humanize) => {
      const patternIndex = patternIndexFor(store.getState(), patternId);
      if (patternIndex !== undefined) audio.previewPatternHumanize(patternIndex, humanize);
    },
    previewPatternPart: async (moduleId, part, timing) => {
      const module = store.getState().project.modules[moduleId];
      if (module === undefined) throw new Error("Cannot preview a missing module.");
      await audio.previewPatternPart(
        moduleId,
        {
          ...part,
          voiceCycleLengths: audioStateProjector.voiceCycleLengths(
            module.pluginId,
            part.voiceCycleLengths,
          ),
        },
        timing,
      );
    },
    previewChannelMix: (moduleId, field, value) => {
      audio.previewChannelMix(moduleId, field, value);
    },
    previewChannelSendAmount: (moduleId, sendBusId, amount) => {
      audio.previewChannelSendAmount(moduleId, sendBusId, amount);
    },
    previewSendReturnLevel: (sendBusId, returnLevel) => {
      audio.previewSendReturnLevel(sendBusId, returnLevel);
    },
    previewEffectMix: (effectInstanceId, mix) => {
      audio.previewEffectMix(effectInstanceId, mix);
    },
    previewEffectGain: (effectInstanceId, gainDecibels) => {
      audio.previewEffectGain(effectInstanceId, gainDecibels);
    },
    previewEffectParameter: (effectInstanceId, parameterId, value) => {
      audio.previewEffectParameter(effectInstanceId, parameterId, value);
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
    getMasterChainMeter: (position) => audio.getMasterChainMeter(position),
    getEffectMeter: (effectInstanceId, meterId) =>
      audio.getEffectMeter(effectInstanceId, meterId),
    resetMasterPeak: () => audio.resetMasterPeak(),
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
          createFresh: () => createDefaultProjectState(browserIdFactory, createEffectInstance),
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
  pluginMetadataByPluginId,
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

async function prepareImportedProject(
  candidate: PulseState,
): Promise<{ readonly activate: () => void; readonly dispose: () => void }> {
  const candidateAudio = createAudioRuntime();
  let activated = false;
  try {
    await applyFullAudioProjection(candidateAudio, audioStateProjector.project(candidate));
    await candidateAudio.activate();
  } catch (error) {
    candidateAudio.dispose();
    throw error;
  }

  return {
    activate: () => {
      audioProjectionCoordinator.suppressWhile(() => {
        if (store.getState().transport.status !== "stopped") {
          store.dispatch(store.createCommand("transport-stop", {}));
        }
        const loaded = store.loadProject(candidate.project);
        if (loaded.status !== "accepted") throw new Error(loaded.error.message);
      });
      const acceptedState = store.getState();
      const previousAudio = audio;
      audio = candidateAudio;
      void audioProjectionCoordinator.replaceRuntime(candidateAudio, () => {
        previousAudio.dispose();
      });
      // PulseStore owns the accepted revision. Project it before later deltas
      // so the prepared runtime does not keep the imported document revision.
      audioProjectionCoordinator.queueFullProjection(acceptedState);
      appReference.current?.reportAudioRuntimeState(audio.state);
      activated = true;
    },
    dispose: () => {
      if (!activated) candidateAudio.dispose();
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

function createEffectInstance(
  id: EffectInstanceId,
  pluginId: PluginId,
  placement?: ChainEffectPlacement,
): EffectInstanceState | undefined {
  const entry = registry.get(pluginId);
  if (
    entry?.manifest.kind !== "effect" ||
    (placement !== undefined && !entry.manifest.placements.includes(placement))
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    pluginId,
    stateVersion: entry.manifest.stateSchemaVersion,
    state: Object.freeze(effectStateDefaultsFor(entry.manifest.defaultState)),
    bypassed: false,
    mix: entry.manifest.defaultMix,
    gainDecibels: 0,
  });
}

function effectStateDefaultsFor(
  defaultState: Readonly<Record<string, unknown>>,
): Readonly<Record<string, number | boolean | string>> {
  const state = toParameterValues(defaultState);
  if (Object.keys(state).length !== Object.keys(defaultState).length) {
    throw new Error("Effect state must contain only finite scalar values.");
  }
  return state;
}

function manifestVersionFor(pluginId: string): number {
  const manifest = registry.get(pluginId as PluginId)?.manifest;
  if (manifest === undefined) throw new Error(`Cannot serialize an unknown plugin: ${pluginId}.`);
  return manifest.stateSchemaVersion;
}
