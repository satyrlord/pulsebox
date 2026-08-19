const UTF8_ENCODER = new TextEncoder();

/** Finds controls and unpaired UTF-16 surrogates that JSON text cannot keep. */
export function hasForbiddenTextCodePoint(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** Checks a trimmed user-visible name against the project-format byte limit. */
export function isValidUserVisibleName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    !hasForbiddenTextCodePoint(trimmed) &&
    UTF8_ENCODER.encode(trimmed).length <= 256
  );
}
