import { describe, expect, it } from "vitest";

import { browserIdFactory, type ProjectRevision } from "../../../src/contracts";
import { ACID_BASS_MANIFEST } from "../../../src/engine/public";
import {
  createDefaultState,
  createAutosave,
  createMemoryProjectRepository,
  documentToState,
  nextProjectRevision,
  parseProjectDocument,
  parseProjectJson,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  parsePortableProject,
  parseStoredProject,
  serializeProject,
  serializePortableProject,
  serializeProjectToJson,
  type ModuleSeed,
  type ProjectDocument,
} from "../../../src/state/public";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearanceEnvelope,
  serializeAppearance,
} from "../../../src/themes";

const SEED: ModuleSeed = {
  pluginId: ACID_BASS_MANIFEST.pluginId,
  parameters: { cutoff: 720, resonance: 0.38, waveform: "saw" },
  steps: Array.from({ length: 16 }, (_, index) => ({
    active: index % 4 === 0,
    note: 36,
    velocity: 0.8,
    accent: index === 0,
    slide: false,
  })),
};

const OPTIONS = {
  createdAt: "2026-07-28T00:00:00.000Z",
  modifiedAt: "2026-07-28T00:00:00.000Z",
  projectRevision: {
    epoch: "0b32ad32-3584-4a91-a012-5eaa968af162" as const,
    counter: 0,
  } as ProjectRevision,
};

const TEST_ID_FACTORY = {
  createUuid: () => "c050f0fb-b0f2-4e7a-9e02-92fd6f5fe9bd",
};

const PARSE = {
  knownPluginIds: [ACID_BASS_MANIFEST.pluginId as string],
  parameterDescriptorsByPluginId: {
    [ACID_BASS_MANIFEST.pluginId]: ACID_BASS_MANIFEST.parameters,
  },
};

function document(): ProjectDocument {
  return serializeProject(createDefaultState(browserIdFactory, SEED), OPTIONS);
}

