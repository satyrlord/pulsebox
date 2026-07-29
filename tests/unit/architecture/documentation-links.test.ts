import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const DOCUMENTATION_ROOTS = ["README.md", "AGENTS.md", "docs", ".github/skills"] as const;
const INLINE_LINK =
  /!?\[[^\]\r\n]*\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^\r\n)]*\)))?\s*\)/gu;
const REFERENCE_LINK = /^\s{0,3}\[[^\]\r\n]+\]:\s*(?:<([^>\r\n]+)>|(\S+))/gmu;

function collectMarkdownFiles(path: string): readonly string[] {
  const absolutePath = resolve(ROOT, path);
  if (statSync(absolutePath).isFile()) {
    return [absolutePath];
  }

  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const childPath = resolve(absolutePath, entry.name);
      if (entry.isDirectory()) {
        return collectMarkdownFiles(relative(ROOT, childPath));
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [childPath] : [];
    });
}

function linkTargets(markdown: string): readonly string[] {
  const targets = new Set<string>();
  for (const pattern of [INLINE_LINK, REFERENCE_LINK]) {
    pattern.lastIndex = 0;
    for (const match of markdown.matchAll(pattern)) {
      const target = match[1] ?? match[2];
      if (target !== undefined) {
        targets.add(target);
      }
    }
  }
  return [...targets].sort();
}

function localPath(target: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|#)/iu.test(target)) {
    return undefined;
  }

  const path = target.split(/[?#]/u, 1)[0];
  if (path === undefined || path.length === 0) {
    return undefined;
  }
  return decodeURIComponent(path);
}

describe("documentation links", () => {
  it("keeps every repository-relative Markdown link inside the repository and on disk", () => {
    const broken: string[] = [];
    const markdownFiles = DOCUMENTATION_ROOTS.flatMap(collectMarkdownFiles).sort();

    for (const sourcePath of markdownFiles) {
      const source = readFileSync(sourcePath, "utf8");
      for (const target of linkTargets(source)) {
        const path = localPath(target);
        if (path === undefined) {
          continue;
        }

        const targetPath = path.startsWith("/")
          ? resolve(ROOT, path.slice(1))
          : resolve(dirname(sourcePath), path);
        const repositoryPath = relative(ROOT, targetPath);
        const escapesRepository =
          repositoryPath === ".." ||
          repositoryPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
          isAbsolute(repositoryPath);
        if (escapesRepository || !existsSync(targetPath)) {
          broken.push(`${relative(ROOT, sourcePath)} -> ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
