# Full Code Review Reference

## Remedy Patterns

### Delete a layer

When a helper wraps another helper without hiding policy or complexity, remove
the pass-through layer. Keep the deletion only when callers become easier to
understand.

### Reframe the model

When the same boolean combinations recur across files, replace them with one
explicit state model at the owning boundary and centralize its transition.

### Push to canonical ownership

When feature logic appears in a shared module, move it to the module that owns
the documented concept. Add an extension seam only when a second real caller
proves the seam.

### Collapse branches

When different guards perform the same action, combine the decision at the
earliest canonical point. Prefer eliminating the divergent state over merely
extracting a larger condition.

### Inline an identity wrapper

Remove a wrapper that only renames a call. Keep a wrapper when its name exposes
a real policy such as timeout, retry, validation, or translation.
