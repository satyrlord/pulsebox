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
export { BOOM_EIGHT_DEFAULT_PARAMETERS, BOOM_EIGHT_MANIFEST } from "./modules/boom-eight/manifest";
export { createBoomVoiceAdapter } from "./modules/boom-eight/adapter";
export {
  HYBRID_NINE_DEFAULT_PARAMETERS,
  HYBRID_NINE_MANIFEST,
} from "./modules/hybrid-nine/manifest";
export { createHybridVoiceAdapter } from "./modules/hybrid-nine/adapter";
export {
  DIGIT_SEVEN_DEFAULT_PARAMETERS,
  DIGIT_SEVEN_MANIFEST,
} from "./modules/digit-seven/manifest";
export { createDigitSevenVoiceAdapter } from "./modules/digit-seven/adapter";
export { DIGIT_FIVE_DEFAULT_PARAMETERS, DIGIT_FIVE_MANIFEST } from "./modules/digit-five/manifest";
export { createDigitFiveVoiceAdapter } from "./modules/digit-five/adapter";
export {
  auditionNoteFor,
  voiceNoteFor,
  voiceRosterFor,
  type VoiceRoster,
} from "./modules/voice-rosters";
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
