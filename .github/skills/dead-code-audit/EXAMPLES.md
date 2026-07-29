# Dead-code examples

## AudioWorklet

A processor can be live only through `addModule` and a generated URL. Trace the
URL import and the processor registration string.

## Plugin

A plugin can be live only through its registry and manifest. Trace both before
you remove its adapter, runtime, processor, or assets.

## Migration

A migration can be absent from the normal save path. It remains live when the
import contract supports its older project version.

## Asset

CSS, a manifest, or generated build metadata can own an asset URL. Search each
owner before you classify the asset.
