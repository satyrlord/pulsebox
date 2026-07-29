/**
 * Joins CSS Module class names. Lookups into a CSS Module are typed
 * `string | undefined` under `noUncheckedIndexedAccess`, so this drops the
 * absent ones rather than emitting the word "undefined" into `class`.
 */
export function cx(...names: readonly (string | false | undefined)[]): string {
  return names
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .join(" ");
}
