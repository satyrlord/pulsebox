/**
 * User theme import validation, per docs/THEMING.md sections 7 and 8.
 *
 * Imported values are data and never source text. Nothing here assigns an
 * unvalidated key or value to `style`, a stylesheet, `innerHTML`, or a CSS
 * object model; the caller receives a canonical object of already-validated
 * tokens.
 *
 * Validation and application are atomic: any structural error, missing required
 * token, invalid known value, or failed contrast pair rejects the whole theme.
 */

import { findContrastFailures } from "./contrast";
import {
  BUILT_IN_PALETTES,
  isOptionalPaletteToken,
  isPaletteToken,
  isRequiredPaletteToken,
  OPTIONAL_PALETTE_TOKENS,
  REQUIRED_PALETTE_TOKENS,
  SHADOW_TOKENS,
  type PaletteToken,
  type PulsePalette,
} from "./tokens";
import { parseColor, parseShadow } from "./value-grammar";

export const USER_THEME_FORMAT_VERSION = 1;
export const MAX_USER_THEME_BYTES = 16_384;
const MAX_TOKEN_ENTRIES = 40;
const MAX_TOKEN_NAME_LENGTH = 64;
const MAX_TOKEN_VALUE_LENGTH = 96;
const MAX_TOTAL_STRING_CHARACTERS = 8_192;
const MAX_NAME_LENGTH = 40;
const MAX_REPORTED_VALUE_LENGTH = 96;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export interface UserThemeError {
  readonly path: string;
  readonly reason: string;
}

export interface CanonicalUserTheme {
  readonly formatVersion: typeof USER_THEME_FORMAT_VERSION;
  readonly name: string;
  readonly tokens: PulsePalette;
}

export interface UserThemeReport {
  readonly applied: boolean;
  readonly errors: readonly UserThemeError[];
  readonly formatVersion: number | undefined;
  readonly ignoredTokens: readonly string[];
  readonly name: string | undefined;
}

export interface UserThemeImportResult {
  readonly report: UserThemeReport;
  readonly theme: CanonicalUserTheme | undefined;
}

function truncateForReport(value: string): string {
  return value.length <= MAX_REPORTED_VALUE_LENGTH
    ? value
    : value.slice(0, MAX_REPORTED_VALUE_LENGTH);
}

function rejected(
  errors: readonly UserThemeError[],
  partial: Partial<UserThemeReport> = {},
): UserThemeImportResult {
  return {
    report: {
      applied: false,
      errors,
      formatVersion: partial.formatVersion,
      ignoredTokens: partial.ignoredTokens ?? [],
      name: partial.name,
    },
    theme: undefined,
  };
}

/**
 * Detects duplicate object keys, which ordinary `JSON.parse` silently collapses
 * to the last occurrence. Scanning the raw text is the only way to see them.
 */
function findDuplicateKeyPaths(source: string): readonly string[] {
  const duplicates: string[] = [];
  const stack: { keys: Set<string>; path: string }[] = [];
  let index = 0;
  let pendingKey: string | undefined;

  const readString = (): string | undefined => {
    let result = "";
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        result += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (character === '"') {
        index += 1;
        return result;
      }
      result += character ?? "";
      index += 1;
    }
    return undefined;
  };

  while (index < source.length) {
    const character = source[index];
    if (character === '"') {
      const value = readString();
      if (value === undefined) break;
      // A string immediately followed by a colon is a key in the current object.
      let lookahead = index;
      while (lookahead < source.length && /\s/.test(source[lookahead] ?? "")) lookahead += 1;
      if (source[lookahead] === ":") {
        pendingKey = value;
        const frame = stack.at(-1);
        if (frame !== undefined) {
          if (frame.keys.has(value)) {
            duplicates.push(frame.path === "" ? value : `${frame.path}.${value}`);
          }
          frame.keys.add(value);
        }
      }
      continue;
    }
    if (character === "{") {
      const parent = stack.at(-1);
      const path =
        parent === undefined
          ? ""
          : pendingKey === undefined
            ? parent.path
            : parent.path === ""
              ? pendingKey
              : `${parent.path}.${pendingKey}`;
      stack.push({ keys: new Set<string>(), path });
      pendingKey = undefined;
    } else if (character === "}") {
      stack.pop();
      pendingKey = undefined;
    }
    index += 1;
  }
  return duplicates;
}

