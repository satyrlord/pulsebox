import { defineEffectManifest, numericParameter } from "../manifest";
const parameters = [
  numericParameter({
    id: "ceiling", name: "Ceiling",
    description: "Sets the maximum wet output level. Input drives signal into limiting, and Release sets how quickly gain recovers.",
    minimum: -12, maximum: 0, defaultValue: -0.8, step: 0.1, unit: "decibels", precision: 1,
  }),
  numericParameter({
    id: "input", name: "Input",
    description: "Raises signal before limiting. Ceiling sets the output cap, and Release sets how quickly limiting relaxes.",
    minimum: 0, maximum: 24, defaultValue: 0, step: 0.1, unit: "decibels", precision: 1,
  }),
  numericParameter({
    id: "release", name: "Release",
    description: "Sets how quickly limiter gain returns after peaks. Input controls how hard peaks hit Ceiling.",
    minimum: 5, maximum: 1000, defaultValue: 80, step: 1, unit: "milliseconds", precision: 0,
  }),
];
export const LIMITER_MANIFEST = defineEffectManifest({ id: "limiter", name: "True Peak Limiter", shortLabel: "TP", parameters, compact: ["ceiling", "input", "release"], sections: [{ id: "limiter", name: "True Peak Limiter", parameters: ["ceiling", "input", "release"] }], placements: ["master-chain"], meters: [{ id: "gain-reduction", name: "Gain Reduction" }], defaultMix: 1, accent: ["#C85151", "#652929", "#F17E7E", "#9E4040"] });
