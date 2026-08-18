import { booleanParameter, defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({ id: "rate", name: "Rate", minimum: 0.02, maximum: 8, defaultValue: 0.7, step: 0.01, unit: "hertz" }),
  numericParameter({ id: "depth", name: "Depth", minimum: 0, maximum: 1, defaultValue: 0.55, step: 0.01, unit: "percent" }),
  numericParameter({ id: "delay", name: "Delay", minimum: 2, maximum: 30, defaultValue: 12, step: 0.1, unit: "milliseconds", precision: 1 }),
  numericParameter({ id: "mix", name: "Mix", minimum: 0, maximum: 1, defaultValue: 0.45, step: 0.01, unit: "percent" }),
  booleanParameter("tempo-sync", "Tempo Sync", false),
];
export const CHORUS_MANIFEST = defineEffectManifest({ id: "chorus", name: "Chorus", shortLabel: "CHOR", parameters, compact: ["rate", "depth", "delay", "mix"], sections: [{ id: "modulation", name: "Modulation", parameters: ["rate", "depth", "delay", "mix", "tempo-sync"] }], tailMilliseconds: 100, accent: ["#4D9FA9", "#285156", "#7DD2DA", "#3D7F87"] });
