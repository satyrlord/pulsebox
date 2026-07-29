---
name: dead-code-audit
description: >
  Audit Pulsebox reachability and remove proven dead items. Use for code, assets,
  dependencies, false positives, or reachability proof requested by another skill.
---

# Audit dead code

## 1. Select the branch

1. Use audit mode when the user asks for findings only.
   Finish when the scope is read-only and explicit.
2. Use cleanup mode when the user requests removal.
   Finish when the removal scope and verification authority are explicit.

## 2. Establish the graph

1. Read `AGENTS.md`, `package.json`, tool configuration, and relevant contracts.
   Finish when you know all configured graph tools and protected paths.
2. List each production, test, worklet, worker, plugin, style, asset, and build entry.
   Finish when every configured entry point has an owner.
3. Run each applicable repository graph check from `package.json`.
   Finish when every available tool has a recorded result.
4. Create a candidate inventory from tool output and repository searches.
   Finish when every candidate has a stable path or dependency name.

Do not invent entry points or planned tools. Current files and package scripts
must prove that they exist.

## 3. Prove each candidate

Check these reachability paths for every candidate:

- static and dynamic imports
- React composition, registries, manifests, and `data-component` hooks
- AudioWorklet and worker URL construction
- typed events, command unions, selectors, and serialization
- CSS modules, custom properties, inline SVG, Canvas, and asset URLs
- migration, import, test, fixture, build, and documentation paths
- approved later-phase or research ownership

Read [REFERENCE.md](REFERENCE.md) before deletion. Read [EXAMPLES.md](EXAMPLES.md)
when a dynamic path can create a false positive.

Finish this stage when each candidate is live, dead, or unresolved. Record the
evidence that excludes the other classifications.

## 4. Act within scope

1. In audit mode, report each classification without editing.
   Finish when every inventoried candidate appears in the report.
2. In cleanup mode, remove the smallest proven dead slice.
   Finish when no live contract or reference depends on the removed slice.
3. Re-run the narrowest affected graph, type, lint, test, and build checks.
   Finish when all applicable checks pass or have a reported blocker.

Do not delete approved research because production code does not reach it.
Static analysis alone does not authorize deletion.

## Completion criterion

Account for every candidate as live, false positive, removed, or unresolved.
Give the proof and verifier for each item. Do not claim a clean audit when a
required tool or dynamic path remains unavailable.
