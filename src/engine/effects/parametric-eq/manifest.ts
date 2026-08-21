import { defineEffectManifest, numericParameter } from "../manifest";
const parameters = [
  numericParameter({
    id: "low-frequency", name: "Low Frequency",
    description: "Sets the low-band corner. Low Gain boosts or cuts frequencies below this point.",
    minimum: 20, maximum: 1000, defaultValue: 120, step: 1, unit: "hertz", precision: 0,
  }),
  numericParameter({
    id: "low-gain", name: "Low Gain",
    description: "Boosts or cuts the low band below Low Frequency. Mix blends the complete EQ result with the dry signal.",
    minimum: -18, maximum: 18, defaultValue: 0, step: 0.1, unit: "decibels", precision: 1,
  }),
  numericParameter({
    id: "mid-frequency", name: "Mid Frequency",
    description: "Sets the center of the mid band. Mid Gain changes its level, and Mid Q sets its width.",
    minimum: 100, maximum: 10000, defaultValue: 1200, step: 1, unit: "hertz", precision: 0,
  }),
  numericParameter({
    id: "mid-gain", name: "Mid Gain",
    description: "Boosts or cuts around Mid Frequency. Mid Q controls how wide that change is.",
    minimum: -18, maximum: 18, defaultValue: 0, step: 0.1, unit: "decibels", precision: 1,
  }),
  numericParameter({
    id: "mid-q", name: "Mid Q",
    description: "Sets the width of the Mid Gain change around Mid Frequency. Higher values make a narrower band.",
    minimum: 0.2, maximum: 12, defaultValue: 1, step: 0.1, unit: "ratio", precision: 1,
  }),
  numericParameter({
    id: "high-frequency", name: "High Frequency",
    description: "Sets the high-band corner. High Gain boosts or cuts frequencies above this point.",
    minimum: 1000, maximum: 20000, defaultValue: 8000, step: 1, unit: "hertz", precision: 0,
  }),
  numericParameter({
    id: "high-gain", name: "High Gain",
    description: "Boosts or cuts the high band above High Frequency. Mix blends the complete EQ result with the dry signal.",
    minimum: -18, maximum: 18, defaultValue: 0, step: 0.1, unit: "decibels", precision: 1,
  }),
];
export const PARAMETRIC_EQ_MANIFEST = defineEffectManifest({ id: "parametric-eq", name: "Parametric EQ", shortLabel: "EQ", parameters, compact: ["low-gain", "mid-frequency", "mid-gain", "high-gain"], sections: [{ id: "bands", name: "Bands", parameters: ["low-frequency", "low-gain", "mid-frequency", "mid-gain", "mid-q", "high-frequency", "high-gain"] }], defaultMix: 1, accent: ["#65A052", "#33512A", "#91D47B", "#507F41"] });
