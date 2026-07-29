# Dead-code evidence

Delete a candidate only when all these conditions are true:

1. No production, test, build, plugin, serialization, migration, style, asset, or documentation path needs it.
2. No dynamic import, registry, manifest, or string-based path reaches it.
3. No approved contract keeps it for a later phase.
4. Removal leaves no invalid reference or public contract.
5. The narrowest affected checks pass after removal.

Common false positives include these items:

- worklet processors loaded through generated URLs
- plugins reached through manifest registries
- CSS tokens used across style boundaries
- commands reached through deserialization
- migrations used only by supported older projects
- browser-specific fallback modules
- approved non-shipping research

For each finding, report the tool result, local proof, action, and post-action
verifier.
