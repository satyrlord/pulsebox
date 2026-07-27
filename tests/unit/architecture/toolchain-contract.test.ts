import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import playwrightConfig from "../../../playwright.config";
import viteConfig from "../../../vite.config";

interface PackageDocument {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
}

const ROOT = resolve(import.meta.dirname, "../../..");
const REQUIRED_FILES = [
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/PROJECT-FORMAT.md",
  "docs/specs/spec-000-index.md",
  "docs/THEMING.md",
  "index.html",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
] as const;
const REQUIRED_SCRIPTS = [
  "build",
  "dev",
  "lint",
  "start",
  "test",
  "test:e2e",
  "typecheck",
] as const;
const FORBIDDEN_DEPENDENCIES = [
  "@angular/core",
  "lit",
  "preact",
  "react",
  "react-dom",
  "solid-js",
  "svelte",
  "vite-plugin-pwa",
  "vue",
  "workbox-core",
] as const;

function readPackage(): PackageDocument {
  return JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as PackageDocument;
}

function nodeScriptTarget(script: string): string | undefined {
  const match = /^node\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(script.trim());
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

describe("product toolchain contract", () => {
  it("keeps every required durable product and toolchain file", () => {
    const missing = REQUIRED_FILES.filter((path) => !existsSync(resolve(ROOT, path)));
    expect(missing).toEqual([]);

    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    const moduleEntry = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/i.exec(html)?.[1];
    expect(moduleEntry, "index.html must load one module entry point").toBeDefined();
    expect(existsSync(resolve(ROOT, (moduleEntry ?? "").replace(/^\//, "")))).toBe(true);
  });

  it("defines the complete required npm command surface", () => {
    const scripts = readPackage().scripts ?? {};
    const missing = REQUIRED_SCRIPTS.filter((name) => (scripts[name] ?? "").trim().length === 0);
    expect(missing).toEqual([]);
    expect(scripts.build).toMatch(/typecheck/);
    expect(scripts.build).toMatch(/vite\s+build/);
    expect(scripts.dev).toMatch(/\bvite\b/);
    expect(scripts.lint).toMatch(/\beslint\b/);
    expect(scripts.start).toMatch(/^node\s+/);
    expect(scripts.test).toMatch(/\bvitest\b/);
    expect(scripts["test:e2e"]).toMatch(/\bplaywright\s+test\b/);
    expect(scripts.typecheck).toMatch(/\btsc\b/);
  });

  it("points npm start at an existing repository-owned launcher", () => {
    const target = nodeScriptTarget(readPackage().scripts?.start ?? "");
    expect(target, "npm start must invoke a repository-owned Node script").toBeDefined();
    expect(existsSync(resolve(ROOT, target ?? ""))).toBe(true);
  });

  it("binds Vite development and preview to the exact strict-port origin", () => {
    expect(viteConfig.server).toMatchObject({
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    });
    expect(viteConfig.preview).toMatchObject({
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    });
  });

  it("runs production-browser evidence at the canonical origin without reusing another server", () => {
    expect(playwrightConfig.use).toMatchObject({
      baseURL: "http://127.0.0.1:4173",
    });
    const webServer = playwrightConfig.webServer;
    if (webServer === undefined || Array.isArray(webServer)) {
      throw new TypeError("Playwright must define one production web server.");
    }
    expect(webServer.command).toMatch(/npm run (?:build.*npm run )?start/);
    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.url).toBe("http://127.0.0.1:4173");

    const projects = new Map(
      (playwrightConfig.projects ?? []).map((project) => [project.name, project]),
    );
    expect([...projects.keys()]).toEqual(["chrome"]);
    expect(projects.get("chrome")?.use?.channel).toBe("chrome");
  });

  it("keeps TypeScript strict and emission owned by the production build", () => {
    const tsconfig = JSON.parse(readFileSync(resolve(ROOT, "tsconfig.json"), "utf8")) as {
      readonly compilerOptions?: Readonly<Record<string, unknown>>;
    };
    expect(tsconfig.compilerOptions).toMatchObject({
      exactOptionalPropertyTypes: true,
      noEmit: true,
      noUncheckedIndexedAccess: true,
      strict: true,
    });
  });

  it("hard-codes the production launcher to the canonical port and fails on conflicts", () => {
    const target = nodeScriptTarget(readPackage().scripts?.start ?? "");
    const launcher = readFileSync(resolve(ROOT, target ?? ""), "utf8");
    expect(launcher).toMatch(/(?:host|HOST)\s*=\s*["']127\.0\.0\.1["']/);
    expect(launcher).toMatch(/(?:port|PORT)\s*=\s*4173/);
    expect(launcher).toMatch(/\.listen\s*\(\s*(?:port|PORT)\s*,\s*(?:host|HOST)/);
    expect(launcher).toMatch(/EADDRINUSE/);
    expect(launcher).not.toMatch(/(?:port|PORT)\s*(?:\+\+|\+=|=\s*(?:port|PORT)\s*\+)/);
  });

  it("contains no prohibited framework or PWA dependency", () => {
    const packageDocument = readPackage();
    const dependencies = {
      ...packageDocument.dependencies,
      ...packageDocument.devDependencies,
    };
    const present = FORBIDDEN_DEPENDENCIES.filter((name) => dependencies[name] !== undefined);
    expect(present).toEqual([]);
  });
});
