import { booleanParameter, defineEffectManifest, numericParameter } from "../manifest";
const parameters = [
  numericParameter({
    id: "rate", name: "Rate",
    description: "Sets sweep speed in hertz when Tempo Sync is off. Tempo Sync replaces Rate with transport tempo.",
    minimum: 0.02, maximum: 8, defaultValue: 0.35, step: 0.01, unit: "hertz",
  }),
  numericParameter({
    id: "depth", name: "Depth",
    description: "Sets how widely the filter notches sweep. Rate or Tempo Sync sets speed, and Feedback sharpens the effect.",
    minimum: 0, maximum: 1, defaultValue: 0.65, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "feedback", name: "Feedback",
    description: "Feeds the phased signal back to sharpen the notches. Depth sets sweep width, and Rate or Tempo Sync sets speed.",
    minimum: -0.85, maximum: 0.85, defaultValue: 0.25, step: 0.01, unit: "percent",
  }),
  booleanParameter(
    "tempo-sync",
    "Tempo Sync",
    "Follows transport tempo instead of Rate. Depth and Feedback still set the sweep shape.",
    false,
  ),
];
export const PHASER_MANIFEST = defineEffectManifest({ id: "phaser", name: "Phaser", shortLabel: "PHAS", parameters, compact: ["rate", "depth", "feedback"], sections: [{ id: "modulation", name: "Modulation", parameters: ["rate", "depth", "feedback", "tempo-sync"] }], defaultMix: 0.5, accent: ["#8C72B7", "#463A5C", "#BBA0E5", "#705992"] });
