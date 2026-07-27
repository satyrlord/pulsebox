import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, posix, relative, resolve } from "node:path";

import ts from "typescript";

export interface SourceUnit {
  readonly path: string;
  readonly source: string;
}

export interface PolicyViolation {
  readonly path: string;
  readonly message: string;
}

type Layer =
  | "composition"
  | "contracts"
  | "engine"
  | "persistence"
  | "state"
  | "ui";

const CODE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"] as const;
const FORBIDDEN_FRAMEWORKS = [
  "@angular/",
  "lit",
  "preact",
  "react",
  "react-dom",
  "solid-js",
  "svelte",
  "vue",
] as const;
const UI_AUDIO_GLOBALS = new Set([
  "AudioBuffer",
  "AudioContext",
  "AudioNode",
  "AudioParam",
  "AudioWorkletNode",
  "BaseAudioContext",
  "OfflineAudioContext",
]);
const STATE_BROWSER_GLOBALS = new Set([
  ...UI_AUDIO_GLOBALS,
  "Document",
  "File",
  "FileSystemFileHandle",
  "HTMLElement",
  "IDBDatabase",
  "IDBTransaction",
  "Storage",
  "Window",
]);

const ALLOWED_LAYER_DEPENDENCIES: Readonly<Record<Layer, readonly Layer[]>> = {
  composition: ["composition", "contracts", "engine", "persistence", "state", "ui"],
  contracts: ["contracts"],
  engine: ["contracts", "engine"],
  persistence: ["contracts", "persistence", "state"],
  state: ["contracts", "state"],
  ui: ["contracts", "state", "ui"],
};

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function parse(unit: SourceUnit): ts.SourceFile {
  return ts.createSourceFile(
    unit.path,
    unit.source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(unit.path),
  );
}

function walk(directory: string, root: string, units: SourceUnit[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, root, units);
      continue;
    }
    if (!entry.isFile() || !CODE_EXTENSIONS.has(extname(entry.name))) continue;
    units.push({
      path: normalizePath(relative(root, absolute)),
      source: readFileSync(absolute, "utf8"),
    });
  }
}

export function readCurrentSourceUnits(repositoryRoot = process.cwd()): readonly SourceUnit[] {
  const sourceRoot = resolve(repositoryRoot, "src");
  const units: SourceUnit[] = [];
  walk(sourceRoot, repositoryRoot, units);
  const scriptsRoot = resolve(repositoryRoot, "scripts");
  if (existsSync(scriptsRoot)) walk(scriptsRoot, repositoryRoot, units);
  return units.sort((left, right) => left.path.localeCompare(right.path));
}

export function readCurrentArtifactUnits(repositoryRoot = process.cwd()): readonly SourceUnit[] {
  const units: SourceUnit[] = [];
  const indexPath = resolve(repositoryRoot, "index.html");
  if (existsSync(indexPath)) units.push({ path: "index.html", source: readFileSync(indexPath, "utf8") });
  const publicRoot = resolve(repositoryRoot, "public");
  if (existsSync(publicRoot)) {
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile()) units.push({ path: normalizePath(relative(repositoryRoot, absolute)), source: readFileSync(absolute, "utf8") });
      }
    };
    visit(publicRoot);
  }
  const workflowsRoot = resolve(repositoryRoot, ".github", "workflows");
  if (existsSync(workflowsRoot)) {
    for (const entry of readdirSync(workflowsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
      const absolute = join(workflowsRoot, entry.name);
      units.push({
        path: normalizePath(relative(repositoryRoot, absolute)),
        source: readFileSync(absolute, "utf8"),
      });
    }
  }
  return units.sort((left, right) => left.path.localeCompare(right.path));
}

const COMPOSITION_RENDER_CALLS = new Set([
  "append",
  "appendChild",
  "createElement",
  "createTextNode",
  "insertAdjacentHTML",
  "prepend",
  "replaceChildren",
  "replaceWith",
]);
const COMPOSITION_RENDER_PROPERTIES = new Set(["innerHTML", "outerHTML", "textContent"]);

