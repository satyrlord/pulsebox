import type { ValidationIssue } from "../../contracts/validation";

export const MAXIMUM_REPORTED_ISSUES = 100;

export const AUTOMATION_LANE_KEYS = new Set([
  "id",
  "scope",
  "targetId",
  "parameterId",
  "patternId",
  "stepTicks",
  "steps",
]);

export const AUTOMATION_STEP_KEYS = new Set(["tick", "value"]);

export class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  add(path: string, message: string): void {
    if (this.issues.length < MAXIMUM_REPORTED_ISSUES) this.issues.push({ path, message });
  }

  get full(): boolean {
    return this.issues.length >= MAXIMUM_REPORTED_ISSUES;
  }

  exactKeys(
    value: Readonly<Record<string, unknown>>,
    keys: ReadonlySet<string>,
    path: string,
  ): void {
    for (const key of Object.keys(value)) {
      if (!keys.has(key)) this.add(path, `Unknown key ${key}.`);
    }
  }
}

export function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0) &&
    value >= minimum &&
    value <= maximum
  );
}
