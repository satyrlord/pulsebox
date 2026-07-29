import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const SPECS_ROOT = resolve(ROOT, "docs/specs");
const INDEX_PATH = "docs/specs/spec-000-index.md";

const BUILD_ORDER = [
  {
    path: "docs/specs/spec-001-product-and-design-foundations.md",
    sections: [1, 2, 3, 11, 27],
  },
  {
    path: "docs/specs/spec-002-technical-foundations.md",
    sections: [4, 5, 6, 7],
  },
  {
    path: "docs/specs/spec-003-application-shell-and-controls.md",
    sections: [8, 10, 22],
  },
  {
    path: "docs/specs/spec-004-audio-engine-and-transport.md",
    sections: [12, 17, 21],
  },
  {
    path: "docs/specs/spec-005-rack-and-instruments.md",
    sections: [9, 13, 14, 15],
  },
  { path: "docs/specs/spec-006-pattern-editing.md", sections: [16] },
  { path: "docs/specs/spec-007-mixer-and-effects.md", sections: [19, 20] },
  { path: "docs/specs/spec-008-song-and-automation.md", sections: [18] },
  { path: "docs/specs/spec-009-persistence-and-export.md", sections: [23] },
  { path: "docs/specs/spec-010-quality-and-delivery.md", sections: [24] },
] as const;

const SUPPORTING_SPECS = [
  { path: "docs/specs/spec-011-decision-record.md", sections: [25] },
  { path: "docs/specs/spec-012-release-acceptance.md", sections: [26] },
] as const;

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function specId(path: string): string {
  const id = /^spec-[0-9]{3}/u.exec(basename(path))?.[0];
  if (id === undefined) {
    throw new TypeError(`Specification path has no stable ID: ${path}`);
  }
  return id;
}

function numberedSections(markdown: string): readonly number[] {
  return [...markdown.matchAll(/^## ([0-9]+)\./gmu)].map((match) => Number(match[1]));
}

function range(start: number, end: number): readonly number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function primaryAcceptanceIds(markdown: string): readonly number[] {
  const metadata = markdown.split(/\r?\n---\r?\n/u, 1)[0] ?? markdown;
  return [
    ...metadata.matchAll(/`AC-([0-9]{3})`(?:(?:\s+through\s+|\s*-\s*)`AC-([0-9]{3})`)?/gu),
  ].flatMap((match) => range(Number(match[1]), Number(match[2] ?? match[1])));
}

function acceptanceCriterion(markdown: string, id: number): string {
  const lines = markdown.split(/\r?\n/u);
  const marker = `${id.toString()}. **AC-${id.toString().padStart(3, "0")}.**`;
  const start = lines.findIndex((line) => line.startsWith(marker));
  if (start < 0) {
    throw new Error(`Missing acceptance criterion ${marker}`);
  }
  const next = lines.findIndex(
    (line, index) => index > start && /^[0-9]+\. \*\*AC-[0-9]{3}\.\*\*/u.test(line),
  );
  return lines.slice(start, next < 0 ? undefined : next).join("\n");
}

describe("product specification structure", () => {
  it("keeps one indexed file set in normative build order", () => {
    const expectedPaths = [
      INDEX_PATH,
      ...BUILD_ORDER.map(({ path }) => path),
      ...SUPPORTING_SPECS.map(({ path }) => path),
    ];
    const actualNames = readdirSync(SPECS_ROOT)
      .filter((name) => name.endsWith(".md"))
      .sort();

    expect(actualNames).toEqual(expectedPaths.map((path) => basename(path)).sort());

    const index = read(INDEX_PATH);
    const linkPositions = BUILD_ORDER.map(({ path }) => index.indexOf(`(${basename(path)})`));
    expect(linkPositions.every((position) => position >= 0)).toBe(true);
    expect(linkPositions).toEqual([...linkPositions].sort((left, right) => left - right));

    for (const { path } of BUILD_ORDER) {
      const indexRow = index.split(/\r?\n/u).find((line) => line.includes(`(${basename(path)})`));
      expect(primaryAcceptanceIds(indexRow ?? ""), path).toEqual(primaryAcceptanceIds(read(path)));
    }

    BUILD_ORDER.forEach(({ path }, indexPosition) => {
      const order = indexPosition + 1;
      const previousPath = indexPosition === 0 ? INDEX_PATH : BUILD_ORDER[indexPosition - 1]?.path;
      if (previousPath === undefined) {
        throw new TypeError(`Specification ${path} has no previous build stage.`);
      }

      const source = read(path);
      const header = source.split(/\r?\n---\r?\n/u, 1)[0] ?? source;
      const indexRow =
        index.split(/\r?\n/u).find((line) => line.includes(`(${basename(path)})`)) ?? "";
      const expectedIndexDependency =
        indexPosition === 0 ? "This index" : `\`${specId(previousPath)}\``;

      expect(header, path).toContain(`**Spec ID:** \`${specId(path)}\``);
      expect(header, path).toContain(
        `**Build order:** ${order.toString()} of ${BUILD_ORDER.length.toString()}`,
      );
      expect(header, path).toContain(`(${basename(previousPath)})`);
      expect(indexRow.split("|")[3]?.trim(), path).toBe(expectedIndexDependency);
    });
  });

  it("assigns every stable numbered section to exactly one file", () => {
    const sectionOwners = new Map<number, string>();
    const expected = [{ path: INDEX_PATH, sections: [0] }, ...BUILD_ORDER, ...SUPPORTING_SPECS];

    for (const { path, sections } of expected) {
      expect(numberedSections(read(path)), path).toEqual(sections);
      for (const section of sections) {
        expect(
          sectionOwners.has(section),
          `section ${section.toString()} has multiple owners`,
        ).toBe(false);
        sectionOwners.set(section, path);
      }
    }

    expect([...sectionOwners.keys()].sort((left, right) => left - right)).toEqual(range(0, 27));
  });

  it("keeps all decisions and release criteria stable and complete", () => {
    const decisionIds = [
      ...read(SUPPORTING_SPECS[0].path).matchAll(/^- \*\*D([0-9]{2})\.\*\*/gmu),
    ].map((match) => Number(match[1]));
    const acceptanceIds = [
      ...read(SUPPORTING_SPECS[1].path).matchAll(/^[0-9]+\. \*\*AC-([0-9]{3})\.\*\*/gmu),
    ].map((match) => Number(match[1]));

    expect(decisionIds).toEqual(range(1, 77));
    expect(acceptanceIds).toEqual(range(1, 86));

    const release = read(SUPPORTING_SPECS[1].path);
    const emptyMixer = acceptanceCriterion(release, 18);
    const compactMixer = acceptanceCriterion(release, 68);
    expect(emptyMixer).toContain("two-digit slot numbers");
    expect(emptyMixer).not.toContain("labeled `Empty`");
    // The mix bus is a send destination, never a send source. Decision D75.
    expect(compactMixer.replaceAll(/\s+/gu, " ")).toContain(
      "the master strip carries no A–D send or return grid",
    );
  });

  it("assigns every release criterion one primary build-order owner", () => {
    const ownedIds = BUILD_ORDER.flatMap(({ path }) => primaryAcceptanceIds(read(path))).sort(
      (left, right) => left - right,
    );

    expect(ownedIds).toEqual(range(1, 86));
  });
});
