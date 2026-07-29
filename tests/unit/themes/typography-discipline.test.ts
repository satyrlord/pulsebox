import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readCurrentSourceUnits } from "../architecture/source-policy";

/**
 * Spec-001 section 11.3 typography and icon rules.
 *
 * These floors erode silently: a single hard-coded `font-size: 9px` in one
 * component template is invisible in review but permanently below the legibility
 * floor. Shadow DOM templates live in TypeScript, so component styles are
 * scanned alongside the stylesheets.
 */

const MINIMUM_TEXT_PX = 10;

function shippedStyleSources(): { path: string; text: string }[] {
  const files = ["src/styles/global.css", "src/themes/themes.css"].map((path) => ({
    path,
    text: readFileSync(join(process.cwd(), path), "utf8"),
  }));
  for (const unit of readCurrentSourceUnits()) {
    if (unit.path.startsWith("src/") && unit.path.endsWith(".ts")) {
      files.push({ path: unit.path, text: unit.source });
    }
  }
  return files;
}

describe("type scale", () => {
  const globalCss = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");

  it("declares no type-scale step below the 10 pixel floor", () => {
    const undersized: string[] = [];
    for (const match of globalCss.matchAll(/--pulse-type-(\d+)\s*:\s*([\d.]+)px/g)) {
      const declared = Number(match[2]);
      if (declared < MINIMUM_TEXT_PX) {
        undersized.push(`--pulse-type-${match[1] ?? ""}: ${String(declared)}px`);
      }
    }
    expect(undersized).toEqual([]);
  });

  it("uses system UI and system monospace without loading a legacy-style font", () => {
    expect(globalCss).toMatch(/--pulse-font-ui:\s*system-ui/);
    expect(globalCss).toMatch(/--pulse-font-mono:\s*ui-monospace/);
    // A loaded face would arrive through @font-face or an external stylesheet.
    for (const file of shippedStyleSources()) {
      expect(file.text, `${file.path} must not load a font face`).not.toMatch(/@font-face/i);
      expect(file.text, `${file.path} must not import a font`).not.toMatch(
        /fonts\.(?:googleapis|gstatic)\.com/i,
      );
    }
  });
});

describe("font sizes in shipped styles", () => {
  it("never sets text below the 10 pixel floor", () => {
    const undersized: string[] = [];
    for (const file of shippedStyleSources()) {
      for (const match of file.text.matchAll(/font-size\s*:\s*([\d.]+)px/g)) {
        const size = Number(match[1]);
        if (size < MINIMUM_TEXT_PX) {
          undersized.push(`${file.path}: font-size: ${String(size)}px`);
        }
      }
    }
    expect(undersized).toEqual([]);
  });

  it("expresses font sizes through the type scale rather than raw pixels", () => {
    const raw: string[] = [];
    for (const file of shippedStyleSources()) {
      // themes.css declares palette values only and sets no type.
      if (file.path === "src/themes/themes.css") continue;
      for (const match of file.text.matchAll(/font-size\s*:\s*([\d.]+px)/g)) {
        raw.push(`${file.path}: font-size: ${match[1] ?? ""}`);
      }
    }
    expect(raw).toEqual([]);
  });
});

describe("icon rules", () => {
  // Presentation emoji and the variation selector that forces emoji rendering.
  // Kept as separate alternatives: combining the selector into a character
  // class would let it merge with an adjacent range.
  const EMOJI = /\p{Extended_Pictographic}|️/u;

  it("uses no emoji as an interface icon", () => {
    const offenders: string[] = [];
    for (const file of shippedStyleSources()) {
      if (EMOJI.test(file.text)) offenders.push(file.path);
    }
    expect(offenders).toEqual([]);
  });

  it("loads no icon font", () => {
    const offenders: string[] = [];
    for (const file of shippedStyleSources()) {
      if (/font-family\s*:\s*[^;]*icon/i.test(file.text)) offenders.push(file.path);
    }
    expect(offenders).toEqual([]);
  });

  it("draws inline SVG with currentColor rather than a baked-in hex", () => {
    const baked: string[] = [];
    for (const file of shippedStyleSources()) {
      for (const match of file.text.matchAll(
        /<(?:path|circle|rect|line|polyline|polygon)\b[^>]*>/g,
      )) {
        const element = match[0];
        // A shape may be unfilled, inherit, or use a token. A literal hex in an
        // icon body is the case section 11.3 rules out.
        if (/(?:fill|stroke)\s*=\s*"#[0-9A-Fa-f]{3,8}"/.test(element)) {
          baked.push(`${file.path}: ${element.slice(0, 60)}`);
        }
      }
    }
    expect(baked).toEqual([]);
  });
});
