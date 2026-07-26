---
name: design-router
description: Selects one bundled design system before generating or restyling UI.
disable-model-invocation: true
license: MIT
metadata:
  author: typeui.sh (catalog) / router by user
---

# Design Router

Select one design system before generating or restyling UI.

## Route

1. Extract the requested style, product type, and visual constraints.
2. If the user names a theme slug exactly, load `themes/<slug>.md`.
3. Otherwise, use [CATALOG.md](CATALOG.md) to select the closest single
   theme. Default to `clean` for applications and `modern` for marketing
   pages only when the request supplies no useful visual direction.
4. Read the selected theme file completely and apply its tokens, typography,
   spacing, component rules, quality gates, and design intent.
5. Do not mix themes unless the user explicitly requests a hybrid; when they
   do, name the primary theme and the exact borrowed constraint.

## Completion Criterion

Routing is complete when exactly one primary theme is named, its theme file
has been read, every generated UI decision follows that file or an explicit
user override, and any requested hybrid records the single borrowed
constraint.
