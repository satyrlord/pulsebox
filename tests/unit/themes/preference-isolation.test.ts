import { describe, expect, it } from "vitest";

import { readCurrentSourceUnits } from "../architecture/source-policy";

/**
 * Appearance is a global UI preference. THEMING.md sections 1 and 9 require it
 * to stay out of project data and out of every layer except the UI, so a theme
 * can never travel in a project file or mark one dirty.
 */
describe("appearance preference isolation", () => {
  const units = readCurrentSourceUnits();

  it("keeps theme and contrast out of the state and engine layers", () => {
    const offenders: string[] = [];
    for (const unit of units) {
      const path = unit.path.replaceAll("\\", "/");
      if (!path.startsWith("src/state/") && !path.startsWith("src/engine/")) continue;
      if (/\btheme\b|\bhighContrast\b|\bappearance\b/i.test(unit.source)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads and writes the appearance storage key only from the theme module", () => {
    const offenders: string[] = [];
    for (const unit of units) {
      const path = unit.path.replaceAll("\\", "/");
      if (!unit.source.includes("pulsebox.ui.appearance")) continue;
      if (!path.startsWith("src/themes/")) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("confines local storage access to the UI layer", () => {
    const offenders: string[] = [];
    for (const unit of units) {
      const path = unit.path.replaceAll("\\", "/");
      if (!unit.source.includes("localStorage")) continue;
      if (!path.startsWith("src/ui/") && !path.startsWith("src/themes/")) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});