function measureDepth(value: unknown, depth = 1): number {
  if (value === null || typeof value !== "object") return depth;
  let deepest = depth;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, measureDepth(entry, depth + 1));
  }
  return deepest;
}

function collectStringCharacters(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value === null || typeof value !== "object") return 0;
  let total = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    total += key.length + collectStringCharacters(entry);
  }
  return total;
}

function findForbiddenKey(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return key;
    const nested = findForbiddenKey(entry);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

const NAME_DISALLOWED = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}<>]/u;

function validateName(raw: unknown): { error?: string; value?: string } {
  if (typeof raw !== "string") return { error: "must be a string" };
  const value = raw.trim();
  // THEMING.md section 7.1 counts Unicode scalar values, which is exactly what
  // iterating a string yields, so code-point decomposition is the intent here.
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  const length = [...value].length;
  if (length < 1 || length > MAX_NAME_LENGTH) {
    return { error: `must contain 1 through ${String(MAX_NAME_LENGTH)} characters after trimming` };
  }
  if (NAME_DISALLOWED.test(value)) {
    return { error: "must not contain control characters, bidi controls, separators, or markup" };
  }
  return { value };
}

function isShadowToken(token: PaletteToken): boolean {
  return SHADOW_TOKENS.includes(token);
}

/**
 * Validates raw import text. `source` is the exact UTF-8 text the user supplied;
 * byte and duplicate-key limits are measured against it before parsing.
 */
