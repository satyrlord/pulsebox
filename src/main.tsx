import {
  type EffectInstanceId,
  type EffectInstanceState,
  type ModuleInstanceId,
  type PluginId,
  type ProjectRevision,
  type SendBusId,
} from "./contracts";
import { browserIdFactory } from "./composition/browser-id-factory";
import { toTransportDelta } from "./composition/audio-delta-projection";
import {
  BUILT_IN_MODULES,
  BUILT_IN_EFFECTS,
  TransportRuntime,
  auditionNoteFor,
  playableNotesFor,
  createPluginRegistry,
  createEffectWorkletPort,
  type RoutingEffectInstance,
  type TransportModule,
  type TransportRoutingProjection,
  type TransportExternalAutomationProjection,
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
  createDefaultProjectState(browserIdFactory, createEffectInstance),
  browserIdFactory,
  (pluginId) => registry.get(pluginId)?.factory.moduleSeed,
  (delta) => queueAudioDelta(delta),
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
          voiceCycleLengths: voiceCycleLengthsByNote(
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
    previewEffectWetDry: (effectInstanceId, wetDry) => {
      audio.previewEffectWetDry(effectInstanceId, wetDry);
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

function queueAudioDelta(delta: PulseEngineDelta): void {
  if (suppressAudioProjection) return;
  const acceptedState = store.getState();
  const transportDelta = toTransportDelta(delta, acceptedState);
  const moduleId =
    typeof transportDelta.payload.moduleId === "string"
      ? (transportDelta.payload.moduleId as ModuleInstanceId)
      : undefined;
  const module = moduleId === undefined ? undefined : acceptedState.project.modules[moduleId];
  const moduleProjection =
    module === undefined ? undefined : toAudioModule(acceptedState, module);
  const fullProjection =
    transportDelta.kind === "project-replace" ? toAudioModules(acceptedState) : undefined;
  const fullRouting =
    transportDelta.kind === "project-replace" ? toAudioRouting(acceptedState) : undefined;

  audioProjectionQueue = audioProjectionQueue
    .then(async () => {
      // A full replacement owns every ordered engine view. Keep these updates
      // in the same queue as its revision so another delta cannot pass them.
      if (transportDelta.kind === "project-replace") {
        audio.setArrangement(toAudioArrangement(acceptedState));
        audio.setPatternTiming(toPatternTiming(acceptedState));
        audio.setSwing(acceptedState.project.swing);
        audio.setMasterLevel(acceptedState.project.masterLevel);
        if (fullRouting !== undefined) audio.setRoutingProjection(fullRouting);
      }
      if (
        transportDelta.kind === "pattern-events-set" ||
        transportDelta.kind === "module-effects-set" ||
        transportDelta.kind === "mixer-set"
      ) {
        audio.setRoutingProjection(toAudioRouting(acceptedState));
      }
      await audio.project(transportDelta, moduleProjection, fullProjection);
    })
    .catch(() => replaceAudioProjection(store.getState()));
}

async function prepareImportedProject(
  candidate: PulseState,
): Promise<{ readonly activate: () => void; readonly dispose: () => void }> {
  const candidateAudio = createAudioRuntime();
  let activated = false;
  try {
    candidateAudio.setArrangement(toAudioArrangement(candidate));
    candidateAudio.setPatternTiming(toPatternTiming(candidate));
    candidateAudio.setSwing(candidate.project.swing);
    candidateAudio.setMasterLevel(candidate.project.masterLevel);
    candidateAudio.setRoutingProjection(toAudioRouting(candidate));
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
    audio.setArrangement(toAudioArrangement(state));
    audio.setPatternTiming(toPatternTiming(state));
    audio.setSwing(state.project.swing);
    audio.setMasterLevel(state.project.masterLevel);
    audio.setRoutingProjection(toAudioRouting(state));
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

/**
 * The engine receives an ordered scheduling view only. Project state keeps the
 * durable Pattern IDs, so a reorder or delete cannot redirect a module part or
 * Playlist placement. This view is rebuilt from those IDs at each projection.
 */
function toAudioArrangement(state: Readonly<PulseState>) {
  const patternIndex = patternIndexFor(state, state.project.activePatternId) ?? 0;
  const songEntries = state.project.song.placements.flatMap((placement) => {
    const index = patternIndexFor(state, placement.patternId);
    return index === undefined ? [] : [{ patternIndex: index, repeats: placement.repeatCount }];
  });
  return {
    activePatternIndex: patternIndex,
    songEnabled: state.project.song.enabled,
    songEntries,
  };
}

function patternIndexFor(state: Readonly<PulseState>, patternId: string): number | undefined {
  const index = state.project.patterns.findIndex((pattern) => pattern.id === patternId);
  return index < 0 ? undefined : index;
}

function toAudioModule(state: Readonly<PulseState>, module: RackModuleState): TransportModule {
  return {
    id: module.id,
    pluginId: module.pluginId,
    parameters: module.parameters,
    effects: resolveEffectChain(state, state.project.effects.moduleChains[module.id] ?? []),
    parts: state.project.patterns.map((pattern) => {
      const part = pattern.parts[module.id];
      return part === undefined
        ? { length: 16, durationSteps: pattern.durationBars * 16, events: [] }
        : {
            ...part,
            voiceCycleLengths: voiceCycleLengthsByNote(module.pluginId, part.voiceCycleLengths),
            durationSteps: pattern.durationBars * 16,
            automationSteps: part.automationLaneIds
              .flatMap((laneId) => {
                const lane = state.project.automationLanes[laneId];
                if (lane === undefined) return [];
                return lane.steps.map((step) => ({
                  parameterId: lane.parameterId,
                  positionTicks: step.tick,
                  value: step.value,
                }));
              })
              .sort(
                (left, right) =>
                  left.positionTicks - right.positionTicks ||
                  left.parameterId.localeCompare(right.parameterId),
              ),
          };
    }),
    mix: {
      level: module.level,
      pan: module.pan,
      muted: module.muted,
      solo: module.solo,
      sends: Object.entries(module.sends).map(([busId, send]) => ({
        busId: busId as SendBusId,
        amount: send.amount,
        mode: send.mode === "pre-fader" ? "pre" : "post",
      })),
    },
  };
}

function toAudioRouting(state: Readonly<PulseState>): TransportRoutingProjection {
  const sendChains = Object.entries(state.project.effects.sendChains).map(([busId, chain]) => ({
    busId: busId as SendBusId,
    returnLevel: chain.returnLevel,
    effects: resolveEffectChain(state, chain.slots),
    effectsBypassed: chain.bypassed,
  }));
  const masterEffects = resolveEffectChain(state, state.project.effects.masterChain);
  const limiter = masterEffects.at(-1);
  return {
    sends: sendChains,
    master: {
      level: state.project.masterLevel,
      effects: limiter === undefined ? [] : masterEffects.slice(0, -1),
      effectsBypassed: state.project.effects.masterEffectsBypassed,
      limiterBypassed: limiter?.bypassed ?? false,
      ...(limiter === undefined
        ? {}
        : {
            limiterState: limiter.state,
            limiterEffectId: limiter.id,
            limiterWetDry: limiter.wetDry,
            limiterWetDryLaw: limiter.wetDryLaw,
          }),
    },
    automation: toAudioExternalAutomation(state),
  };
}

function toAudioExternalAutomation(
  state: Readonly<PulseState>,
): TransportExternalAutomationProjection {
  const targets: Record<string, TransportExternalAutomationProjection["targets"][string]> = {};
  const parts = state.project.patterns.map((pattern) => {
    const automationSteps = pattern.automationLaneIds.flatMap((laneId) => {
      const lane = state.project.automationLanes[laneId];
      if (lane === undefined || lane.scope === "module") return [];
      targets[lane.id] = {
        scope: lane.scope,
        targetId: lane.targetId,
        parameterId: lane.parameterId,
      };
      return lane.steps.map((step) => ({
        parameterId: lane.id,
        positionTicks: step.tick,
        value: step.value,
      }));
    });
    return {
      length: 16,
      durationSteps: pattern.durationBars * 16,
      events: [],
      automationSteps: automationSteps.sort(
        (left, right) =>
          left.positionTicks - right.positionTicks ||
          left.parameterId.localeCompare(right.parameterId),
      ),
    };
  });
  return { parts, targets };
}

function resolveEffectChain(
  state: Readonly<PulseState>,
  slots: readonly (EffectInstanceId | null)[],
): readonly RoutingEffectInstance[] {
  return slots.flatMap((effectId) => {
    if (effectId === null) return [];
    const effect = state.project.effects.instances[effectId];
    if (effect === undefined) return [];
    const manifest = registry.get(effect.pluginId)?.manifest;
    return manifest?.kind === "effect"
      ? [{ ...effect, wetDryLaw: manifest.wetDryLaw }]
      : [];
  });
}

/** The state contract lets a drum part use its stable voice ID. The scheduler
 * sees notes only, so the composition boundary resolves that ID to its current
 * manifest note before it crosses into the engine projection. */
function voiceCycleLengthsByNote(
  pluginId: PluginId,
  cycleLengths: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const manifest = registry.get(pluginId)?.manifest;
  const notesByVoiceId =
    manifest?.kind === "instrument"
      ? new Map(manifest.voices.flatMap((voice) => (voice.note === undefined ? [] : [[voice.id, voice.note]])))
      : new Map<string, number>();
  return Object.fromEntries(
    Object.entries(cycleLengths).flatMap(([key, length]) => {
      const numericNote = Number(key);
      const note = Number.isInteger(numericNote) ? numericNote : notesByVoiceId.get(key);
      return note === undefined ? [] : [[String(note), length]];
    }),
  );
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
    wetDry: 1,
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
