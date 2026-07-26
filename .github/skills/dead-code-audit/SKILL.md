---
name: dead-code-audit
description: Audit Pulsebox for provably unreachable TypeScript, Web Components, plugins, AudioWorklets, styles, assets, exports, and dependencies; remove findings only when cleanup is explicitly requested.
---

# Audit dead code

## Establish the current graph

1. Read AGENTS.md and the relevant product contracts.
2. Read package.json and tool configuration when they exist.
3. Identify actual application, test, worklet, worker, plugin, theme, and build
   entry points.
4. Run the repository dead-code, typecheck, lint, and build scripts only when
   they are present and current.

The repository may not have implementation tooling yet. Do not treat the
imported .fallowrc.json as valid until its entry points match current Pulsebox
files and a package script invokes it.

## Prove each finding

For every candidate, inspect:

- static imports and dynamic imports;
- customElements.define registrations and element names in markup;
- plugin registry and manifest references;
- AudioWorklet and worker URL construction;
- typed event names, command unions, selectors, and serialization;
- Shadow DOM styles, CSS custom properties, inline SVG, Canvas, and asset URLs;
- migration and import paths;
- tests, fixtures, build inputs, and public documentation.

Static analysis is evidence, not permission to delete. Project migrations can
be live even when ordinary call sites are absent.

## Act only within scope

- In audit mode, report findings and false positives without editing.
- In cleanup mode, remove the smallest proven dead slice.
- Preserve research/ as non-shipping research when it complies with the
  originality boundary; absence from the production graph alone is not proof
  that approved research is unwanted.
- Re-run the narrowest graph, type, lint, test, and build checks after each
  coherent deletion.

## Completion

Classify every candidate as live, false positive, removed, or unresolved.
Provide concrete evidence for each classification and do not claim a clean
audit when required tooling is absent. Use [REFERENCE.md](REFERENCE.md) for the
deletion standard and [EXAMPLES.md](EXAMPLES.md) for common Pulsebox roots.
