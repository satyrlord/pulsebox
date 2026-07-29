# Data and configuration slop

Compare each file with its schema, loader, and sibling entries.

Inspect these candidates:

- placeholder values in live data
- keys that the consumer does not support
- duplicate entries with no behavior difference
- nesting that conflicts with the sibling shape
- paths, URLs, identifiers, or packages that do not resolve
- environment values outside the configured mechanism

Keep explicit default fields when a schema requires them. Also keep them when
they record an intentional override or stabilize serialization.

Validate edited data with its parser, schema check, or narrowest consumer test.
