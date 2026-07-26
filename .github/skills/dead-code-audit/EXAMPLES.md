# Dead Code Audit Examples

## Example 1: Audit-Only Scan

- Prompt shape: "Run a dead-code scan and tell me what is really dead."
- Good behavior: run the scan, inspect only reported artifacts, and return a
  findings list without editing code.
- Good result: separate provable dead code from false positives caused by entry
  wiring or generated usage.

## Example 2: Cleanup Of One Proven Helper

- Prompt shape: "Clean up the unused parser helper reported by the scan."
- Good behavior: prove there are no direct uses, reflection hooks, or test
  dependencies before deleting the smallest slice.
- Good result: one focused deletion followed by targeted validation.

## Example 3: False Positive From Host Wiring

- Prompt shape: "Why did the scan mark this view model unused?"
- Good behavior: trace the component through React tree usage, Zustand store
  selectors, and dynamic imports before deleting it.
- Good result: report the false positive and recommend the narrowest recurring
  suppression only if the same pattern will keep appearing.
