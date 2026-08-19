import { describe, expect, it } from "vitest";

import {
  PROJECT_FORMAT_FIXTURE_DEFINITIONS,
  type ProjectFormatFixtureGroup,
} from "./project-format-fixtures";

describe("Phase 0 project-format fixture definitions", () => {
  it("defines every required fixture group without duplicate IDs", () => {
    const ids = PROJECT_FORMAT_FIXTURE_DEFINITIONS.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);

    const counts = Object.fromEntries(
      (
        ["valid", "rejection", "repair", "storage"] satisfies readonly ProjectFormatFixtureGroup[]
      ).map((group) => [
        group,
        PROJECT_FORMAT_FIXTURE_DEFINITIONS.filter((fixture) => fixture.group === group).length,
      ]),
    );
    expect(counts).toEqual({ valid: 7, rejection: 12, repair: 5, storage: 10 });
  });

  it("gives every definition a stable ID", () => {
    for (const fixture of PROJECT_FORMAT_FIXTURE_DEFINITIONS) {
      expect(fixture.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
