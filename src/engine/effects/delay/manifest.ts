import { booleanParameter, defineEffectManifest, enumParameter, numericParameter } from "../manifest";

const parameters = [
  enumParameter(
    "mode",
    "Mode",
    "Selects echo tone. Analog adds saturation in the feedback path. Clean keeps only the Feedback Filter color.",
    ["analog", "clean"],
    "analog",
  ),
  booleanParameter(
    "tempo-sync",
    "Tempo Sync",
    "Uses transport tempo and Beat Time instead of Time. Feedback and Feedback Filter do not change.",
    true,
  ),
  numericParameter({
    id: "time", name: "Time",
    description: "Sets delay time in milliseconds when Tempo Sync is off. Tempo Sync replaces it with Beat Time.",
    minimum: 10, maximum: 2000, defaultValue: 375, step: 1, unit: "milliseconds", precision: 0, smoothing: 20,
  }),
  numericParameter({
    id: "beat-time", name: "Beat Time",
    description: "Sets delay length in beats when Tempo Sync is on. Transport tempo converts it to time, and Time is inactive.",
    minimum: 0.0625, maximum: 4, defaultValue: 0.5, step: 0.0625, unit: "beats",
  }),
  numericParameter({
    id: "feedback", name: "Feedback",
    description: "Sets how much delayed signal repeats. Feedback Filter shapes each repeat, and Ping-pong sets its stereo path.",
    minimum: 0, maximum: 0.92, defaultValue: 0.42, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "filter", name: "Feedback Filter",
    description: "Sets the low-pass cutoff inside Feedback. Lower values make each repeat darker, while Feedback sets repeat length.",
    minimum: 300, maximum: 18000, defaultValue: 4800, step: 1, unit: "hertz", precision: 0,
  }),
  booleanParameter(
    "ping-pong",
    "Ping-pong",
    "Alternates repeats between channels. Feedback sets repeat amount, and Feedback Filter shapes each pass.",
    true,
  ),
];
export const DELAY_MANIFEST = defineEffectManifest({ id: "delay", name: "Analog Echo", shortLabel: "ECHO", parameters, compact: ["time", "feedback", "filter"], sections: [{ id: "timing", name: "Timing", parameters: ["tempo-sync", "time", "beat-time"] }, { id: "echo", name: "Echo", parameters: ["mode", "feedback", "filter", "ping-pong"] }], visibility: [{ parameterId: "time", gateParameterId: "tempo-sync", gateValue: false }, { parameterId: "beat-time", gateParameterId: "tempo-sync", gateValue: true }], tailMilliseconds: 12000, cpuClass: "moderate", defaultMix: 0.35, accent: ["#B66B46", "#5B3624", "#E99970", "#914F31"] });
