# Dead Code Audit Reference

## Deletion Standard

Delete a finding only when all of the following are true locally:

- no static references remain
- no framework entrypoint or config file needs it
- no dynamic lookup, reflection, or serialization contract relies on it
- no nearby test or generated artifact expects it

If any one of those points is unresolved, stop and report instead of deleting.

## False Positive Checklist

Treat a finding as alive when it is used through one of these paths:

- React component references, JSX element usage, or conditional rendering
- JSON serialization and deserialization contracts
- reflection, dynamic imports, or template literal access
- Build entry files (Electron main process entry, preload scripts,
  renderer entry, backend Web Worker entry)
- test-only or fixture-only reachability that the scan intentionally excludes
- IPC channel names and contextBridge API surface — symbols exposed to the
  renderer via preload may appear unused in main-process scans
- state store selectors or subscriptions (renderer)
- CSS class name references that appear in template strings

## Audit Validation

After each deletion:

1. Search again for the removed symbol, file, and exported name.
2. Run the narrowest test that exercises the owning module or entrypoint.
3. Run `npm run typecheck` and `npm run lint`.
4. Re-run `npm run fallow` before completing the cleanup.

If any command fails, restore neither unrelated code nor speculative
replacements. Report the exact failure and the smallest next check.

## Reporting Contract

For every finding, report:

- path and symbol,
- classification: live, false positive, removed, or unresolved,
- concrete reachability or absence evidence,
- validation commands and outcomes,
- any residual uncertainty.
