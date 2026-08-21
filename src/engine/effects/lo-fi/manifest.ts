import { defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({
    id: "bits", name: "Bit Depth",
    description: "Sets level resolution. Lower values add stronger steps, while Sample Rate sets time resolution and Anti-alias softens the result.",
    minimum: 2, maximum: 16, defaultValue: 10, step: 1, precision: 0,
  }),
  numericParameter({
    id: "rate", name: "Sample Rate",
    description: "Sets how often the signal updates. Bit Depth sets level steps, and Anti-alias filters the reduced-rate edge.",
    minimum: 0.02, maximum: 1, defaultValue: 0.55, step: 0.01, unit: "ratio",
  }),
  numericParameter({
    id: "anti-alias", name: "Anti-alias",
    description: "Blends in a low-pass filter after Sample Rate reduction. Higher values soften bright aliases, while Character adds saturation.",
    minimum: 0, maximum: 1, defaultValue: 0.7, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "character", name: "Character",
    description: "Adds soft saturation after crushing. Bit Depth and Sample Rate create the digital texture, while Character rounds its peaks.",
    minimum: 0, maximum: 1, defaultValue: 0.35, step: 0.01, unit: "percent",
  }),
];
export const LO_FI_MANIFEST = defineEffectManifest({ id: "lo-fi", name: "Lo-fi", shortLabel: "LOFI", parameters, compact: ["bits", "rate", "anti-alias", "character"], sections: [{ id: "crusher", name: "Crusher", parameters: ["bits", "rate", "anti-alias", "character"] }], defaultMix: 1, accent: ["#B58B43", "#594522", "#E4B766", "#927035"] });
