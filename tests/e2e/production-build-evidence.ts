import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export interface ProductionBuildFileEvidence {
  readonly bytes: number;
  readonly path: string;
  readonly sha256: string;
}

export interface ProductionBuildEvidence {
  readonly files: readonly ProductionBuildFileEvidence[];
  readonly sha256: string;
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : entry.isFile() ? [path] : [];
  });
}

/** Hashes the complete production build, including each path and exact file bytes. */
export function captureProductionBuildEvidence(): ProductionBuildEvidence {
  const root = resolve("dist");
  const hash = createHash("sha256");
  const files = filesBelow(root)
    .map((path) => {
      const bytes = readFileSync(path);
      const relativePath = relative(root, path).split(sep).join("/");
      return {
        bytes: bytes.length,
        path: relativePath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        source: bytes,
      };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
  for (const file of files) hash.update(file.path).update("\0").update(file.source).update("\0");
  return {
    files: files.map((file) => ({
      bytes: file.bytes,
      path: file.path,
      sha256: file.sha256,
    })),
    sha256: hash.digest("hex"),
  };
}
