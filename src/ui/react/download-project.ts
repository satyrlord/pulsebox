/**
 * Portable-project download, owned in one place so the menu and the
 * unsupported-size notice cannot drift apart on filename rules or on the
 * lifetime of the object URL.
 */

const PROJECT_FILE_EXTENSION = ".pulsebox";

/**
 * A project name is free text, so it is reduced to a safe basename. A name made
 * entirely of punctuation reduces to nothing, which would otherwise produce a
 * file called only `.pulsebox`.
 */
function safeProjectFilename(name: string): string {
  const filename = name
    .replaceAll(/[^\w-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
  return filename.length === 0 ? "project" : filename;
}

export type ProjectDownloadResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Revoking an object URL in the same task as the click can cancel the download
 * before the browser has read it, so the revoke is deferred to the next task.
 * The serializer can also refuse an oversized manifest, which is reported rather
 * than thrown at the click handler.
 */
export function downloadPortableProject(
  bytes: () => Uint8Array,
  projectName: string,
): ProjectDownloadResult {
  let url: string | undefined;
  try {
    const blob = new Blob([new Uint8Array(bytes())], { type: "application/zip" });
    url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeProjectFilename(projectName)}${PROJECT_FILE_EXTENSION}`;
    anchor.rel = "noopener";
    // Firefox only dispatches a download for an anchor in the document.
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return { ok: true };
  } catch {
    return { ok: false, reason: "This project could not be exported." };
  } finally {
    const created = url;
    if (created !== undefined)
      setTimeout(() => {
        URL.revokeObjectURL(created);
      }, 0);
  }
}