export function findCompositionDomRenderingViolations(
  units: readonly SourceUnit[],
): readonly PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const unit of units) {
    if (layerFor(unit.path) !== "composition") continue;
    const messages = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        COMPOSITION_RENDER_CALLS.has(node.expression.name.text)
      ) {
        messages.add(`Composition must not render DOM through ${node.expression.name.text}.`);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        COMPOSITION_RENDER_PROPERTIES.has(node.left.name.text)
      ) {
        messages.add(`Composition must not render DOM through ${node.left.name.text}.`);
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(unit));
    for (const message of messages) violations.push({ path: unit.path, message });
  }
  return violations;
}

function importSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const argument = node.arguments[0];
      if (
        node.arguments.length === 1 &&
        argument !== undefined &&
        ts.isStringLiteralLike(argument) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        specifiers.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function layerFor(path: string): Layer | undefined {
  const normalized = normalizePath(path);
  if (normalized === "src/main.ts" || normalized.startsWith("src/composition/") || normalized.startsWith("src/app/")) {
    return "composition";
  }
  const directory = normalized.split("/")[1];
  if (directory === "contracts") return "contracts";
  if (directory === "engine") return "engine";
  if (directory === "persistence") return "persistence";
  if (directory === "state") return "state";
  if (["components", "styles", "themes", "ui"].includes(directory ?? "")) return "ui";
  return undefined;
}

function resolveLocalImport(
  importingPath: string,
  specifier: string,
  unitsByPath: ReadonlyMap<string, SourceUnit>,
): string | undefined {
  let base: string | undefined;
  if (specifier.startsWith(".")) {
    base = posix.normalize(posix.join(posix.dirname(importingPath), specifier));
  } else if (specifier.startsWith("/src/")) {
    base = specifier.slice(1);
  } else if (specifier.startsWith("src/")) {
    base = specifier;
  } else {
    const alias = /^@(composition|contracts|engine|persistence|state|ui)\/(.+)$/.exec(specifier);
    if (alias?.[1] !== undefined && alias[2] !== undefined) {
      base = `src/${alias[1]}/${alias[2]}`;
    }
  }
  if (base === undefined) return undefined;
  return RESOLUTION_SUFFIXES.map((suffix) => `${base}${suffix}`).find((candidate) =>
    unitsByPath.has(candidate),
  );
}

function isPublicCrossLayerTarget(path: string, targetLayer: Layer): boolean {
  if (targetLayer === "contracts") return true;
  const normalized = normalizePath(path);
  return (
    normalized === `src/${targetLayer}/public.ts` ||
    (targetLayer === "state" && normalized.startsWith("src/state/ports/"))
  );
}

export function findLayerViolations(units: readonly SourceUnit[]): readonly PolicyViolation[] {
  const unitsByPath = new Map(units.map((unit) => [normalizePath(unit.path), unit]));
  const violations: PolicyViolation[] = [];
  for (const unit of units) {
    const sourceLayer = layerFor(unit.path);
    if (sourceLayer === undefined) continue;
    for (const specifier of importSpecifiers(parse(unit))) {
      const targetPath = resolveLocalImport(unit.path, specifier, unitsByPath);
      if (targetPath === undefined) continue;
      const targetLayer = layerFor(targetPath);
      if (targetLayer === undefined || targetLayer === sourceLayer) continue;
      if (!ALLOWED_LAYER_DEPENDENCIES[sourceLayer].includes(targetLayer)) {
        violations.push({
          path: unit.path,
          message: `${sourceLayer} must not import ${targetLayer} through ${specifier}.`,
        });
        continue;
      }
      if (!isPublicCrossLayerTarget(targetPath, targetLayer)) {
        violations.push({
          path: unit.path,
          message: `${sourceLayer} must import ${targetLayer} through its public port, not ${specifier}.`,
        });
      }
    }
  }
  return violations;
}

function isForbiddenFramework(specifier: string): boolean {
  return FORBIDDEN_FRAMEWORKS.some(
    (framework) => specifier === framework || specifier.startsWith(`${framework}/`),
  );
}

function importsExecutableDspCore(
  sourceFile: ts.SourceFile,
  importingPath: string,
): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !/(?:^|\/)dsp-core(?:\.[cm]?[jt]s)?$/.test(statement.moduleSpecifier.text)
    ) {
      return false;
    }
    const clause = statement.importClause;
    if (
      clause === undefined ||
      clause.phaseModifier === ts.SyntaxKind.TypeKeyword
    ) {
      return false;
    }
    if (clause.name !== undefined || clause.namedBindings === undefined) return true;
    if (ts.isNamespaceImport(clause.namedBindings)) return true;
    return clause.namedBindings.elements.some((element) => {
      if (element.isTypeOnly) return false;
      const importedName = (element.propertyName ?? element.name).text;
      return !(
        importingPath.endsWith("/manifest.ts") &&
        importedName.startsWith("DEFAULT_")
      );
    });
  });
}

