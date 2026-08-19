import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Automated naming and originality check, spec-001 section 2.3. Shipping text
 * must not contain a real-world manufacturer name or a historical product
 * model number. Named historical sources may exist only under the non-shipping
 * `research/` directory, which this scan never enters.
 *
 * The patterns are conservative word-boundary matches, so an accidental
 * substring inside a hex color or an identifier cannot fail the check. The
 * production audit also reviews assets and visual work. This test keeps its
 * mechanical text scan continuous.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const SCANNED_DIRECTORIES = ["src", "scripts", "tests", "docs"] as const;
const SCANNED_ROOT_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "DESIGN.md",
  "index.html",
  "package.json",
  "PRODUCT.md",
  "README.md",
] as const;
/** This file names the banned terms in its own patterns, so it skips itself. */
const SELF = "tests/unit/architecture/originality.test.ts";
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
]);

const MANUFACTURER_PATTERN =
  /\b(?:roland|korg|yamaha|akai|moog|elektron|behringer|arturia|novation|oberheim|linndrum|fairlight|ensoniq|casio|alesis|drumtraks|simmons|vermona|jomox)\b/i;
const MODEL_NUMBER_PATTERN = /\b(?:tr|tb|sh|cr|sp|dx|jx|mpc)-\d{1,4}\b/i;

interface TextUnit {
  readonly path: string;
  readonly source: string;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function walk(directory: string, units: TextUnit[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, units);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(extname(entry.name))) continue;
    const path = normalizePath(relative(ROOT, absolute));
    if (path === SELF) continue;
    units.push({ path, source: readFileSync(absolute, "utf8") });
  }
}

function readScannedUnits(): readonly TextUnit[] {
  const units: TextUnit[] = [];
  for (const directory of SCANNED_DIRECTORIES) walk(resolve(ROOT, directory), units);
  for (const file of SCANNED_ROOT_FILES) {
    units.push({ path: file, source: readFileSync(resolve(ROOT, file), "utf8") });
  }
  return units;
}

describe("naming and originality boundary", () => {
  const units = readScannedUnits();

  it("scans each required shipping root", () => {
    const paths = new Set(units.map((unit) => unit.path));
    for (const directory of SCANNED_DIRECTORIES) {
      expect(units.some((unit) => unit.path.startsWith(`${directory}/`))).toBe(true);
    }
    for (const file of SCANNED_ROOT_FILES) expect(paths.has(file)).toBe(true);
  });

  it("contains no manufacturer name in shipping text or file names", () => {
    const violations = units.flatMap((unit) => {
      const found: string[] = [];
      const inPath = MANUFACTURER_PATTERN.exec(unit.path);
      if (inPath !== null) found.push(`${unit.path}: file name contains "${inPath[0]}"`);
      const inSource = MANUFACTURER_PATTERN.exec(unit.source);
      if (inSource !== null) found.push(`${unit.path}: contains "${inSource[0]}"`);
      return found;
    });
    expect(violations).toEqual([]);
  });

  it("contains no historical model number in shipping text or file names", () => {
    const violations = units.flatMap((unit) => {
      const found: string[] = [];
      const inPath = MODEL_NUMBER_PATTERN.exec(unit.path);
      if (inPath !== null) found.push(`${unit.path}: file name contains "${inPath[0]}"`);
      const inSource = MODEL_NUMBER_PATTERN.exec(unit.source);
      if (inSource !== null) found.push(`${unit.path}: contains "${inSource[0]}"`);
      return found;
    });
    expect(violations).toEqual([]);
  });
});
