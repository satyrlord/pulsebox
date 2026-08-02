/**
 * Generic voice-note lookups over an instrument manifest. Each manifest
 * declares its voice notes and its audition note, so these helpers hold no
 * per-plugin table and no code outside a plugin folder names a plugin ID
 * (section 6.5).
 */

import type { InstrumentPluginManifest, PluginManifest } from "../../contracts/plugins";

/**
 * The note an audition should sound: the selected voice when it declares a
 * note, and the manifest's documented audition note otherwise (section 15.0).
 */
export function auditionNoteFor(
  manifest: InstrumentPluginManifest,
  voiceId: string | undefined,
): number {
  const voiceNote =
    voiceId === undefined
      ? undefined
      : manifest.voices.find((voice) => voice.id === voiceId)?.note;
  return voiceNote ?? manifest.auditionNote;
}

/**
 * The notes a plugin can sound, or undefined when every note maps, as on a
 * pitched instrument. Section 14 swap keeps sequence data where event mapping
 * is valid and reports the rest; this set is what "valid" means for a drum
 * machine, whose voices each declare one note.
 */
export function playableNotesFor(manifest: PluginManifest): ReadonlySet<number> | undefined {
  if (manifest.kind !== "instrument") return undefined;
  const notes = manifest.voices.flatMap((voice) => (voice.note === undefined ? [] : [voice.note]));
  return notes.length === 0 ? undefined : new Set(notes);
}