export function findForbiddenTechnologyViolations(
  units: readonly SourceUnit[],
): readonly PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const unit of units) {
    const sourceFile = parse(unit);
    const messages = new Set<string>();
    if (unit.path.endsWith(".jsx") || unit.path.endsWith(".tsx")) {
      messages.add("JSX and TSX source files are prohibited.");
    }
    if (/(?:^|\/)(?:service-worker|serviceWorker|sw)\.[cm]?[jt]sx?$/.test(unit.path)) {
      messages.add("Service-worker source files are prohibited.");
    }
    for (const specifier of importSpecifiers(sourceFile)) {
      if (isForbiddenFramework(specifier)) {
        messages.add(`UI framework import ${specifier} is prohibited.`);
      }
      if (specifier === "workbox" || specifier.startsWith("workbox-") || specifier.includes("vite-plugin-pwa")) {
        messages.add(`Service-worker dependency ${specifier} is prohibited.`);
      }
    }
    if (
      !unit.path.endsWith(".worklet.ts") &&
      importsExecutableDspCore(sourceFile, normalizePath(unit.path))
    ) {
      messages.add("Custom DSP cores may execute only in AudioWorklet processors.");
    }

    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)) {
        messages.add("JSX syntax is prohibited.");
      }
      if (ts.isIdentifier(node)) {
        if (/midi/i.test(node.text)) messages.add(`MIDI identifier ${node.text} is prohibited.`);
        if (node.text === "React" || node.text === "Vue" || node.text === "LitElement") {
          messages.add(`UI framework identifier ${node.text} is prohibited.`);
        }
        if (node.text === "ScriptProcessorNode" || node.text === "createScriptProcessor") {
          messages.add(`${node.text} is prohibited.`);
        }
        if (/^(?:ServiceWorker|ServiceWorkerContainer|ServiceWorkerRegistration)$/.test(node.text)) {
          messages.add(`${node.text} is prohibited.`);
        }
        if (layerFor(unit.path) === "ui" && UI_AUDIO_GLOBALS.has(node.text)) {
          messages.add(`UI must not own browser audio handle ${node.text}.`);
        }
        if (layerFor(unit.path) === "state" && STATE_BROWSER_GLOBALS.has(node.text)) {
          messages.add(`State must not hold browser object ${node.text}.`);
        }
      }
      if (ts.isPropertyAccessExpression(node) && node.name.text === "serviceWorker") {
        messages.add("Service-worker registration is prohibited.");
      }
      if (ts.isStringLiteralLike(node)) {
        if (/midi/i.test(node.text)) messages.add(`MIDI string ${node.text} is prohibited.`);
        if (/ScriptProcessorNode|createScriptProcessor/.test(node.text)) {
          messages.add(`${node.text} is prohibited.`);
        }
        if (/service[-_ ]?worker|serviceWorker/i.test(node.text)) {
          messages.add("Service-worker code is prohibited.");
        }
        if (/^\/api(?:\/|$)/.test(node.text) || /^https?:\/\//.test(node.text)) {
          messages.add("Product API and remote endpoint URLs are prohibited.");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    for (const message of messages) violations.push({ path: unit.path, message });
  }
  return violations;
}

