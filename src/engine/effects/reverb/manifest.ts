import { defineEffectManifest, enumParameter, numericParameter } from "../manifest";

const parameters = [
  enumParameter(
    "mode",
    "Mode",
    "Selects the reverb structure. Plate uses Pre-delay, Decay, Damping, and Shimmer.",
    ["plate"],
    "plate",
  ),
  numericParameter({
    id: "pre-delay", name: "Pre-delay",
    description: "Sets the gap before reverb starts. Decay controls tail length after that gap.",
    minimum: 0, maximum: 200, defaultValue: 22, step: 1, unit: "milliseconds", precision: 0,
  }),
  numericParameter({
    id: "decay", name: "Decay",
    description: "Sets how long the reverb tail lasts. Damping darkens the tail, and Shimmer adds a shifted layer.",
    minimum: 0.2, maximum: 12, defaultValue: 2.8, step: 0.1, unit: "seconds", precision: 1,
  }),
  numericParameter({
    id: "damping", name: "Damping",
    description: "Sets how much high-frequency content remains in the tail. Lower values darken long Decay settings faster.",
    minimum: 500, maximum: 18000, defaultValue: 6200, step: 1, unit: "hertz", precision: 0,
  }),
  numericParameter({
    id: "shimmer", name: "Shimmer",
    description: "Adds a shifted layer to the reverb tail. Decay sets its duration, and Damping shapes the base tail.",
    minimum: 0, maximum: 1, defaultValue: 0, step: 0.01, unit: "percent",
  }),
];
export const REVERB_MANIFEST = defineEffectManifest({ id: "reverb", name: "Plate Reverb", shortLabel: "PLAT", parameters, compact: ["pre-delay", "decay", "damping"], sections: [{ id: "plate", name: "Plate", parameters: ["mode", "pre-delay", "decay", "damping"] }, { id: "shimmer", name: "Shimmer", parameters: ["shimmer"] }], tailMilliseconds: 14000, cpuClass: "heavy", defaultMix: 0.3, accent: ["#7A6AB5", "#3E365B", "#A99AE0", "#615393"] });
