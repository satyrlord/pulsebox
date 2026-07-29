import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearanceEnvelope,
  resolvePalette,
  serializeAppearance,
} from "../../../src/themes/appearance";
import {
  createPulseThemeService,
  type ThemeServiceOptions,
} from "../../../src/themes/theme-service";
import {
  BUILT_IN_PALETTES,
  HIGH_CONTRAST_OVERLAY,
  PULSE_THEME_IDS,
  REQUIRED_PALETTE_TOKENS,
} from "../../../src/themes/tokens";
import { importUserTheme } from "../../../src/themes/user-theme";

/**
 * A distinct app color proves an assertion saw the inline user palette rather
 * than the rack stylesheet values.
 */
const USER_THEME_APP_COLOR = "#04070C";

function validUserThemeSource(): string {
  const tokens: Record<string, string> = {};
  for (const token of REQUIRED_PALETTE_TOKENS) tokens[token] = BUILT_IN_PALETTES.rack[token];
  tokens["--pulse-color-app"] = USER_THEME_APP_COLOR;
  return JSON.stringify({ formatVersion: 1, name: "Night Shift", tokens });
}

class MemoryStorage {
  #entries = new Map<string, string>();
  failOnWrite = false;

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new Error("quota exceeded");
    this.#entries.set(key, value);
  }
}

/** Records what the service writes, standing in for the DOM theme host. */
class RecordingHost {
  highContrast: boolean | undefined;
  theme: string | undefined;
  readonly tokens = new Map<string, string>();

  clearToken(token: string): void {
    this.tokens.delete(token);
  }

  setState(theme: string, highContrast: boolean): void {
    this.theme = theme;
    this.highContrast = highContrast;
  }

  setToken(token: string, value: string): void {
    this.tokens.set(token, value);
  }
}

describe("appearance envelope", () => {
  it("round-trips the default appearance", () => {
    expect(parseAppearanceEnvelope(serializeAppearance(DEFAULT_APPEARANCE))).toEqual(
      DEFAULT_APPEARANCE,
    );
  });

  it("serializes the documented canonical shape", () => {
    expect(JSON.parse(serializeAppearance(DEFAULT_APPEARANCE))).toEqual({
      version: 1,
      theme: "rack",
      highContrast: false,
      userTheme: null,
    });
  });

  it.each([
    ["null input", null],
    ["invalid JSON", "{"],
    ["array root", "[]"],
    ["wrong version", '{"version":2,"theme":"rack","highContrast":false,"userTheme":null}'],
    ["unknown theme", '{"version":1,"theme":"neon","highContrast":false,"userTheme":null}'],
    [
      "removed built-in theme",
      '{"version":1,"theme":"cosmic","highContrast":false,"userTheme":null}',
    ],
    ["non-boolean contrast", '{"version":1,"theme":"rack","highContrast":"no","userTheme":null}'],
    ["user without theme", '{"version":1,"theme":"user","highContrast":false,"userTheme":null}'],
    ["invalid user theme", '{"version":1,"theme":"user","highContrast":false,"userTheme":{"a":1}}'],
  ])("rejects %s", (_label, raw) => {
    expect(parseAppearanceEnvelope(raw)).toBeUndefined();
  });

  it("rejects an oversize stored value", () => {
    expect(parseAppearanceEnvelope(`{"padding":"${"a".repeat(20_000)}"}`)).toBeUndefined();
  });
});

describe("palette resolution", () => {
  it.each(PULSE_THEME_IDS)("resolves the %s built-in palette", (theme) => {
    expect(resolvePalette({ theme, highContrast: false, userTheme: null })).toEqual(
      BUILT_IN_PALETTES[theme],
    );
  });

  it("layers high contrast over the built-in theme", () => {
    const resolved = resolvePalette({ theme: "rack", highContrast: true, userTheme: null });
    expect(resolved["--pulse-color-app"]).toBe(HIGH_CONTRAST_OVERLAY["--pulse-color-app"]);
    expect(resolved["--pulse-color-accent"]).toBe(HIGH_CONTRAST_OVERLAY["--pulse-color-accent"]);
  });

  it("layers high contrast over an installed user theme", () => {
    const theme = importUserTheme(validUserThemeSource()).theme;
    expect(theme).toBeDefined();
    const resolved = resolvePalette({
      theme: "user",
      highContrast: true,
      userTheme: theme ?? null,
    });
    expect(resolved["--pulse-color-app"]).toBe(HIGH_CONTRAST_OVERLAY["--pulse-color-app"]);
  });
});

