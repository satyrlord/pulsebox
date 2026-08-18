import { defineEffectManifest, enumParameter, numericParameter } from "../manifest";

const parameters = [
  enumParameter("model", "Model", ["drive", "fold", "asymmetric"], "drive"),
  numericParameter({ id: "drive", name: "Drive", minimum: 1, maximum: 12, defaultValue: 3.2, step: 0.1, unit: "ratio", precision: 1 }),
  numericParameter({ id: "tone", name: "Tone", minimum: 200, maximum: 18000, defaultValue: 7200, step: 1, unit: "hertz", precision: 0 }),
  numericParameter({ id: "mix", name: "Mix", minimum: 0, maximum: 1, defaultValue: 1, step: 0.01, unit: "percent" }),
];
export const DISTORTION_MANIFEST = defineEffectManifest({ id: "distortion", name: "Distortion", shortLabel: "DIST", parameters, compact: ["model", "drive", "tone", "mix"], sections: [{ id: "distortion", name: "Distortion", parameters: ["model", "drive", "tone", "mix"] }], placements: ["module-pedalboard", "send-chain", "master-chain"], accent: ["#DC7A4B", "#6D3D26", "#FFAA79", "#B85E35"] });
