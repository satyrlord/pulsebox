export { ACID_BASS_DEFAULT_PARAMETERS, ACID_BASS_MANIFEST } from "./modules/bass-mono/manifest";
export { createBassVoiceAdapter } from "./modules/bass-mono/adapter";
export {
  DRUMLINE_SIX_DEFAULT_PARAMETERS,
  DRUMLINE_SIX_MANIFEST,
} from "./modules/drumline-six/manifest";
export { createDrumlineVoiceAdapter } from "./modules/drumline-six/adapter";
export {
  DRUM_BASE_NOTE,
  DRUM_VOICE_IDS,
  DRUM_VOICE_NAMES,
  drumVoiceForNote,
  drumVoiceNote,
  type DrumVoiceId,
} from "./modules/drumline-six/voices";
export {
  TransportRuntime,
  type AudioRuntimeState,
  type TransportEngineDelta,
  type TransportModule,
  type TransportRuntimeOptions,
  type TransportRuntimeStatus,
} from "./transport/transport-runtime";
export {
  chainedStepResolver,
  loopingStepResolver,
  schedulePatternWindow,
  type PatternWindowRequest,
  type StepResolver,
} from "./transport/pattern-scheduler";
export {
  compareScheduledVoiceEvents,
  scheduledEventPriority,
  type PatternStepView,
  type ScheduledVoiceEvent,
} from "./transport/scheduled-event";
export type {
  ParameterValue,
  VoiceAdapterFactory,
  VoiceAdapterOptions,
  VoiceAdapterPort,
  VoiceAdapterStatus,
  VoiceFault,
} from "./transport/voice-adapter";
export { TransportClock, type TransportSnapshot } from "./transport/transport-clock";
export { SampleDecoder } from "./decoding/sample-decoder";
export type { DecodedAudio, SupportedCodec } from "./decoding/bundled-decoders";
export { PluginRegistry, PluginRegistryValidationError, createPluginRegistry } from "./registry";
