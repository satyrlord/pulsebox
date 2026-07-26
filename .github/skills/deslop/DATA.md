# Data and Configuration Slop

Compare each file with the schema, loader, and sibling entries before editing.

Flag:

- placeholder or scaffold values left in live data,
- keys unsupported by the consuming schema,
- duplicate entries with no meaningful behavioral difference,
- nesting that conflicts with the established sibling shape,
- paths, URLs, identifiers, or package names that do not resolve,
- environment-specific values placed outside the repository's existing
  configuration mechanism.

Do not remove default-valued fields when their explicit presence documents an
intentional override, stabilizes serialization, or is required by an external
schema. Validate edited data with its parser, schema check, or narrowest
consumer test.
