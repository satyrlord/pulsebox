import { defineEffectManifest, numericParameter } from "../manifest";
const parameters = [
  numericParameter({
    id: "width", name: "Width",
    description: "Sets the filtered side signal around the unchanged mid signal. Side High-pass and Side Low-pass select affected frequencies.",
    minimum: 0, maximum: 2, defaultValue: 1, step: 0.01, unit: "ratio",
  }),
  numericParameter({
    id: "high-pass", name: "Side High-pass",
    description: "Removes low frequencies from the side signal before Width changes it. Side Low-pass sets the upper edge.",
    minimum: 20, maximum: 2000, defaultValue: 120, step: 1, unit: "hertz", precision: 0,
  }),
  numericParameter({
    id: "low-pass", name: "Side Low-pass",
    description: "Removes high frequencies from the side signal before Width changes it. Side High-pass sets the lower edge.",
    minimum: 2000, maximum: 20000, defaultValue: 14000, step: 1, unit: "hertz", precision: 0,
  }),
];
export const STEREO_WIDTH_MANIFEST = defineEffectManifest({ id: "stereo-width", name: "Stereo Width", shortLabel: "WIDE", parameters, compact: ["width", "high-pass", "low-pass"], sections: [{ id: "stereo", name: "Stereo", parameters: ["width", "high-pass", "low-pass"] }], channels: [2], defaultMix: 1, accent: ["#4E99B3", "#284D5A", "#7BC9E1", "#3E7B90"] });
