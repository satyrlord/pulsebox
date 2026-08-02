/**
 * Portable-project download mechanics: the anchor, the object URL, and its
 * lifetime. The filename rule and the extension are format policy and live
 * with the portable serializer in the state layer.
 */

import { portableProjectFilename } from "../../state/public";

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
    anchor.download = portableProjectFilename(projectName);
    anchor.rel = "noopener";
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
