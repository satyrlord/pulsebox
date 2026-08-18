import { defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({ id: "bits", name: "Bit Depth", minimum: 2, maximum: 16, defaultValue: 10, step: 1, precision: 0 }),
  numericParameter({ id: "rate", name: "Sample Rate", minimum: 0.02, maximum: 1, defaultValue: 0.55, step: 0.01, unit: "ratio" }),
  numericParameter({ id: "anti-alias", name: "Anti-alias", minimum: 0, maximum: 1, defaultValue: 0.7, step: 0.01, unit: "percent" }),
  numericParameter({ id: "character", name: "Character", minimum: 0, maximum: 1, defaultValue: 0.35, step: 0.01, unit: "percent" }),
];
export const LO_FI_MANIFEST = defineEffectManifest({ id: "lo-fi", name: "Lo-fi", shortLabel: "LOFI", parameters, compact: ["bits", "rate", "anti-alias", "character"], sections: [{ id: "crusher", name: "Crusher", parameters: ["bits", "rate", "anti-alias", "character"] }], accent: ["#B58B43", "#594522", "#E4B766", "#927035"] });
