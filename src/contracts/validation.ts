export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function validationSuccess<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function validationFailure(
  path: string,
  message: string,
): ValidationResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

export function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
