import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { readCurrentSourceUnits } from "../../unit/architecture/source-policy";
import {
  BUILT_IN_PALETTES,
  OPTIONAL_PALETTE_TOKENS,
  PULSE_THEME_IDS,
  REQUIRED_PALETTE_TOKENS,
} from "../../../src/themes/tokens";

/**
 * Foundation tokens are fixed across themes (THEMING.md section 3.3). They are
 * declared once in global.css and are not part of any palette.
 */
const FOUNDATION_TOKENS = new Set([
  "--pulse-font-ui",
  "--pulse-font-mono",
  "--pulse-type-10",
  "--pulse-type-12",
  "--pulse-type-14",
  "--pulse-type-16",
  "--pulse-type-20",
  "--pulse-line-tight",
  "--pulse-line-normal",
  "--pulse-line-roomy",
  "--pulse-weight-normal",
  "--pulse-weight-medium",
  "--pulse-weight-strong",
  "--pulse-space-0",
  "--pulse-space-1",
  "--pulse-space-2",
  "--pulse-space-3",
  "--pulse-space-4",
  "--pulse-space-5",
  "--pulse-space-6",
  "--pulse-space-8",
  "--pulse-space-10",
  "--pulse-radius-control",
  "--pulse-radius-panel",
  "--pulse-radius-dialog",
  "--pulse-radius-round",
  "--pulse-border-thin",
  "--pulse-border-strong",
  "--pulse-target-min",
  "--pulse-control-compact",
  "--pulse-control-standard",
  "--pulse-scrollbar-size",
  "--pulse-layer-modal",
  "--pulse-focus-width",
  "--pulse-focus-gap",
  "--pulse-duration-fast",
  "--pulse-duration-standard",
  "--pulse-duration-slow",
  "--pulse-motion-distance",
  // The high-contrast overlay's solid operational boundary, per section 5.
  "--pulse-operational-outline",
]);

const PALETTE_TOKENS = new Set<string>([...REQUIRED_PALETTE_TOKENS, ...OPTIONAL_PALETTE_TOKENS]);

const MODULE_TOKENS = new Set([
  "--module-accent",
  "--module-accent-muted",
  "--module-led",
  "--module-control-ring",
]);

/**
 * Every shipped stylesheet, including the CSS Modules that style components.
 * Those modules are where most token references live, so omitting them would
 * let a component consume a token no theme declares: the value would silently
 * fall back to its literal and stop responding to a theme or contrast change.
 */
function readShippedStyleText(): { path: string; text: string }[] {
  const files = ["src/styles/global.css", "src/themes/themes.css"].map((path) => ({
    path,
    text: readFileSync(join(process.cwd(), path), "utf8"),
  }));
  for (const path of listModuleStylesheets(join(process.cwd(), "src"))) {
    files.push({
      path: relative(process.cwd(), path).replaceAll("\\", "/"),
      text: readFileSync(path, "utf8"),
    });
  }
  for (const unit of readCurrentSourceUnits()) {
    if (
      unit.path.startsWith("src/") &&
      (unit.path.endsWith(".ts") || unit.path.endsWith(".tsx"))
    ) {
      files.push({ path: unit.path, text: unit.source });
    }
  }
  return files;
}

function listModuleStylesheets(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listModuleStylesheets(full));
      continue;
    }
    if (entry.name.endsWith(".css") && entry.name !== "themes.css" && entry.name !== "global.css") {
      found.push(full);
    }
  }
  return found;
}

function referencedTokens(text: string): readonly string[] {
  const matches = [...text.matchAll(/var\(\s*(--[\w-]+)/g)];
  return matches.map((match) => match[1] ?? "");
}

/** Removes balanced `var(...)` calls so fallback literals are not flagged. */
function stripVarCalls(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("var(", index)) {
      let depth = 0;
      let cursor = index;
      for (; cursor < text.length; cursor += 1) {
        const character = text[cursor] ?? "";
        if (character === "(") depth += 1;
        else if (character === ")") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
      }
      index = cursor;
      continue;
    }
    result += text[index] ?? "";
    index += 1;
  }
  return result;
}

interface PaletteVarFallback {
  readonly token: string;
  readonly fallback: string | undefined;
}

