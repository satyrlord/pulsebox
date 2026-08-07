import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  findContrastFailures,
  relativeLuminance,
} from "../../../src/themes/contrast";
import { BUILT_IN_PALETTES } from "../../../src/themes/tokens";

describe("contrast calculation", () => {
  it("matches published reference luminance values", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 10);
    expect(relativeLuminance("#808080")).toBeCloseTo(0.215_86, 4);
  });

  it("matches published reference contrast ratios", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 10);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 10);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.478, 3);
    // #767676 on white is the canonical smallest grey that still reaches 4.5:1.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.542, 3);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(4.5);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThan(4.5);
  });

  it("is symmetric in its arguments", () => {
    expect(contrastRatio("#1A2B3C", "#D4C3B2")).toBeCloseTo(
      contrastRatio("#D4C3B2", "#1A2B3C"),
      12,
    );
  });
});

describe("built-in palette accessibility", () => {
  it("reports every failing pair rather than only the first", () => {
    const broken = {
      ...BUILT_IN_PALETTES.rack,
      "--pulse-color-text-primary": "#0C0E10",
      "--pulse-color-text-secondary": "#0C0E10",
    };
    const failures = findContrastFailures(broken);
    const foregrounds = new Set(failures.map((failure) => failure.foreground));
    expect(foregrounds).toContain("--pulse-color-text-primary");
    expect(foregrounds).toContain("--pulse-color-text-secondary");
  });
});
