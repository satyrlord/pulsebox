import { booleanParameter, defineEffectManifest, enumParameter, numericParameter } from "../manifest";

const parameters = [
  enumParameter("mode", "Mode", ["analog", "clean"], "analog"),
  booleanParameter("tempo-sync", "Tempo Sync", true),
  numericParameter({ id: "time", name: "Time", minimum: 10, maximum: 2000, defaultValue: 375, step: 1, unit: "milliseconds", precision: 0, smoothing: 20 }),
  numericParameter({ id: "beat-time", name: "Beat Time", minimum: 0.0625, maximum: 4, defaultValue: 0.5, step: 0.0625, unit: "beats" }),
  numericParameter({ id: "feedback", name: "Feedback", minimum: 0, maximum: 0.92, defaultValue: 0.42, step: 0.01, unit: "percent" }),
  numericParameter({ id: "filter", name: "Feedback Filter", minimum: 300, maximum: 18000, defaultValue: 4800, step: 1, unit: "hertz", precision: 0 }),
  booleanParameter("ping-pong", "Ping-pong", true),
];
export const DELAY_MANIFEST = defineEffectManifest({ id: "delay", name: "Analog Echo", shortLabel: "ECHO", parameters, compact: ["time", "feedback", "filter"], sections: [{ id: "timing", name: "Timing", parameters: ["tempo-sync", "time", "beat-time"] }, { id: "echo", name: "Echo", parameters: ["mode", "feedback", "filter", "ping-pong"] }], tailMilliseconds: 12000, cpuClass: "moderate", defaultMix: 0.35, accent: ["#B66B46", "#5B3624", "#E99970", "#914F31"] });
