import {
  browserIdFactory,
  type ModuleInstanceId,
} from "./contracts";
import {
  ACID_BASS_DEFAULT_PARAMETERS,
  ACID_BASS_MANIFEST,
  AcidBassRuntime,
  createPluginRegistry,
} from "./engine/public";
import {
  createDefaultState,
  PulseStore,
  type ModuleSeed,
  type ParameterValue,
  type PulseEngineDelta,
  type PulseState,
  type RackModuleState,
} from "./state/public";
import { mountPulseboxApp, type PulseboxAppHandle } from "./ui/public";

const visibleSlotCount = 3;
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

const moduleSeed: ModuleSeed = {
  pluginId: ACID_BASS_MANIFEST.pluginId,
  parameters: toParameterValues(ACID_BASS_DEFAULT_PARAMETERS),
  steps: initialSteps,
};

const appReference: { current: PulseboxAppHandle | undefined } = { current: undefined };
const registry = createPluginRegistry([
  {
    manifest: ACID_BASS_MANIFEST,
    factory: () => new AcidBassRuntime(undefined, (status) => {
      appReference.current?.reportAudioStatus(
        status.state,
        status.state === "recovered" ? undefined : status.fault.message,
      );
    }),
  },
]);
const audio = registry.require(ACID_BASS_MANIFEST.pluginId).factory();
let audioProjectionQueue = Promise.resolve();
const store = new PulseStore(
  createDefaultState(browserIdFactory, moduleSeed),
  browserIdFactory,
  moduleSeed,
  (delta) => queueAudioDelta(delta),
  validateParameter,
);

const app = mountPulseboxApp({
  addPluginId: ACID_BASS_MANIFEST.pluginId,
  audio: {
    getPositionTicks: () => audio.getPositionTicks(),
    pause: () => audio.pause(),
    play: (tempo) => audio.play(tempo),
    previewParameter: (moduleId, parameter, value) => {
      audio.previewParameter(moduleId, parameter, value);
    },
    stop: () => audio.stop(),
  },
  manifestFor: (pluginId) => registry.get(pluginId)?.manifest,
  store,
  visibleSlotCount,
});
appReference.current = app;
audioProjectionQueue = replaceAudioProjection(store.getState());

window.addEventListener("pagehide", () => {
  app.dispose();
  audio.dispose();
}, { once: true });

function queueAudioDelta(delta: PulseEngineDelta): void {
  const acceptedState = store.getState();
  const moduleId = typeof delta.payload.moduleId === "string"
    ? delta.payload.moduleId as ModuleInstanceId
    : undefined;
  const module = moduleId === undefined
    ? undefined
    : acceptedState.project.modules[moduleId];
  const moduleProjection = module === undefined ? undefined : toAudioModule(module);
  const fullProjection = delta.kind === "project-replace"
    ? toAudioModules(acceptedState)
    : undefined;

  audioProjectionQueue = audioProjectionQueue
    .then(() => audio.project(delta, moduleProjection, fullProjection))
    .catch(() => replaceAudioProjection(store.getState()));
}

async function replaceAudioProjection(state: Readonly<PulseState>): Promise<void> {
  try {
    await audio.replaceFromCurrentState(toAudioModules(state), state.project.revision);
  } catch {
    app.markAudioUnavailable();
    if (store.getState().transport.status === "playing") {
      audio.stop();
      store.dispatch(store.createCommand("transport-stop", {}));
    }
  }
}

function toAudioModules(state: Readonly<PulseState>) {
  return Object.values(state.project.modules).map((module) => toAudioModule(module));
}

function toAudioModule(module: RackModuleState) {
  return {
    id: module.id,
    parameters: module.parameters,
    steps: module.pattern.steps,
  };
}

function validateParameter(
  module: RackModuleState,
  parameter: string,
  value: ParameterValue,
): boolean {
  const descriptor = registry.get(module.pluginId)?.manifest.parameters.find(
    (candidate) => candidate.id === parameter,
  );
  if (descriptor === undefined) return false;
  if (descriptor.valueType === "enum") {
    return typeof value === "string" && descriptor.enumValues?.includes(value) === true;
  }
  if (descriptor.valueType === "boolean") return typeof value === "boolean";
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= (descriptor.minimum ?? value) &&
    value <= (descriptor.maximum ?? value);
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
