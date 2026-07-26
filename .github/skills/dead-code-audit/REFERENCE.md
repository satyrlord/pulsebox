# Dead-code evidence

Delete a candidate only when all of these are true:

1. No production, test, build, plugin, registration, serialization, migration,
   style, asset, or documentation path requires it.
2. Dynamic loading and string-based registration have been checked.
3. The owning contract does not require the path for a later approved phase.
4. Removing it leaves no invalid reference or public contract.
5. The narrowest relevant checks pass after removal.

Common false positives:

- Custom Elements referenced only by tag name.
- AudioWorklet processors loaded through a URL.
- Plugins reached through a manifest registry.
- CSS tokens consumed across Shadow DOM boundaries.
- Command variants reached through deserialization.
- Project migrations used only by older supported schema versions.
- Browser-specific fallback modules.

Report the tool output, local proof, action, and post-action verifier for every
finding.