describe("project document", () => {
  it("writes the specified root record", () => {
    const written = document();
    expect(written.format).toBe(PROJECT_FORMAT);
    expect(written.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(Object.keys(written).sort()).toEqual([
      "activePatternIndex",
      "assets",
      "automation",
      "effects",
      "format",
      "formatVersion",
      "migrations",
      "mixer",
      "patterns",
      "plugins",
      "project",
      "rack",
      "song",
      "songEnabled",
    ]);
  });

  it("round-trips a project through JSON without losing pattern or parameter data", () => {
    const state = createDefaultState(browserIdFactory, SEED);
    const json = serializeProjectToJson(state, OPTIONS);
    const parsed = parseProjectJson(json, PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));

    const restored = documentToState(parsed.value, state);
    const before = Object.values(state.project.modules)[0];
    const after = Object.values(restored.project.modules)[0];

    expect(after?.pluginId).toBe(before?.pluginId);
    expect(after?.parameters).toEqual(before?.parameters);
    expect(after?.parts).toEqual(before?.parts);
    expect(restored.project.tempo).toBe(state.project.tempo);
    expect(restored.project.rackSlots).toHaveLength(state.project.rackSlots.length);
  });

  it("records exactly the plugins the project requires", () => {
    expect(document().plugins).toEqual([
      { pluginId: ACID_BASS_MANIFEST.pluginId, stateSchemaVersion: 1 },
    ]);
  });

  it("rejects a document that is not the project format", () => {
    const result = parseProjectDocument({ format: "something-else" }, PARSE);
    expect(result.ok).toBe(false);
  });

  it("rejects a format version newer than this build reads", () => {
    const result = parseProjectDocument({ ...document(), formatVersion: 99 }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("cannot open format 99");
  });

  it("rejects unknown root keys rather than ignoring them", () => {
    const result = parseProjectDocument({ ...document(), script: "alert(1)" }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("script");
  });

  it("rejects a project that requires a plugin this build cannot instantiate", () => {
    const result = parseProjectDocument(document(), {
      knownPluginIds: [],
      parameterDescriptorsByPluginId: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("cannot open");
  });

  it("rejects a rack over the eight-slot cap and reports every over-cap slot", () => {
    const written = document();
    const oversized = {
      ...written,
      rack: [...written.rack, ...written.rack, { id: "slot-09" }],
    };
    const result = parseProjectDocument(oversized, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(1);
    expect(result.issues.every((issue) => issue.path.startsWith("rack"))).toBe(true);
  });

  it("rejects a tempo outside the supported range", () => {
    const written = document();
    const result = parseProjectDocument(
      { ...written, project: { ...written.project, tempo: 999 } },
      PARSE,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed step record", () => {
    const written = document();
    const patterns = [{ ...written.patterns[0], steps: [{ active: "yes", note: 36 }] }];
    const result = parseProjectDocument({ ...written, patterns }, PARSE);
    expect(result.ok).toBe(false);
  });

  it("rejects malformed rack records and accumulates bounded semantic errors", () => {
    const written = document();
    const result = parseProjectDocument(
      {
        ...written,
        rack: [null, ...written.rack.slice(1, 7), { id: "slot-08", moduleId: "not-a-uuid" }],
        project: { ...written.project, swing: 200 },
      },
      PARSE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "rack[0]")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "rack[7].moduleId")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "project.swing")).toBe(true);
    expect(result.issues.length).toBeLessThanOrEqual(100);
  });

  it("rejects rack plugins without an exact declared requirement", () => {
    const written = document();
    const occupied = written.rack.findIndex((slot) => slot.moduleId !== undefined);
    const rack = written.rack.map((slot, index) =>
      index === occupied ? { ...slot, pluginId: "drum-analog-small" } : slot,
    );
    const result = parseProjectDocument(
      { ...written, rack },
      {
        knownPluginIds: [...PARSE.knownPluginIds, "drum-analog-small"],
        parameterDescriptorsByPluginId: PARSE.parameterDescriptorsByPluginId,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes("matching requirement"))).toBe(
      true,
    );
  });

  it("rejects pattern references to modules outside the rack", () => {
    const written = document();
    const patterns = written.patterns.map((pattern, index) =>
      index === 0 ? { ...pattern, moduleId: "4b50c90c-4e3c-4c92-a0f1-668291d20c25" } : pattern,
    );
    const result = parseProjectDocument({ ...written, patterns }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "patterns[0].moduleId")).toBe(true);
  });

  it("rejects duplicate object keys at any JSON nesting level before schema validation", () => {
    const json = serializeProjectToJson(createDefaultState(browserIdFactory, SEED), OPTIONS)
      .replace('"format":"pulsebox-project"', '"format":"pulsebox-project","format":"other"')
      .replace(/"tempo":\d+/, (tempo) => `${tempo},"\\u0074empo":121`);
    const result = parseProjectJson(json, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some(
        (issue) => issue.path === "$.format" && issue.message.includes("Duplicate"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.path === "$.project.tempo" && issue.message.includes("Duplicate"),
      ),
    ).toBe(true);
    expect(result.issues).toHaveLength(2);
  });

  it("caps duplicate-key reports at the semantic issue limit", () => {
    const json = `{${Array.from({ length: 102 }, (_, index) => `"same":${String(index)}`).join(",")}}`;
    const result = parseProjectJson(json, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(100);
    expect(result.issues.every((issue) => issue.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects unknown, mistyped, invalid-enum, and out-of-range plugin parameters", () => {
    const written = document();
    const occupied = written.rack.findIndex((slot) => slot.moduleId !== undefined);
    const rack = written.rack.map((slot, index) =>
      index === occupied
        ? {
            ...slot,
            parameters: {
              ...slot.parameters,
              cutoff: 12_001,
              resonance: "high",
              waveform: "triangle",
              invented: 0.5,
            },
          }
        : slot,
    );
    const result = parseProjectDocument({ ...written, rack }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const hasIssue = (parameter: string, message: string) =>
      result.issues.some(
        (issue) =>
          issue.path === `rack[${String(occupied)}].parameters.${parameter}` &&
          issue.message.includes(message),
      );
    expect(hasIssue("cutoff", "outside")).toBe(true);
    expect(hasIssue("resonance", "numeric")).toBe(true);
    expect(hasIssue("waveform", "enum")).toBe(true);
    expect(hasIssue("invented", "not declared")).toBe(true);
  });

  it("round-trips a deterministic canonical Store archive", () => {
    const written = document();
    const first = serializePortableProject(written);
    const second = serializePortableProject(written);
    expect(first).toEqual(second);
    expect(new DataView(first.buffer, first.byteOffset, first.byteLength).getUint32(0, true)).toBe(
      0x04034b50,
    );
    const parsed = parsePortableProject(first, PARSE);
    expect(parsed.ok).toBe(true);
  });

  it("rejects portable archives with trailing data or a bad CRC", () => {
    const archive = serializePortableProject(document());
    const trailing = new Uint8Array(archive.length + 1);
    trailing.set(archive);
    expect(parsePortableProject(trailing, PARSE).ok).toBe(false);

    const corrupt = archive.slice();
    const manifestOffset = 30 + "manifest.json".length;
    corrupt[manifestOffset] = (corrupt[manifestOffset] ?? 0) ^ 1;
    const parsed = parsePortableProject(corrupt, PARSE);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.message).toContain("CRC-32");
  });

  it("rejects a file that is not valid JSON", () => {
    expect(parseProjectJson("{ nope", PARSE).ok).toBe(false);
  });

  it("rejects a file beyond the size limit before parsing it", () => {
    const result = parseProjectJson("x".repeat(33 * 1024 * 1024), PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("size limit");
  });
});

describe("project repository", () => {
  it("saves, lists, loads, and removes a project", async () => {
    const repository = createMemoryProjectRepository();
    const stored = {
      id: "project-1",
      name: "Neon Basement",
      modifiedAt: OPTIONS.modifiedAt,
      document: document(),
    };

    const committed = await repository.save(stored, TEST_ID_FACTORY);
    expect(committed.document.project.revision).toBe(0);
    expect(committed.document.project.revisionEpoch).toBe(TEST_ID_FACTORY.createUuid());
    expect(await repository.list()).toHaveLength(1);
    expect((await repository.load("project-1"))?.name).toBe("Neon Basement");

    await repository.remove("project-1");
    expect(await repository.load("project-1")).toBeUndefined();
  });

  it("advances only committed ProjectRevision tokens and rolls over safely", async () => {
    const repository = createMemoryProjectRepository();
    const state = createDefaultState(browserIdFactory, SEED);
    const candidate = {
      id: state.project.id,
      name: state.project.name,
      modifiedAt: OPTIONS.modifiedAt,
      document: serializeProject(state, OPTIONS),
    };
    const first = await repository.save(candidate, TEST_ID_FACTORY);
    const second = await repository.save(candidate, TEST_ID_FACTORY);
    expect(first.document.project.revision).toBe(0);
    expect(second.document.project.revision).toBe(1);
    expect(second.document.project.revisionEpoch).toBe(first.document.project.revisionEpoch);

    const rolled = nextProjectRevision(
      { epoch: first.document.project.revisionEpoch as never, counter: Number.MAX_SAFE_INTEGER },
      TEST_ID_FACTORY,
    );
    expect(rolled).toEqual({ epoch: TEST_ID_FACTORY.createUuid(), counter: 0 });
  });

  it("keeps exactly one autosave snapshot", async () => {
    const repository = createMemoryProjectRepository();
    const first = { id: "a", name: "A", modifiedAt: OPTIONS.modifiedAt, document: document() };
    const second = { id: "b", name: "B", modifiedAt: OPTIONS.modifiedAt, document: document() };

    await repository.saveAutosave(first);
    await repository.saveAutosave(second);
    expect((await repository.loadAutosave())?.id).toBe("b");

    await repository.clearAutosave();
    expect(await repository.loadAutosave()).toBeUndefined();
  });

  it("uses the creation timestamp of the currently loaded project for autosave", async () => {
    const repository = createMemoryProjectRepository();
    const state = createDefaultState(browserIdFactory, SEED);
    let createdAt = "2026-07-20T00:00:00.000Z";
    const autosave = createAutosave({
      repository,
      parseOptions: PARSE,
      createdAt: () => createdAt,
      now: () => "2026-07-29T00:00:00.000Z",
      projectRevision: () => OPTIONS.projectRevision,
    });

    await autosave.flush(state);
    expect((await repository.loadAutosave())?.document.project.createdAt).toBe(createdAt);

    createdAt = "2026-07-21T00:00:00.000Z";
    await autosave.flush(state);
    expect((await repository.loadAutosave())?.document.project.createdAt).toBe(createdAt);
    autosave.dispose();
  });

  it("validates the IndexedDB wrapper before returning a stored project", () => {
    const written = document();
    const result = parseStoredProject(
      {
        id: written.project.id,
        name: "A different name",
        modifiedAt: written.project.modifiedAt,
        document: written,
      },
      PARSE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "name",
      message: "Stored record name does not match project metadata.",
    });
  });
});

describe("legacy saved data", () => {
  /**
   * The appearance preference is the only data any earlier build ever wrote, so
   * it is the whole legacy-migration surface. It must keep loading unchanged.
   */
  it("still reads the version 1 appearance envelope written by earlier builds", () => {
    expect(APPEARANCE_STORAGE_KEY).toBe("pulsebox.ui.appearance.v1");

    const legacy = JSON.stringify({
      version: 1,
      highContrast: true,
      theme: "cosmic",
      userTheme: null,
    });
    const parsed = parseAppearanceEnvelope(legacy);
    expect(parsed).toEqual({ highContrast: true, theme: "cosmic", userTheme: null });
  });

  it("falls back to the default appearance when the stored value is unreadable", () => {
    expect(parseAppearanceEnvelope("not json")).toBeUndefined();
    expect(parseAppearanceEnvelope(null)).toBeUndefined();
  });

  it("writes an envelope its own reader accepts", () => {
    const round = parseAppearanceEnvelope(serializeAppearance(DEFAULT_APPEARANCE));
    expect(round).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("format 1 documents", () => {
  it("round-trips the full bank, mixer, and song through JSON", () => {
    const base = createDefaultState(browserIdFactory, SEED);
    const state = {
      ...base,
      project: {
        ...base.project,
        swing: 0.4,
        masterLevel: 0.55,
        activePatternIndex: 2,
        song: { enabled: true, entries: [{ patternIndex: 1, repeats: 3 }] },
      },
    };

    const json = serializeProjectToJson(state, OPTIONS);
    const parsed = parseProjectJson(json, PARSE);
    if (!parsed.ok) throw new Error(parsed.issues[0]?.message ?? "Expected a valid document.");
    const restored = documentToState(parsed.value, base);

    expect(restored.project.swing).toBe(0.4);
    expect(restored.project.masterLevel).toBe(0.55);
    expect(restored.project.activePatternIndex).toBe(2);
    expect(restored.project.song).toEqual({
      enabled: true,
      entries: [{ patternIndex: 1, repeats: 3 }],
    });
  });
});

describe("global swing", () => {
  /** Decision D69: one project-wide Swing value, stored as percent. */
  it("stores Swing in project metadata as percent and restores it as a ratio", () => {
    const base = createDefaultState(browserIdFactory, SEED);
    const state = { ...base, project: { ...base.project, swing: 0.54 } };

    const written = serializeProject(state, OPTIONS);
    expect(written.project.swing).toBe(54);
    expect("swing" in written).toBe(false);

    const parsed = parseProjectDocument(written, PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(documentToState(parsed.value, base).project.swing).toBeCloseTo(0.54, 5);
  });

  it("defaults Swing to straight when an older document omits it", () => {
    const base = createDefaultState(browserIdFactory, SEED);
    const written = serializeProject(base, OPTIONS);
    const metadata: Record<string, unknown> = { ...written.project };
    delete metadata.swing;

    const parsed = parseProjectDocument({ ...written, project: metadata }, PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(documentToState(parsed.value, base).project.swing).toBe(0);
  });

  it("rejects a Swing percent outside 0 through 100", () => {
    const written = document();
    const result = parseProjectDocument(
      { ...written, project: { ...written.project, swing: 101 } },
      PARSE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "project.swing")).toBe(true);
  });
});
