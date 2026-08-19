import {
  PROJECT_FORMAT,
  type DocumentResult,
  type ParseOptions,
  type ProjectDocument,
} from "./project-document-schema";
import { migrateFormatOneDocument, migrateFormatTwoDocument } from "./project-document-migrations";
import { parseCurrentProjectDocument, parseProjectJsonValue, scanSafeProjectValue } from "./project-document-parser";

export * from "./project-document-schema";
export { serializeProject, serializeProjectToJson } from "./project-document-serialization";
export { createParameterValidator } from "./project-document-parser";
export { documentToState } from "./project-document-state-mapping";

/** Validates hostile input, applies migrations in order, and parses the current schema. */
export function parseProjectDocument(
  value: unknown,
  options: ParseOptions,
): DocumentResult<ProjectDocument> {
  let candidate = value;
  for (;;) {
    const scanned = scanSafeProjectValue(candidate);
    if (!scanned.ok) return scanned;
    const document = scanned.value;
    if (document.format !== PROJECT_FORMAT) {
      return parseCurrentProjectDocument(document, options);
    }
    if (document.formatVersion === 1) {
      const migrated = migrateFormatOneDocument(document);
      if (!migrated.ok) return migrated;
      candidate = migrated.value;
      continue;
    }
    if (document.formatVersion === 2) {
      const migrated = migrateFormatTwoDocument(document);
      if (!migrated.ok) return migrated;
      candidate = migrated.value;
      continue;
    }
    return parseCurrentProjectDocument(document, options);
  }
}

export function parseProjectJson(
  json: string,
  options: ParseOptions,
): DocumentResult<ProjectDocument> {
  const parsed = parseProjectJsonValue(json);
  if (!parsed.ok) return parsed;
  return parseProjectDocument(parsed.value, options);
}