describe("theme service", () => {
  let storage: MemoryStorage;
  let host: RecordingHost;

  beforeEach(() => {
    storage = new MemoryStorage();
    host = new RecordingHost();
  });

  function createService(overrides: Partial<ThemeServiceOptions> = {}) {
    return createPulseThemeService({ host, storage, ...overrides });
  }

  it("starts with the rack theme when no preference is stored", () => {
    const service = createService();
    service.start();
    expect(service.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(host.theme).toBe("rack");
    expect(host.highContrast).toBe(false);
  });

  it("leaves built-in themes to the stylesheet instead of painting inline", () => {
    const service = createService();
    service.start();
    // Inline properties would outrank the [data-theme] rules and freeze the
    // palette on whatever was painted first.
    expect(host.tokens.size).toBe(0);
    expect(host.theme).toBe("rack");
  });

  it("clears an inline user palette when returning to a built-in theme", () => {
    const theme = importUserTheme(validUserThemeSource()).theme;
    const service = createService();
    service.start();
    if (theme !== undefined) service.installUserTheme(theme);
    expect(host.tokens.size).toBeGreaterThan(0);
    service.setTheme("rack");
    expect(host.tokens.size).toBe(0);
  });

  it("restores a stored preference", () => {
    storage.setItem(
      APPEARANCE_STORAGE_KEY,
      serializeAppearance({ theme: "rack", highContrast: true, userTheme: null }),
    );
    const service = createService();
    service.start();
    expect(service.appearance.theme).toBe("rack");
    expect(host.highContrast).toBe(true);
    // The overlay is a stylesheet rule for the built-in theme, not an inline write.
    expect(host.tokens.size).toBe(0);
  });

  it("resolves a stored removed built-in theme to rack via the invalid-preference fallback", () => {
    storage.setItem(
      APPEARANCE_STORAGE_KEY,
      '{"version":1,"theme":"cosmic","highContrast":false,"userTheme":null}',
    );
    const onCorruptPreference = vi.fn();
    const service = createService({ onCorruptPreference });
    service.start();
    expect(service.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(host.theme).toBe("rack");
    expect(onCorruptPreference).toHaveBeenCalledTimes(1);
  });

  it("falls back to rack and reports corrupt stored data once per session", () => {
    storage.setItem(APPEARANCE_STORAGE_KEY, "{not json");
    const onCorruptPreference = vi.fn();
    const service = createService({ onCorruptPreference });
    service.start();
    service.applyCrossTabValue("{still not json");
    expect(service.appearance.theme).toBe("rack");
    expect(onCorruptPreference).toHaveBeenCalledTimes(1);
  });

  it("does not replace corrupt stored data until a valid choice is made", () => {
    storage.setItem(APPEARANCE_STORAGE_KEY, "{not json");
    const service = createService();
    service.start();
    expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe("{not json");
    service.setHighContrast(true);
    expect(parseAppearanceEnvelope(storage.getItem(APPEARANCE_STORAGE_KEY))?.highContrast).toBe(
      true,
    );
  });

  it("persists an appearance change as one complete envelope", () => {
    const service = createService();
    service.start();
    expect(service.setHighContrast(true)).toBe(true);
    expect(JSON.parse(storage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}")).toEqual({
      version: 1,
      theme: "rack",
      highContrast: true,
      userTheme: null,
    });
  });

  it("keeps the current appearance when storage fails", () => {
    const onStorageFailure = vi.fn();
    const service = createService({ onStorageFailure });
    service.start();
    storage.failOnWrite = true;
    expect(service.setHighContrast(true)).toBe(false);
    expect(service.appearance.highContrast).toBe(false);
    expect(host.highContrast).toBe(false);
    expect(host.theme).toBe("rack");
    expect(onStorageFailure).toHaveBeenCalledOnce();
  });

  it("refuses to select the user theme when none is installed", () => {
    const service = createService();
    service.start();
    expect(service.setTheme("user")).toBe(false);
    expect(service.appearance.theme).toBe("rack");
  });

  it("installs and applies a validated user theme", () => {
    const theme = importUserTheme(validUserThemeSource()).theme;
    expect(theme).toBeDefined();
    const service = createService();
    service.start();
    if (theme !== undefined) expect(service.installUserTheme(theme)).toBe(true);
    expect(service.appearance.theme).toBe("user");
    expect(host.theme).toBe("user");
    expect(host.tokens.get("--pulse-color-app")).toBe(USER_THEME_APP_COLOR);
  });

  it("resolves high contrast inline for a user theme", () => {
    const theme = importUserTheme(validUserThemeSource()).theme;
    const service = createService();
    service.start();
    if (theme !== undefined) service.installUserTheme(theme);
    service.setHighContrast(true);
    // A stylesheet rule cannot outrank the inline user palette, so the overlay
    // has to be resolved before paint.
    expect(host.tokens.get("--pulse-color-app")).toBe(HIGH_CONTRAST_OVERLAY["--pulse-color-app"]);
    expect(host.tokens.get("--pulse-color-accent")).toBe(
      HIGH_CONTRAST_OVERLAY["--pulse-color-accent"],
    );
  });

  it("commits rack with a null user theme when deleting the active user theme", () => {
    const theme = importUserTheme(validUserThemeSource()).theme;
    const service = createService();
    service.start();
    if (theme !== undefined) service.installUserTheme(theme);
    expect(service.deleteUserTheme()).toBe(true);
    expect(service.appearance).toEqual({ theme: "rack", highContrast: false, userTheme: null });
    expect(parseAppearanceEnvelope(storage.getItem(APPEARANCE_STORAGE_KEY))?.userTheme).toBeNull();
  });

  it("applies a valid newer cross-tab envelope as a UI-only update", () => {
    const service = createService();
    service.start();
    const listener = vi.fn();
    service.subscribe(listener);
    const applied = service.applyCrossTabValue(
      serializeAppearance({ theme: "rack", highContrast: true, userTheme: null }),
    );
    expect(applied).toBe(true);
    expect(host.highContrast).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("ignores invalid cross-tab data without changing appearance", () => {
    const service = createService();
    service.start();
    expect(service.applyCrossTabValue('{"version":9}')).toBe(false);
    expect(service.appearance.theme).toBe("rack");
    expect(host.theme).toBe("rack");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const service = createService();
    service.start();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.setHighContrast(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    service.setHighContrast(false);
    expect(listener).toHaveBeenCalledOnce();
  });
});
