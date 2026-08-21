import { booleanParameter, defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({
    id: "rate", name: "Rate",
    description: "Sets modulation speed in hertz when Tempo Sync is off. Tempo Sync replaces Rate with transport tempo.",
    minimum: 0.02, maximum: 8, defaultValue: 0.7, step: 0.01, unit: "hertz",
  }),
  numericParameter({
    id: "depth", name: "Depth",
    description: "Sets modulation sweep size. Rate or Tempo Sync sets speed, and Delay sets the center delay.",
    minimum: 0, maximum: 1, defaultValue: 0.55, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "delay", name: "Delay",
    description: "Sets the center delay of the chorus voices. Depth varies around it, and Rate or Tempo Sync sets motion speed.",
    minimum: 2, maximum: 30, defaultValue: 12, step: 0.1, unit: "milliseconds", precision: 1,
  }),
  booleanParameter(
    "tempo-sync",
    "Tempo Sync",
    "Follows transport tempo instead of Rate. Depth and Delay still set the modulation range and center.",
    false,
  ),
];
export const CHORUS_MANIFEST = defineEffectManifest({ id: "chorus", name: "Chorus", shortLabel: "CHOR", parameters, compact: ["rate", "depth", "delay"], sections: [{ id: "modulation", name: "Modulation", parameters: ["rate", "depth", "delay", "tempo-sync"] }], tailMilliseconds: 100, defaultMix: 0.45, accent: ["#4D9FA9", "#285156", "#7DD2DA", "#3D7F87"] });
