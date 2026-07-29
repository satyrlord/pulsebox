import { describe, expect, it } from "vitest";

import {
  findCompositionDomRenderingViolations,
  findForbiddenArtifactViolations,
  findForbiddenTechnologyViolations,
  findLayerViolations,
  findPluginBranchViolations,
  findRunNarrativeViolations,
  readCurrentArtifactUnits,
  readCurrentDocumentPaths,
  readCurrentSourceUnits,
  type SourceUnit,
} from "./source-policy";

function messages(violations: readonly { readonly message: string }[]): readonly string[] {
  return violations.map((violation) => violation.message);
}

describe("architecture source policy", () => {
  it("rejects DOM rendering in the composition boundary", () => {
    const fixture: readonly SourceUnit[] = [
      {
        path: "src/main.tsx",
        source:
          'const node = document.createElement("div"); host.replaceChildren(node); host.innerHTML = "";',
      },
    ];

    expect(findCompositionDomRenderingViolations(fixture)).toHaveLength(3);
  });

  it("keeps composition free of DOM rendering", () => {
    expect(findCompositionDomRenderingViolations(readCurrentSourceUnits())).toEqual([]);
  });

  it("rejects a private cross-layer dependency in a negative fixture", () => {
    const fixture: readonly SourceUnit[] = [
      { path: "src/ui/control.ts", source: 'import "../engine/private-graph";' },
      { path: "src/engine/private-graph.ts", source: "export const graph = {};" },
    ];

    expect(messages(findLayerViolations(fixture))).toEqual([
      "ui must not import engine through ../engine/private-graph.",
    ]);
  });

  it("allows UI to use a state public port", () => {
    const fixture: readonly SourceUnit[] = [
      { path: "src/ui/control.ts", source: 'import type { StorePort } from "../state/public";' },
      { path: "src/state/public.ts", source: "export interface StorePort {}" },
    ];

    expect(findLayerViolations(fixture)).toEqual([]);
  });

  it("keeps the current source tree inside the layer dependency matrix", () => {
    expect(findLayerViolations(readCurrentSourceUnits())).toEqual([]);
  });

  it("detects every prohibited technology class in negative fixtures", () => {
    const fixture: readonly SourceUnit[] = [
      {
        path: "src/engine/legacy.ts",
        source: "const node: ScriptProcessorNode = context.createScriptProcessor();",
      },
      { path: "src/ui/musical-input.ts", source: "navigator.requestMIDIAccess();" },
      { path: "src/composition/sw.ts", source: 'navigator.serviceWorker.register("/worker.js");' },
      { path: "src/ui/meter.ts", source: "const context = new AudioContext();" },
      { path: "src/state/project.ts", source: "interface Project { readonly node: AudioNode }" },
      {
        path: "src/engine/preview.ts",
        source: 'import { AcidBassDsp } from "./modules/bass-mono/dsp-core";',
      },
      { path: "scripts/server.mjs", source: 'const endpoint = "/api/projects";' },
      { path: "src/ui/rack-delete.ts", source: 'if (window.confirm("Delete module?")) remove();' },
    ];

    const violations = findForbiddenTechnologyViolations(fixture);
    expect(violations.some((violation) => violation.message.includes("ScriptProcessorNode"))).toBe(
      true,
    );
    expect(violations.some((violation) => violation.message.includes("MIDI"))).toBe(true);
    expect(violations.some((violation) => violation.message.includes("Service-worker"))).toBe(true);
    expect(violations.some((violation) => violation.message.includes("UI must not own"))).toBe(
      true,
    );
    expect(violations.some((violation) => violation.message.includes("State must not hold"))).toBe(
      true,
    );
    expect(violations.some((violation) => violation.message.includes("DSP cores"))).toBe(true);
    expect(violations.some((violation) => violation.message.includes("endpoint"))).toBe(true);
    expect(violations.some((violation) => violation.message.includes("confirmation dialogs"))).toBe(
      true,
    );
  });

  it("contains no MIDI, ScriptProcessor, or service-worker code", () => {
    expect(findForbiddenTechnologyViolations(readCurrentSourceUnits())).toEqual([]);
  });

  it("rejects PWA manifests", () => {
    expect(
      findForbiddenArtifactViolations([
        { path: "public/app.webmanifest", source: "{}" },
        {
          path: "index.html",
          source: '<link rel="manifest" href="/app.webmanifest">',
        },
      ]),
    ).toHaveLength(2);
  });

  it("contains no PWA manifest artifact", () => {
    expect(findForbiddenArtifactViolations(readCurrentArtifactUnits())).toEqual([]);
  });

  it("rejects verification evidence, handoffs, and dated run reports", () => {
    expect(
      messages(
        findRunNarrativeViolations([
          "docs/verification/phase-1.md",
          "HANDOFF.md",
          "docs/phase-2.md",
          "docs/2026-07-27-review.md",
        ]),
      ),
    ).toEqual([
      "Verification evidence must use an ignored temporary path.",
      "Handoff and session reports must use an ignored temporary path.",
      "Dated and per-phase run reports must use an ignored temporary path.",
      "Dated and per-phase run reports must use an ignored temporary path.",
    ]);
  });

  it("keeps owning contracts and the required naming audit allowed", () => {
    expect(
      findRunNarrativeViolations([
        "AGENTS.md",
        "README.md",
        "docs/ARCHITECTURE.md",
        "docs/audits/naming-originality-audit.md",
        "docs/instruments/acid-bass.md",
        "docs/specs/spec-010-quality-and-delivery.md",
      ]),
    ).toEqual([]);
  });

  it("contains no run narrative in the repository tree", () => {
    expect(findRunNarrativeViolations(readCurrentDocumentPaths())).toEqual([]);
  });

  it("rejects concrete plugin-ID branching outside plugin and registry code", () => {
    const fixture: readonly SourceUnit[] = [
      {
        path: "src/engine/modules/bass-mono/plugin.ts",
        source: 'export const pluginId = "bass-mono";',
      },
      {
        path: "src/state/projector.ts",
        source:
          'export function project(pluginId: string) { if (pluginId === "bass-mono") return 1; return 0; }',
      },
    ];

    expect(findPluginBranchViolations(fixture)).toHaveLength(1);
  });

  it("rejects manifest-derived plugin-ID branching outside plugin and registry code", () => {
    const fixture: readonly SourceUnit[] = [
      {
        path: "src/engine/modules/bass-mono/plugin.ts",
        source: 'export const pluginId = "bass-mono";',
      },
      {
        path: "src/ui/rack.ts",
        source:
          "declare const ACID_BASS_MANIFEST: { pluginId: string }; declare const pluginId: string; if (pluginId === ACID_BASS_MANIFEST.pluginId) {}",
      },
    ];

    expect(findPluginBranchViolations(fixture)).toHaveLength(1);
  });

  it("allows generic plugin-ID validation and comparison", () => {
    const fixture: readonly SourceUnit[] = [
      {
        path: "src/engine/modules/bass-mono/plugin.ts",
        source: 'export const pluginId = "bass-mono";',
      },
      {
        path: "src/contracts/plugins.ts",
        source: [
          "declare function parsePluginId(value: string): { ok: boolean };",
          "export function validate(pluginId: string, expectedPluginId: string) {",
          "  const parsedPluginId = parsePluginId(pluginId);",
          "  if (!parsedPluginId.ok) return false;",
          "  return pluginId === expectedPluginId;",
          "}",
        ].join("\n"),
      },
    ];

    expect(findPluginBranchViolations(fixture)).toEqual([]);
  });

  it("contains no product-specific plugin-ID branches outside plugin and registry code", () => {
    expect(findPluginBranchViolations(readCurrentSourceUnits())).toEqual([]);
  });
});