/** Reads each palette var() call, including calls nested in another var(). */
function paletteVarFallbacks(text: string): readonly PaletteVarFallback[] {
  const found: PaletteVarFallback[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const start = text.indexOf("var(", searchFrom);
    if (start < 0) break;
    let depth = 0;
    let close = -1;
    for (let cursor = start; cursor < text.length; cursor += 1) {
      const character = text[cursor] ?? "";
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          close = cursor;
          break;
        }
      }
    }
    if (close < 0) break;
    const body = text.slice(start + 4, close);
    let comma = -1;
    depth = 0;
    for (let cursor = 0; cursor < body.length; cursor += 1) {
      const character = body[cursor] ?? "";
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      else if (character === "," && depth === 0) {
        comma = cursor;
        break;
      }
    }
    const token = (comma < 0 ? body : body.slice(0, comma)).trim();
    if (token.startsWith("--pulse-color-")) {
      found.push({
        token,
        fallback: comma < 0 ? undefined : body.slice(comma + 1).trim(),
      });
    }
    // Advance into the call instead of past it so nested var() calls are read.
    searchFrom = start + 4;
  }
  return found;
}

describe("token discipline", () => {
  const files = readShippedStyleText();

  it("references only tokens defined by the theming contract", () => {
    const unknown: string[] = [];
    for (const file of files) {
      for (const token of referencedTokens(file.text)) {
        if (PALETTE_TOKENS.has(token) || FOUNDATION_TOKENS.has(token) || MODULE_TOKENS.has(token)) {
          continue;
        }
        // Section 3 allows a component private property, but only one that does
        // not claim the shared `--pulse-` public namespace.
        if (!token.startsWith("--pulse-")) continue;
        unknown.push(`${file.path}: ${token}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("gives every palette token reference the exact rack fallback", () => {
    const mismatched: string[] = [];
    const rack = BUILT_IN_PALETTES.rack as Readonly<Record<string, string>>;
    for (const file of files) {
      // These files declare the palette and may use declaration-local values.
      if (file.path === "src/styles/global.css" || file.path === "src/themes/themes.css") {
        continue;
      }
      for (const { token, fallback } of paletteVarFallbacks(file.text)) {
        const expected = rack[token];
        if (
          expected !== undefined &&
          fallback?.toUpperCase() !== expected.toUpperCase()
        ) {
          mismatched.push(
            `${file.path}: ${token} fallback ${fallback ?? "<missing>"}, expected ${expected}`,
          );
        }
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("consumes on-accent and text-primary ink through tokens, not literals", () => {
    const rack = BUILT_IN_PALETTES.rack as Readonly<Record<string, string>>;
    const guarded = new Set(
      ["--pulse-color-on-accent", "--pulse-color-text-primary"].map((token) =>
        (rack[token] ?? "").toUpperCase(),
      ),
    );
    const offenders: string[] = [];
    for (const file of files) {
      if (!file.path.endsWith(".css")) continue;
      if (file.path === "src/styles/global.css" || file.path === "src/themes/themes.css") {
        continue;
      }
      const text = stripVarCalls(file.text);
      for (const match of text.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
        const value = (match[1] ?? "").toUpperCase();
        if (guarded.has(value)) offenders.push(`${file.path}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("themes.css matches the palette contract", () => {
  const css = readFileSync(join(process.cwd(), "src/themes/themes.css"), "utf8");

  function declaredBlock(selector: string): Map<string, string> {
    const start = css.indexOf(selector);
    expect(start, `${selector} must exist in themes.css`).toBeGreaterThanOrEqual(0);
    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    const block = css.slice(open + 1, close);
    const declared = new Map<string, string>();
    for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declared.set(match[1] ?? "", (match[2] ?? "").trim());
    }
    return declared;
  }

  it.each(PULSE_THEME_IDS)("declares every palette token for %s", (theme) => {
    const declared = declaredBlock(`[data-theme="${theme}"]`);
    const expected = BUILT_IN_PALETTES[theme];
    for (const token of REQUIRED_PALETTE_TOKENS) {
      const value = declared.get(token);
      expect(value?.toUpperCase(), `${theme} ${token}`).toBe(expected[token].toUpperCase());
    }
  });
});