export function importUserTheme(source: string): UserThemeImportResult {
  const byteLength = new TextEncoder().encode(source).length;
  if (byteLength > MAX_USER_THEME_BYTES) {
    return rejected([
      {
        path: "$",
        reason: `input exceeds the ${String(MAX_USER_THEME_BYTES)} byte limit`,
      },
    ]);
  }
  if (source.charCodeAt(0) === 0xfe_ff) {
    return rejected([{ path: "$", reason: "input must not begin with a byte-order mark" }]);
  }

  const duplicates = findDuplicateKeyPaths(source);
  if (duplicates.length > 0) {
    return rejected(
      [...new Set(duplicates)].sort().map((path) => ({
        path: `$.${path}`,
        reason: "duplicate object key",
      })),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return rejected([{ path: "$", reason: "input is not valid JSON" }]);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return rejected([{ path: "$", reason: "root must be a JSON object" }]);
  }

  const forbiddenKey = findForbiddenKey(parsed);
  if (forbiddenKey !== undefined) {
    return rejected([{ path: "$", reason: `the key ${forbiddenKey} is forbidden` }]);
  }
  if (measureDepth(parsed) > 3) {
    return rejected([{ path: "$", reason: "nesting depth must not exceed three levels" }]);
  }
  if (collectStringCharacters(parsed) > MAX_TOTAL_STRING_CHARACTERS) {
    return rejected([
      {
        path: "$",
        reason: `total string characters must not exceed ${String(MAX_TOTAL_STRING_CHARACTERS)}`,
      },
    ]);
  }

  const root = parsed as Record<string, unknown>;
  const rootKeys = Object.keys(root).sort();
  const expectedKeys = ["formatVersion", "name", "tokens"];
  if (
    rootKeys.length !== expectedKeys.length ||
    rootKeys.some((key, i) => key !== expectedKeys[i])
  ) {
    return rejected([
      {
        path: "$",
        reason: "root must contain exactly formatVersion, name, and tokens",
      },
    ]);
  }

  const errors: UserThemeError[] = [];
  const rawFormatVersion = root.formatVersion;
  const formatVersion = typeof rawFormatVersion === "number" ? rawFormatVersion : undefined;
  if (rawFormatVersion !== USER_THEME_FORMAT_VERSION || !Number.isInteger(rawFormatVersion)) {
    errors.push({
      path: "$.formatVersion",
      reason: `must be the integer ${String(USER_THEME_FORMAT_VERSION)}`,
    });
  }

  const nameResult = validateName(root.name);
  if (nameResult.error !== undefined) {
    errors.push({ path: "$.name", reason: nameResult.error });
  }

  const rawTokens = root.tokens;
  if (rawTokens === null || typeof rawTokens !== "object" || Array.isArray(rawTokens)) {
    errors.push({ path: "$.tokens", reason: "must be a JSON object" });
    return rejected(errors, { formatVersion, name: nameResult.value });
  }

  const tokenEntries = Object.entries(rawTokens as Record<string, unknown>);
  if (tokenEntries.length > MAX_TOKEN_ENTRIES) {
    errors.push({
      path: "$.tokens",
      reason: `must contain at most ${String(MAX_TOKEN_ENTRIES)} entries`,
    });
  }

  const ignoredTokens: string[] = [];
  const accepted = new Map<PaletteToken, string>();

  for (const [name, rawValue] of tokenEntries) {
    if (name.length > MAX_TOKEN_NAME_LENGTH) {
      errors.push({
        path: `$.tokens.${name.slice(0, MAX_TOKEN_NAME_LENGTH)}`,
        reason: `token name must not exceed ${String(MAX_TOKEN_NAME_LENGTH)} characters`,
      });
      continue;
    }
    if (!isPaletteToken(name)) {
      ignoredTokens.push(name);
      continue;
    }
    if (typeof rawValue !== "string") {
      errors.push({ path: `$.tokens.${name}`, reason: "must be a string" });
      continue;
    }
    if (rawValue.length > MAX_TOKEN_VALUE_LENGTH) {
      errors.push({
        path: `$.tokens.${name}`,
        reason: `token value must not exceed ${String(MAX_TOKEN_VALUE_LENGTH)} characters`,
      });
      continue;
    }
    const result = isShadowToken(name) ? parseShadow(rawValue) : parseColor(rawValue);
    if (!result.ok) {
      errors.push({
        path: `$.tokens.${name}`,
        reason: `${result.reason} (received ${truncateForReport(rawValue)})`,
      });
      continue;
    }
    accepted.set(name, result.value);
  }

  for (const token of REQUIRED_PALETTE_TOKENS) {
    if (!accepted.has(token) && !errors.some((error) => error.path === `$.tokens.${token}`)) {
      errors.push({ path: `$.tokens.${token}`, reason: "required token is missing" });
    }
  }

  ignoredTokens.sort();

  if (errors.length > 0) {
    return rejected(errors, { formatVersion, ignoredTokens, name: nameResult.value });
  }

  // Omitted optional values resolve from the validated rack palette.
  const tokens = { ...BUILT_IN_PALETTES.rack } as Record<PaletteToken, string>;
  for (const token of REQUIRED_PALETTE_TOKENS) {
    tokens[token] = accepted.get(token) ?? tokens[token];
  }
  for (const token of OPTIONAL_PALETTE_TOKENS) {
    const value = accepted.get(token);
    if (value !== undefined) tokens[token] = value;
  }

  const contrastFailures = findContrastFailures(tokens);
  if (contrastFailures.length > 0) {
    return rejected(
      contrastFailures.map((failure) => ({
        path: `$.tokens.${failure.foreground}`,
        reason:
          `contrast against ${failure.background} is ${failure.ratio.toFixed(2)}:1, ` +
          `below the required ${String(failure.minimum)}:1`,
      })),
      { formatVersion, ignoredTokens, name: nameResult.value },
    );
  }

  const name = nameResult.value;
  if (name === undefined) {
    return rejected([{ path: "$.name", reason: "must be a string" }], {
      formatVersion,
      ignoredTokens,
    });
  }

  return {
    report: {
      applied: true,
      errors: [],
      formatVersion: USER_THEME_FORMAT_VERSION,
      ignoredTokens,
      name,
    },
    theme: { formatVersion: USER_THEME_FORMAT_VERSION, name, tokens },
  };
}

/** Re-validates a stored canonical theme before it is trusted on startup. */
export function isCanonicalUserTheme(value: unknown): value is CanonicalUserTheme {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.formatVersion !== USER_THEME_FORMAT_VERSION) return false;
  if (typeof candidate.name !== "string") return false;
  const tokens = candidate.tokens;
  if (tokens === null || typeof tokens !== "object") return false;
  const table = tokens as Record<string, unknown>;
  const complete = [...REQUIRED_PALETTE_TOKENS, ...OPTIONAL_PALETTE_TOKENS].every((token) => {
    const entry = table[token];
    if (typeof entry !== "string") return false;
    return isShadowToken(token) ? parseShadow(entry).ok : parseColor(entry).ok;
  });
  if (!complete) return false;
  return findContrastFailures(table as PulsePalette).length === 0;
}

export { isOptionalPaletteToken, isRequiredPaletteToken };