export function findForbiddenArtifactViolations(
  units: readonly SourceUnit[],
): readonly PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const unit of units) {
    const normalized = normalizePath(unit.path);
    if (normalized.endsWith(".webmanifest") || /(?:^|\/)public\/manifest\.json$/i.test(normalized)) {
      violations.push({ path: unit.path, message: "PWA manifest files are prohibited." });
    }
    if (/<link\b[^>]*\brel=["'][^"']*\bmanifest\b[^"']*["']/i.test(unit.source)) {
      violations.push({ path: unit.path, message: "PWA manifest links are prohibited." });
    }
    if (
      normalized.startsWith(".github/workflows/") &&
      /actions\/(?:configure-pages|deploy-pages|upload-pages-artifact)@/i.test(
        unit.source,
      )
    ) {
      violations.push({
        path: unit.path,
        message: "Remote product deployment workflows are prohibited.",
      });
    }
  }
  return violations;
}

function knownPluginIds(units: readonly SourceUnit[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const unit of units) {
    const folderMatch = /src\/engine\/(?:effects|modules)\/([^/]+)\//.exec(unit.path);
    if (folderMatch?.[1] !== undefined) ids.add(folderMatch[1]);
    const sourceFile = parse(unit);
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ((ts.isIdentifier(node.name) && node.name.text === "pluginId") ||
          (ts.isStringLiteralLike(node.name) && node.name.text === "pluginId")) &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        ids.add(node.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return ids;
}

function isPluginOwnedPath(path: string, pluginIds: ReadonlySet<string>): boolean {
  const normalized = normalizePath(path);
  if (normalized.includes("/registry/") || /\/registry(?:\.[cm]?[jt]s)?$/.test(normalized)) return true;
  if (normalized.includes("/plugins/")) return true;
  return [...pluginIds].some(
    (pluginId) =>
      normalized.includes(`/modules/${pluginId}/`) || normalized.includes(`/effects/${pluginId}/`),
  );
}

function branchMentionsPlugin(
  node: ts.Node,
  pluginIds: ReadonlySet<string>,
): boolean {
  let containsConcreteId = false;
  const visit = (child: ts.Node): void => {
    if (ts.isStringLiteralLike(child) && pluginIds.has(child.text)) containsConcreteId = true;
    if (
      ts.isPropertyAccessExpression(child) &&
      child.name.text === "pluginId" &&
      ts.isIdentifier(child.expression) &&
      /(?:_MANIFEST|_PLUGIN_ID)$/.test(child.expression.text)
    ) {
      containsConcreteId = true;
    }
    if (!containsConcreteId) ts.forEachChild(child, visit);
  };
  visit(node);
  return containsConcreteId;
}

export function findPluginBranchViolations(units: readonly SourceUnit[]): readonly PolicyViolation[] {
  const pluginIds = knownPluginIds(units);
  const violations: PolicyViolation[] = [];
  for (const unit of units) {
    if (isPluginOwnedPath(unit.path, pluginIds)) continue;
    const sourceFile = parse(unit);
    const visit = (node: ts.Node): void => {
      const isBranch =
        ts.isIfStatement(node) ||
        ts.isConditionalExpression(node) ||
        ts.isSwitchStatement(node) ||
        ts.isCaseClause(node);
      if (isBranch && branchMentionsPlugin(node, pluginIds)) {
        violations.push({
          path: unit.path,
          message: "Product-specific plugin-ID branching is allowed only in its plugin folder or registry.",
        });
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return violations;
}
