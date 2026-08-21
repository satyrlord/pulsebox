import { defineEffectManifest, numericParameter } from "../manifest";

const parameters = [
  numericParameter({
    id: "cutoff", name: "Cutoff",
    description: "Sets the low-pass edge. The Piano Roll cutoff lane moves it over time, Resonance emphasizes it, and Drive feeds it harder.",
    minimum: 40, maximum: 18000, defaultValue: 2400, step: 1, unit: "hertz",
  }),
  numericParameter({
    id: "resonance", name: "Resonance",
    description: "Emphasizes frequencies near Cutoff. Higher settings make cutoff movement stronger, while Drive changes the harmonics entering the filter.",
    minimum: 0, maximum: 1, defaultValue: 0.25, step: 0.01, unit: "percent",
  }),
  numericParameter({
    id: "drive", name: "Drive",
    description: "Adds saturation before the filter. Cutoff and Resonance then shape the added harmonics.",
    minimum: 0, maximum: 1, defaultValue: 0, step: 0.01, unit: "percent",
  }),
];
export const PATTERN_FILTER_MANIFEST = defineEffectManifest({ id: "pattern-filter", name: "Pattern Filter", shortLabel: "PTRN", parameters, compact: ["cutoff", "resonance", "drive"], sections: [{ id: "filter", name: "Filter and cutoff pattern", parameters: ["cutoff", "resonance", "drive"] }], defaultMix: 1, accent: ["#50A384", "#285243", "#7ED6B4", "#3F846B"] });
