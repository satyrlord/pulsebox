import { defineEffectManifest, numericParameter } from "../manifest";
const parameters = [
  numericParameter({
    id: "attack", name: "Attack",
    description: "Boosts or softens detected attack peaks. Sensitivity sets what counts as a transient, while Output sets the final level.",
    minimum: -1, maximum: 1, defaultValue: 0, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "sustain", name: "Sustain",
    description: "Boosts or softens the body between attack peaks. Sensitivity affects detection, and Output sets the final level.",
    minimum: -1, maximum: 1, defaultValue: 0, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "sensitivity", name: "Sensitivity",
    description: "Sets how strongly the detector separates attack peaks from the body. Attack and Sustain apply the resulting shape.",
    minimum: 0, maximum: 1, defaultValue: 0.5, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "output", name: "Output",
    description: "Sets level after Attack and Sustain shaping but before shared Mix and Gain.",
    minimum: -18, maximum: 0, defaultValue: -3, step: 0.1, unit: "decibels", precision: 1,
  }),
];
export const TRANSIENT_SHAPER_MANIFEST = defineEffectManifest({ id: "transient-shaper", name: "Transient Shaper", shortLabel: "TRAN", parameters, compact: ["attack", "sustain", "sensitivity", "output"], sections: [{ id: "shape", name: "Shape", parameters: ["attack", "sustain", "sensitivity", "output"] }], defaultMix: 1, accent: ["#BE704F", "#603928", "#EBA07E", "#985A3F"] });
