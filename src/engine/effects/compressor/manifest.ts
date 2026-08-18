import { defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({ id: "threshold", name: "Threshold", minimum: -60, maximum: 0, defaultValue: -18, step: 0.1, unit: "decibels", precision: 1 }),
  numericParameter({ id: "ratio", name: "Ratio", minimum: 1, maximum: 20, defaultValue: 4, step: 0.1, unit: "ratio", precision: 1 }),
  numericParameter({ id: "attack", name: "Attack", minimum: 0.1, maximum: 200, defaultValue: 10, step: 0.1, unit: "milliseconds", precision: 1 }),
  numericParameter({ id: "release", name: "Release", minimum: 5, maximum: 2000, defaultValue: 120, step: 1, unit: "milliseconds", precision: 0 }),
  numericParameter({ id: "makeup", name: "Makeup", minimum: 0, maximum: 24, defaultValue: 0, step: 0.1, unit: "decibels", precision: 1 }),
];
export const COMPRESSOR_MANIFEST = defineEffectManifest({ id: "compressor", name: "Compressor", shortLabel: "COMP", parameters, compact: ["threshold", "ratio", "attack", "release"], sections: [{ id: "dynamics", name: "Dynamics", parameters: ["threshold", "ratio", "attack", "release", "makeup"] }], meters: [{ id: "gain-reduction", name: "Gain Reduction" }], defaultMix: 1, accent: ["#4E8DB8", "#27475C", "#78B9E3", "#3D7194"] });
