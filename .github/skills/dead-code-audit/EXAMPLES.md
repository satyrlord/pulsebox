# Dead-code examples

## Custom Element

A class with no TypeScript constructor call may still be live through
customElements.define and a pulse-* tag in markup. Trace both before deleting.

## AudioWorklet

A processor may be loaded only by addModule with a build-generated URL. Confirm
the URL edge and processor registration string.

## Migration

A migration may be absent from the normal save path but required when importing
an older supported .pulsebox schema. Check the version dispatcher and contract.

## Asset

An SVG or stylesheet may be addressed through a manifest or CSS URL. Search
both code and generated build metadata before calling it orphaned.
