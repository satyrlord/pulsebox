import { describe, expect, it } from "vitest";

import { createAudioStateProjector } from "../../../src/composition/audio-state-projection";
import { createDefaultProjectState } from "../../../src/composition/default-project";
import { BUILT_IN_EFFECTS, BUILT_IN_MODULES } from "../../../src/engine/public";
import type { IdFactory, PluginId } from "../../../src/contracts";

function deterministicIds(): IdFactory {
  let value = 1;
  return { createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` };
}

describe("audio state projection", () => {
  it("builds the complete ordered engine view from durable state", () => {
    const state = createDefaultProjectState(deterministicIds());
    const manifests = new Map(
      [...BUILT_IN_MODULES, ...BUILT_IN_EFFECTS].map((entry) => [entry.manifest.pluginId, entry.manifest]),
    );
    const projectState = createAudioStateProjector(
      (pluginId: PluginId) => manifests.get(pluginId),
    ).project(state);

    expect(projectState.revision).toBe(state.project.revision);
    expect(projectState.modules).toHaveLength(Object.keys(state.project.modules).length);
    expect(projectState.arrangement.songEntries).toEqual([
      { patternIndex: 0, repeats: 8 },
      { patternIndex: 1, repeats: 16 },
      { patternIndex: 2, repeats: 8 },
      { patternIndex: 3, repeats: 16 },
      { patternIndex: 4, repeats: 8 },
    ]);
    expect(projectState.patternTiming).toEqual(
      state.project.patterns.map(({ humanize, seed }) => ({ humanize, seed })),
    );
    expect(projectState.routing.master.level).toBe(state.project.masterLevel);
    expect(projectState.routing.sends).toHaveLength(4);
  });
});
