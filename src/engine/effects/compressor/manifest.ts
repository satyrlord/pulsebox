import { defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({
    id: "threshold", name: "Threshold",
    description: "Sets the level where compression starts. Ratio sets how strongly levels above Threshold are reduced.",
    minimum: -60, maximum: 0, defaultValue: -18, step: 0.1, unit: "decibels", precision: 1,
  }),
  numericParameter({
    id: "ratio", name: "Ratio",
    description: "Sets compression strength above Threshold. Attack and Release set how quickly that reduction changes.",
    minimum: 1, maximum: 20, defaultValue: 4, step: 0.1, unit: "ratio", precision: 1,
  }),
  numericParameter({
    id: "attack", name: "Attack",
    description: "Sets how quickly compression reacts after the signal crosses Threshold. Ratio sets the amount of reduction.",
    minimum: 0.1, maximum: 200, defaultValue: 10, step: 0.1, unit: "milliseconds", precision: 1,
  }),
  numericParameter({
    id: "release", name: "Release",
    description: "Sets how quickly compression stops after the signal falls below Threshold. Makeup then raises the compressed output.",
    minimum: 5, maximum: 2000, defaultValue: 120, step: 1, unit: "milliseconds", precision: 0,
  }),
  numericParameter({
    id: "makeup", name: "Makeup",
    description: "Raises the compressed signal before Mix and Gain. Use it to offset reduction from Threshold and Ratio.",
    minimum: 0, maximum: 24, defaultValue: 0, step: 0.1, unit: "decibels", precision: 1,
  }),
];
export const COMPRESSOR_MANIFEST = defineEffectManifest({ id: "compressor", name: "Compressor", shortLabel: "COMP", parameters, compact: ["threshold", "ratio", "attack", "release"], sections: [{ id: "dynamics", name: "Dynamics", parameters: ["threshold", "ratio", "attack", "release", "makeup"] }], meters: [{ id: "gain-reduction", name: "Gain Reduction" }], defaultMix: 1, accent: ["#4E8DB8", "#27475C", "#78B9E3", "#3D7194"] });
