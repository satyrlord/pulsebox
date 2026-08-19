import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  commandDomainByType,
  commandHandlerDomains,
} from "../../../src/state/command-handlers/router";

describe("state command handler architecture", () => {
  it("assigns each command type to one state domain", () => {
    expect(Object.keys(commandDomainByType)).toHaveLength(62);
    expect(new Set(Object.values(commandDomainByType))).toEqual(new Set(commandHandlerDomains));
  });

  it("keeps feature command cases out of PulseStore", async () => {
    const source = await readFile("src/state/pulse-store.ts", "utf8");

    expect(source).not.toMatch(/case\s+"(?:transport|rack|pattern|piano-roll|automation|song|mixer|effects)-/u);
    expect(source).toContain("applyPulseCommand(command");
    expect(source).not.toMatch(/#(?:setSwing|addModule|addPattern|setSong|toggleMix|addChainEffect)\b/u);
  });

  it("keeps command handler modules independent from the store commit owner", async () => {
    const directory = "src/state/command-handlers";
    const files = (await readdir(directory)).filter((file) => file.endsWith(".ts"));
    const sources = await Promise.all(
      files.map(async (file) => readFile(`${directory}/${file}`, "utf8")),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from\s+["'][^"']*pulse-store["']/u);
      expect(source).not.toMatch(/#(?:state|undo|redo)|onEngineDelta|\.notify\(/u);
    }

    const featureHandlers = await readFile(`${directory}/feature-handlers.ts`, "utf8");
    expect(featureHandlers).toContain("class FeatureCommandHandlers");
    expect(featureHandlers).toContain("readonly state: PulseState");
    expect(featureHandlers).toContain("readonly projectTransition:");
    expect(featureHandlers).toMatch(/#(?:setSwing|addModule|addPattern|setSong|toggleMix|addChainEffect)\b/u);

    for (const domain of ["transport", "rack", "pattern", "song", "mixer-effects"]) {
      expect(files).toContain(`${domain}.ts`);
    }
  });
});
