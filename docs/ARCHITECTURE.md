# Pulsebox Architecture Contract

**Status:** Normative architecture contract

**Applies to:** Pulsebox MVP

**Authority:** The indexed [product specification set](specs/spec-000-index.md)
remains the product and acceptance source. This document owns the durable
architecture details that implement that specification set.

**Implementation state:** The Phase 1 contracts, layer guards, state spine,
AudioWorklet spine, transport, bundled decoder adapter, and React UI foundation
exist. Narrow later-phase foundations are listed in README.md. Their parent
phases remain incomplete until their full owned scope and acceptance gates pass.

## 1. Purpose and interpretation

This document defines the architecture that Pulsebox code shall follow. An
implemented Phase 1 slice does not imply that later MVP systems exist.

The words **must**, **must not**, **shall**, **shall not**, **should**, and
**may** are normative. A product-owner decision recorded in the owning product
specification overrides this document. The affected documents shall be updated
together if an accepted decision changes a boundary defined here.

Pulsebox shall remain:

- a fully client-side browser application.
- a strict-TypeScript application with one consistent UI component model.
- a three-layer system with engine, state, and UI ownership kept separate.
- limited to eight enabled rack slots in the MVP while keeping internal
  contracts slot-count agnostic.
- usable for editing when audio is locked, suspended, or unavailable.
- free of a server product component, accounts, cloud sync, a native wrapper, a
  PWA, and a service worker.

The following are not goals of this contract:

- third-party plugin hosting or executable plugin import.
- MIDI support or placeholders for later MIDI support.
- arbitrary audio routing beyond main output and four send buses.
- network APIs or remote persistence.
- compatibility scaffolding for code that has not shipped.
- editable layouts below 1280 by 720 CSS pixels.

## 2. Runtime and origin contract

### 2.1 Canonical origin

Every supported Pulsebox runtime shall use this exact origin:

```text
http://127.0.0.1:4173
```

The scheme, numeric host, and port are all part of the contract. `localhost`,
another loopback address, another port, HTTPS, and a `file:` URL are different
origins and shall not be presented as equivalent Pulsebox runtimes.

`npm run dev` and the production-build launcher `npm run start` shall both bind
only to `127.0.0.1` and shall request port `4173` in strict-port mode. They
shall fail with an actionable error if that port is unavailable. They shall not
select another port automatically. Browser tests that exercise persistence,
recovery, storage quota, or multi-tab behavior shall also use this exact origin.

The fixed origin is required because browser storage and permissions are
origin-scoped. A build opened under another origin shall be treated as a
separate, unsupported data store. Pulsebox shall not copy data silently between
origins.

### 2.2 Static delivery is not a server product component

The local process that serves the development files or built static files is a
delivery tool. It shall not become a Pulsebox product layer. It may return the
application shell, JavaScript modules, styles, fonts, worklet modules, decoder
modules, and static assets. It shall not:

- expose application APIs.
- store or transform projects.
- decode or render audio.
- perform authentication.
- proxy remote services.
- run collaboration or synchronization logic.
- remain necessary after a page has loaded except to fetch static build assets.

All project operations, decoding, rendering, export, and persistence shall
execute in the browser. Production evidence shall use the production build
served at the canonical origin, not development-module behavior alone.

## 3. System shape and dependency rule

Pulsebox shall have three domain layers and one composition boundary:

```text
UI intent
  -> application composition boundary
    -> state command and validated state transition
      -> engine projection and audio scheduling
        -> AudioWorklet processors and native-node adapters

engine status and bounded telemetry
  -> application composition boundary
    -> transient state/selectors
      -> UI patch
```

The application composition boundary shall create objects, inject ports, route
accepted commands, and manage startup and shutdown. It is not a fourth domain
layer. It shall contain no product rules, audio algorithms, project mutations,
or UI rendering.

A small `contracts` area may hold data-only TypeScript types shared between
layers. It shall contain no mutable singleton, browser handle, storage call, DOM
code, audio node, or product-specific algorithm.

Allowed compile-time dependencies are:

| Consumer    | May depend on                                                      | Must not depend on                                                              |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| UI          | UI code, data-only contracts, state read and command ports         | Engine implementations, `AudioNode`, worklet ports, persistence implementations |
| State       | State code, data-only contracts, injected persistence ports        | DOM, UI components, Canvas, `AudioNode`, worklet implementations                |
| Engine      | Engine code, data-only contracts, injected clock and decoder ports | DOM, UI components, project repositories, UI code                               |
| Composition | Public ports from UI, state, engine, and persistence adapters      | Private internals of any layer                                                  |

Cross-layer imports that bypass a public port shall fail an architecture test.
Runtime globals shall not be used to evade this rule.

## 4. Layer ownership

### 4.1 Engine

The engine shall own:

- the `AudioContext` and `OfflineAudioContext` lifecycles.
- all live `AudioNode` objects and graph connections.
- instrument and effect runtime instances.
- AudioWorklet registration, nodes, ports, processors, and messages.
- the audio clock, lookahead scheduler, transport projection, and voice
  allocation.
- smoothing, micro-fades, routing safety, metering, and bounded feedback.
- the Pulsebox sample-decoding abstraction and prepared PCM buffers.
- offline rendering, deterministic resampling, dither, WAV writing, and export
  progress.
- recovery from an engine or processor fault.

The engine shall have no DOM dependency. It shall not read from or write to
IndexedDB or local storage directly. It shall consume validated state
projections and return typed acknowledgments, status, warnings, faults,
transport observations, and bounded telemetry.

Suitable native Web Audio nodes may exist only behind engine-owned plugin
adapters. Custom synthesis and custom DSP shall execute in AudioWorklet
processors. Main-thread custom DSP and `ScriptProcessorNode` are prohibited.

### 4.2 State

The state layer shall own:

- plain project and editor data.
- stable identifiers and references.
- typed commands and command validation.
- atomic state transitions.
- undo, redo, and gesture coalescing.
- selectors and selector-based subscriptions.
- serialization, migration, import validation, and repair reports.
- automation data and deterministic seeds.
- persistence status, autosave intent, recovery metadata, and multi-tab revision
  state.
- project asset metadata and references, but not decoded PCM buffers.

The state layer shall have no DOM dependency. It shall store no live
`AudioNode`, `AudioBuffer`, worklet, port, timer, or observer in project state.
It shall also store no animation frame or browser file handle in project state.

Persistence implementations shall be adapters behind state-owned repository
ports. The normative document and archive schema, asset limits, transaction
rules, pack references, import validation, and recovery rules belong to
[`PROJECT-FORMAT.md`](PROJECT-FORMAT.md). If that document and this one
disagree, implementation shall stop until the two contracts are reconciled.

### 4.3 UI

The UI shall own:

- the UI components and their composition.
- style encapsulation for reusable controls and isolated leaf components.
- layout, keyboard and pointer input, focus, and accessibility.
- theme application and visual state.
- Canvas or SVG rendering for high-frequency or geometric views.
- typed user intents and command dispatch.
- direct, selected-state DOM patching.

The UI shall not construct, connect, disconnect, inspect, or retain an audio
graph object. It shall not own a worklet port. It shall not mutate project
objects. A visible edit shall become a typed command or a documented transient
UI preference.

Components shall render their structure once and patch changed values. They
shall release listeners, observers, timers, pointer captures, animation frames,
and subscriptions when disconnected.

## 5. Stable identifiers and references

### 5.1 Identifier families

Durable entities shall use distinct opaque TypeScript brands. At minimum, the
contracts shall define:

```ts
type ProjectId = string & { readonly __brand: "ProjectId" };
type ProjectLineageId = string & { readonly __brand: "ProjectLineageId" };
type StateRevisionEpoch = string & { readonly __brand: "StateRevisionEpoch" };
type RevisionEpoch = string & { readonly __brand: "RevisionEpoch" };
interface StateRevision {
  readonly epoch: StateRevisionEpoch;
  readonly counter: number;
}
interface ProjectRevision {
  readonly epoch: RevisionEpoch;
  readonly counter: number;
}
type RackSlotId = string & { readonly __brand: "RackSlotId" };
type ModuleInstanceId = string & { readonly __brand: "ModuleInstanceId" };
type VoiceId = string & { readonly __brand: "VoiceId" };
type PatternId = string & { readonly __brand: "PatternId" };
type NoteEventId = string & { readonly __brand: "NoteEventId" };
type EffectInstanceId = string & { readonly __brand: "EffectInstanceId" };
type AutomationLaneId = string & { readonly __brand: "AutomationLaneId" };
type AssetId = string & { readonly __brand: "AssetId" };
type ContentId = string & { readonly __brand: "ContentId" };
```

`StateRevision` orders accepted in-memory commands and engine projections. It
advances for each accepted project edit, Undo, and Redo. At the maximum counter,
it generates a new state-revision epoch and continues at zero. It is runtime
coordination data and is not written to `ProjectMetadata`.

`ProjectRevision` is the committed browser-storage token defined by
`PROJECT-FORMAT.md`. It advances only inside a successful save transaction. The
two revision types are distinct and shall not be assigned to each other.

Instance and musical-entity IDs shall be lowercase canonical UUID strings
generated with a cryptographically strong browser source. Tests shall inject a
deterministic ID factory. Identity across stored heads is project ID, lineage
ID, and typed entity ID. An entity ID shall never be reused for a different
entity within one lineage. This rule also applies after Undo removes an entity
and a later command creates another entity. Whole-project Replace and Undo replace start new
lineages and use complete state and engine replacement, as defined in
`PROJECT-FORMAT.md`.

The eight MVP rack positions shall use the fixed `RackSlotId` values `slot-01`
through `slot-08`. The four sends shall use `send-a` through `send-d`. Module
identity shall follow `ModuleInstanceId`, not a slot position. Moving a module
shall change the slot-to-module mapping without changing the module, pattern,
automation, mixer, or effect instance IDs.

Arrays may encode display order. An array index shall never be serialized as the
identity of a module, plugin instance, pattern, event, lane, playlist clip,
asset, or routing target.

### 5.2 Plugin and parameter identifiers

`PluginId` and `ParameterId` shall be stable lowercase ASCII strings matching
`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`. A built-in plugin ID shall use the approved
product code ID or another approved namespaced ID. It shall not include a
display label or version.

A parameter ID shall be unique within its plugin or owning core domain. It shall
remain unchanged when its label, order, unit display, editor location, or
implementation changes. Serialized parameter references shall use the tuple of
plugin or core owner, instance ID where relevant, and parameter ID.

Removing or reusing a published parameter ID for different behavior shall
require a project-schema migration. Renaming a display label shall not.

### 5.3 Content IDs

Content IDs shall be derived from canonical original asset bytes with SHA-256
and serialized as `sha256:` followed by 64 lowercase hexadecimal characters.
Decoded PCM, a display name, a file path, and browser metadata shall not affect
the content ID. `PROJECT-FORMAT.md` shall own duplicate detection, pack
identity, and archive serialization.

## 6. Plugin contract

Pulsebox plugins are built-in, reviewed code registered at build time. A project
may reference plugin data, but it shall never import or execute plugin code.
Plugin hosting remains outside the MVP.

### 6.1 Registry

The engine shall expose one immutable build-time registry keyed by `PluginId`. A
registry entry shall pair a declarative manifest with an engine factory. UI
metadata shall be declarative and shall map to project-owned component
implementations. A plugin manifest shall not contain arbitrary HTML, CSS,
script, or executable callbacks from project data.

Adding an instrument or effect shall require one plugin folder and one registry
entry. Shared engine, state, persistence, mixer, automation, and UI code shall
dispatch through typed contracts. They shall not branch on a product-specific
plugin ID.

Before audio activation, registry startup shall fail if two entries claim the
same plugin ID or stable parameter ID. It shall also fail for a duplicate meter
ID, compact control position, or incompatible schema tuple.

### 6.2 Base manifest

Every plugin manifest shall satisfy this logical contract:

```ts
interface BasePluginManifest {
  readonly manifestSchemaVersion: 1;
  readonly pluginId: PluginId;
  readonly kind: "instrument" | "effect";
  readonly productName: string;
  readonly shortLabel?: string;
  readonly pluginVersion: string;
  readonly stateSchemaVersion: number;
  readonly apiVersion: 1;
  readonly engineProtocolVersion: 1;
  readonly parameters: readonly ParameterDescriptor[];
  readonly meters: readonly MeterDescriptor[];
  readonly defaultState: Readonly<Record<string, unknown>>;
  readonly ui: PluginUiManifest;
  readonly automation: "none" | "step";
  readonly cpuClass: "light" | "moderate" | "heavy";
  readonly compatibility: PluginCompatibility;
}
```

`PluginUiManifest.moduleAccent` declaratively supplies the four fixed module
accent tokens owned by `THEMING.md`. Shared UI applies those values generically.
it does not branch on a plugin ID, short label, or instrument name.

`pluginVersion` shall use semantic-version syntax. `stateSchemaVersion` shall be
a positive integer and shall change only when serialized plugin state changes.
`cpuClass` is informational and shall not become a release threshold.

The compatibility contract shall declare every accepted older state schema, its
deterministic migration path, and the current restore validator. A plugin shall
reject unknown newer required state. It shall not guess or discard fields
silently.

### 6.3 Parameter descriptors

A parameter descriptor shall define:

```ts
interface ParameterDescriptor {
  readonly id: ParameterId;
  readonly name: string;
  readonly shortLabel?: string;
  readonly valueType: "float" | "integer" | "boolean" | "enum";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defaultValue: number | boolean | string;
  readonly step?: number;
  readonly enumValues?: readonly string[];
  readonly unit:
    | "none"
    | "percent"
    | "decibels"
    | "hertz"
    | "seconds"
    | "milliseconds"
    | "semitones"
    | "cents"
    | "ratio"
    | "beats"
    | "bpm";
  readonly displayPrecision: number;
  readonly resetValue: number | boolean | string;
  readonly smoothing: SmoothingDescriptor;
  readonly workletRate: "a-rate" | "k-rate" | "message";
  readonly automation: "step" | "none";
  readonly modulation: "none" | "internal";
}
```

Numeric defaults, resets, and enum values shall validate against the descriptor.
`minimum`, `maximum`, `step`, and precision shall be finite. An exponential
smoother shall not cross or target zero. A parameter exposed to automation shall
have `automation: "step"`. Step values may still be smoothed in the engine to
prevent discontinuities.

Formatting shall be a trusted UI function selected by `unit` and descriptor
metadata. A project file shall not supply executable formatters. Structural
operations, meter frames, monitor selection, audio power, hover, focus, and
global UI preferences shall not be parameters or automation targets.

### 6.4 Instrument specialization

An instrument manifest shall add:

- stable voice or lane descriptors.
- accepted event forms, Pattern compatibility, and one editor capability:
  `monophonic-pitched`, `drum-triggers`, or reserved post-MVP
  `polyphonic-pitched`.
- maximum polyphony and deterministic voice-stealing rules.
- retrigger, choke, and release rules.
- input and output channel descriptors.
- per-voice output descriptors where applicable.
- sample-layer support and asset requirements where applicable.
- compact faceplate controls.
- detailed editor sections.
- a processor or native-adapter factory key.
- live and offline-render capability declarations.

The runtime adapter shall expose bounded methods to prepare, activate, update,
suspend, render offline, reset, and dispose the instance. It shall not expose an
`AudioNode` outside the engine.

### 6.5 Effect specialization

An effect manifest shall add:

- supported placement: voice insert, module pedalboard, send chain, or master
  chain.
- input and output channel configurations.
- declared latency in frames for every sample rate.
- finite tail policy and maximum tail duration, or an explicitly bounded
  generated tail.
- bypass transition and wet/dry law.
- safety clamps and feedback limits.
- the four or fewer compact controls and detailed editor sections.
- a processor or native-adapter factory key.
- live and offline-render capability declarations.

An effect shall preserve channel count unless its manifest declares an allowed
conversion. Bypass and reorder shall use bounded click-safe transitions and
shall not rebuild unrelated graph branches.

### 6.6 Required plugin behavior

Every instrument and effect referenced by a format-1 project is required. The
MVP project manifest has no optional-plugin mode and no plugin placeholder.

- The reader shall reject the whole import before project state changes if a
  plugin is unknown or has the wrong kind.
- It shall also reject an unsupported API version, an unknown newer state
  version, or a missing complete migration path.
- A reader shall not create a bypass, silence substitute, replacement plugin, or
  opaque plugin-state placeholder to pass validation.
- Semantic plugin version records authorship. Compatibility shall depend on
  exact plugin ID and kind, supported `apiVersion`, a supported state schema or
  complete deterministic migration chain, and successful post-migration
  validation.
- Unknown project data shall never load code, markup, CSS, URLs, worklet
  modules, decoder modules, or factories.

Unknown optional extension records are not plugins. `PROJECT-FORMAT.md` owns
their bounded opaque preservation and required-extension rejection rules.

## 7. State, commands, and undo

### 7.1 Store contract

The central store shall expose typed equivalents of:

```ts
interface PulseStore {
  getState(): Readonly<PulseState>;
  dispatch(command: Command): CommandResult;
  subscribe<T>(selector: Selector<T>, listener: Listener<T>): Unsubscribe;
  undo(): CommandResult;
  redo(): CommandResult;
}
```

State shall be treated as immutable at the public boundary. Commands shall be
discriminated unions. Each command shall include a unique `commandId`, a stable
command type, and a typed payload. It shall also include an expected complete
state revision token, an origin, and an optional gesture ID. Wall-clock time may be metadata but shall
not decide musical behavior or command validity.

Dispatch shall validate the full command before mutation. A command shall either
apply one complete transition or no transition. Validation errors shall name the
invalid field and recovery action. Engine work shall begin only after the state
transition is accepted.

The MVP musical structure is fixed at 4/4 and its Pattern grid is fixed at 1/16.
Playlist placement, reorder, repeat-count, duplicate, and delete operations are
undoable structural commands. There are no time-signature events, Song
automation lanes, or arrangement-timeline commands in format version 1.

### 7.2 Engine projection

The composition boundary shall translate accepted state changes into a minimal
typed `EngineDelta`. It shall not send whole project objects for ordinary edits.
Every delta shall carry the accepted complete state revision token and stable
target IDs.

If the engine rejects a delta because of a fault or stale engine revision,
project state shall remain authoritative. The controller shall report the
mismatch, suspend affected audio safely, and attempt one bounded full engine
projection. It shall not mutate project state to match a failed graph.

A voice fault is scoped to its own module. The transport shall release the
faulted adapter and report the fault against that module. Every other voice
shall continue to play, and the transport shall remain able to start. Only a failure
to create or resume the audio context shall make the runtime unavailable.

Meter frames, meter-analysis mode, playheads, hover, focus, drag previews, audio
power, monitor selection, and decoder progress are transient. They shall not enter project
history or portable serialization.

A processor shall report a final zero meter frame when it is suspended, stopped,
or silenced. Rendering stops while suspended. Without that frame, the last peak
would remain the controller's most recent reading. A meter would stay lit for a
voice that is no longer sounding.

Rack-module collapse shall be a lightweight local UI preference keyed by
`ProjectId`, `ProjectLineageId`, and `ModuleInstanceId`. It shall use the
state-owned preference port, shall not enter project data or portable files, and
shall not create an undo entry. Removing a module shall remove its collapse
preference. Undoing removal shall restore the module expanded. Whole-project
Replace, Undo replace, and Import as copy use a different project or lineage
key, so equal module IDs never inherit another lineage's preference.

### 7.3 Undo and inverse data

Every committed project edit shall store a complete inverse command or a
bounded reversible patch. The stored data shall restore stable IDs and
references. Destructive module edits shall retain the removed module, its parts
from every named Pattern, mixer state, automation, asset references, and effect
chains needed by Undo.

Undo and redo shall each apply atomically through the same validation and
engine-projection path as a new command. Undo shall not replay pointer events or
call UI component methods.

Active Undo and Redo history has a combined maximum of 100 entries and 64 MiB of
canonical inverse and forward-patch JSON. Shared immutable asset and pack blobs
do not count toward the JSON budget. Each retained entry pins every blob it
references through the persistence port.

One entry is limited to 17 MiB. Its canonical before-fragment and after-fragment
are each bounded by the 8 MiB project-manifest limit. The typed command, paths,
IDs, version, and entry envelope together are separately limited to 64 KiB.
Therefore the maximum encoded entry is at most 16 MiB plus 64 KiB and fits the
17 MiB limit. A valid committed project edit shall always fit that bound.

Before appending a new entry, clear Redo and evict the oldest Undo entries until both
combined limits will hold. Eviction releases their blob pins atomically. Undo
and Redo move an entry between stacks without changing the combined budget. The
UI exposes only retained entries as available. A valid destructive action shall
not be rejected because history is full. Older entries expire first.

### 7.4 Gesture coalescing

A continuous gesture shall have one `GestureId` and shall create at most one
undo entry.

```text
begin -> zero or more preview/update transitions -> commit or cancel
```

Rules:

- `begin` shall capture the valid before-value or before-patch once.
- Updates shall patch live state and may project bounded real-time changes to
  audio, but shall not add history entries.
- `commit` shall validate the final value and create one history entry only when
  the before and after states differ.
- Escape shall cancel and restore the captured before-state.
- Pointer cancellation, component disconnection, or window blur shall commit the
  last valid value when it differs. This prevents an audible edit from escaping
  history.
- Pointer gestures end at pointer release or cancellation.
- Keyboard-repeat gestures end at key release or focus loss.
- A wheel burst coalesces by target parameter and ends after 250 milliseconds
  without another accepted wheel input.
- Direct numeric entry commits once when accepted. An invalid entry changes
  neither state nor history.
- Automation recording shall collect deliberate moves into one bounded take per
  gesture or recording pass and shall use the specification's last-value-wins
  grid rule.

Tests shall use a fake monotonic clock for the 250-millisecond boundary. They
shall cover pointer release, cancellation, blur, Escape, key repeat, wheel
bursts on one and two targets, no-op commits, Undo, and Redo.

## 8. Engine controller and AudioWorklet protocol

The Phase 1 Acid Bass adapter and processor implement this protocol. Focused
tests cover both endpoints, queue and message bounds, lifecycle, and bounded
recovery.

### 8.1 Scope and version

The controller-to-worklet protocol shall be a discriminated message protocol
with exact version `1`. Version equality is required at node creation. There is
no version negotiation or compatibility shim in the MVP.

Each port session shall begin with `hello` and `ready`. A mismatch, malformed
message, or message received before `ready` shall keep that node silent, close
the session, and produce an actionable engine fault.

Every ordinary envelope shall include:

```ts
interface EngineMessageEnvelope<TKind extends string, TPayload> {
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly nodeId: string;
  readonly sequence: number;
  readonly kind: TKind;
  readonly projectRevision?: StateRevision;
  readonly requestId?: string;
  readonly audioFrame?: number;
  readonly payload: TPayload;
}
```

`sequence`, `projectRevision.counter`, and `audioFrame` shall be non-negative
safe integers. The protocol field `projectRevision` carries a `StateRevision`,
and its epoch shall be a canonical UUID. Sequence
numbers start at zero for each direction and session and increase by one. A
session shall be replaced before a sequence can exceed
`Number.MAX_SAFE_INTEGER`. Sequence wraparound is prohibited. State-revision
rollover does not alter the persisted project revision.

### 8.2 Message families

Controller-to-processor messages shall be limited to:

- `hello`.
- `configure`.
- `state-snapshot`.
- `parameter-batch`.
- `event-batch`.
- `clear-scheduled-events`.
- `transport`.
- `sample-attach` and `sample-release`.
- `reset` and `all-notes-off`.
- `suspend` and `resume`.
- `dispose`.

`clear-scheduled-events` removes only queued future musical events at the
processor. It does not reset DSP state, end the currently sounding voice, or
suspend the node. The controller uses it before a bounded reschedule, including
when a live tempo change replaces events inside the lookahead horizon.

Processor-to-controller messages shall be limited to:

- `ready`.
- `ack`.
- `meter-frame`.
- `status`.
- `warning`.
- `fault`.
- `disposed`.

Plugin-specific payloads shall be selected by registry-owned codecs. They shall
not add unversioned top-level message kinds.

### 8.3 Ordering and acknowledgment

The receiver shall process control messages in sequence order. A duplicate shall
not be applied twice and shall repeat the last acknowledgment. A stale project
revision shall be ignored and acknowledged as stale. A gap or out-of-order
sequence shall fault the session. The controller shall replace the affected node
and restore it from one current bounded snapshot.

Scheduled event batches shall carry absolute audio-frame targets. Events in one
batch shall be sorted by frame, then by a deterministic event priority, then by
stable event ID. `all-notes-off`, `transport stop`, disposal, and graph-safety
messages shall never be dropped or reordered behind later musical events.

An acknowledgment shall identify the highest contiguous applied sequence and
complete state revision token. That token is the receiver's own current
revision, which legitimately runs ahead of the acknowledged envelope when that
envelope was stale. The controller shall therefore not require the two to match.
it shall treat only an acknowledgment of a sequence it never sent as a fault.

An acknowledgment clears the acknowledged envelopes whatever its disposition. A
`stale` disposition means the receiver deliberately ignored the envelope, so its
values shall not be recorded as the acknowledged snapshot. A snapshot becomes
authoritative only after acknowledgment. The controller shall not free state or
sample transfer data still required by an unacknowledged message.

### 8.4 Bounds and backpressure

Every queue and payload shall have a declared bound.

- A controller shall retain no more than 256 unacknowledged control envelopes
  per node.
- Backpressure begins at 192 unacknowledged envelopes.
- An ordinary serialized message payload shall not exceed 64 KiB.
- A `parameter-batch` shall contain at most 128 changes.
- An `event-batch` shall contain at most 256 events and shall not schedule
  beyond the engine's documented lookahead horizon.
- Meter publication shall be at most 30 frames per second per visible meter
  group. Only the newest unsent meter frame is retained.
- Status messages shall be edge-triggered. Identical repeated status shall
  coalesce.
- A sample transfer chunk shall not exceed 1 MiB, and at most four sample chunks
  per node may be in flight.
- Sample PCM shall use transferred `ArrayBuffer` ownership. It shall not be
  copied into ordinary JSON messages.

At backpressure, the controller shall coalesce unsent parameter changes by
instance, parameter ID, and target frame, keeping the latest value. It may
discard older unsent meter and status telemetry. It shall not discard structural
commands, note-off events, transport stop, reset, disposal, or graph-safety
messages.

If coalescing cannot keep the queue below 256, the controller shall reject new
nonessential previews. It shall issue one bounded `all-notes-off` and mark the
node as degraded. At the next safe boundary, it shall rebuild the node from the
latest state projection. It shall report the recovery. It shall not continue
posting into an unbounded browser queue.

Worklet processors shall preallocate their real-time event and parameter storage
from manifest bounds. They shall not allocate, log, await, lock, decode, fetch,
parse project JSON, or access persistence during `process()`.

### 8.5 Frame-count and fixed-block rules

Every processor shall derive the current render-frame count from the supplied
input or output arrays for each `process()` call. It shall never assume 128
frames.

A fixed-block algorithm may use a preallocated ring buffer whose capacity and
added latency are declared by the plugin manifest. The maximum capacity shall be
tested. Overflow shall produce bounded silence or a declared safe bypass plus a
fault. It shall not overwrite unread audio or allocate more memory.

### 8.6 Fault behavior

An unhandled processor exception makes the affected browser node unusable. When
the controller detects a processor fault, it shall use this sequence:

1. Silence and disconnect only the affected branch.
2. Close its port.
3. Create a new node.
4. Restore the last acknowledged state.
5. Reconnect with a click-safe transition.

If the same recovery attempt fails again, the controller shall use the declared
safe mode. It shall leave the plugin bypassed or silent and show an actionable
error.

Unrelated playback and all editing shall continue when the graph can remain
safe. No controller fault shall corrupt project state.

## 9. Audio and plugin lifecycle

Every runtime plugin instance shall move through these states:

```text
created -> preparing -> ready -> active <-> suspended -> disposing -> disposed
                         |          |
                         +------> faulted
```

Rules:

- `created` contains no connected graph and no open worklet port.
- `preparing` may load registered worklet modules, validate state, allocate
  bounded buffers, and attach decoded sample data.
- `ready` has a validated, silent graph that may be connected at a safe
  boundary.
- `active` may render and receive scheduled events.
- `suspended` retains bounded state but produces no new musical activity.
- `faulted` shall use the plugin's declared safe silence or dry bypass behavior.
- `disposing` shall stop scheduling, apply a bounded release or micro-fade,
  disconnect nodes, close ports, and release references. A receiver may confirm
  disposal re-entrantly inside the posting call. Thus, a controller shall
  capture the required node before posting. After posting, it shall read its
  state again instead of using a value narrowed before the call.
- `disposed` is terminal. Messages or graph use after disposal shall fail a
  test.

Graph replacement and reorder shall prepare the new branch before switching. The
engine shall use a bounded click-safe transition and shall not disconnect
unrelated branches. Tail-producing effects shall follow their declared
finite-tail policy. A removed tail shall never keep an unbounded graph alive.

Audio context states are separate from plugin states. Locked, suspended,
interrupted, or unavailable audio shall not block state commands, saving, import
validation, project export, or UI navigation.

## 10. Sample decoding

### 10.1 Owned abstraction

The engine shall expose a Pulsebox-owned `SampleDecoder` port. The production
implementation shall use bundled deterministic decoders for WAV, AIFF, and FLAC.
Supported import shall not depend on the formats accepted by
`decodeAudioData()`.

Decoding shall run in a dedicated worker or another non-audio-thread engine
adapter. It shall not run inside `AudioWorkletProcessor.process()` and shall not
block the UI thread for a whole file. Decoder code and data shall ship as static
build assets from the canonical origin. No remote service or runtime download is
allowed.

The decoder shall identify the container and codec from file signatures and
validated headers, not the extension or browser-provided MIME type. An extension
mismatch shall be reported but shall not override valid content. Truncated,
inconsistent, oversized, or unsupported content shall be rejected before project
state changes.

### 10.2 Required input surface

The bundled decoder set shall support:

- RIFF/WAVE PCM with 8-, 16-, 24-, or 32-bit integer samples.
- RIFF/WAVE IEEE 32- or 64-bit floating-point samples.
- WAVE extensible files whose subformat is one of those PCM or float forms.
- uncompressed AIFF PCM with 8-, 16-, 24-, or 32-bit integer samples.
- native FLAC streams with valid stream metadata and integer samples up to 24
  bits.

Mono and stereo shall be preserved. A file declaring zero channels or more than
two channels shall be rejected. Unsupported compressed WAVE or AIFC codecs shall
produce a specific unsupported-codec error, not a generic decode failure.

Before allocation, the decoder shall validate file size, chunk lengths, channel
count, sample rate, sample count, and the project asset budget defined in
`PROJECT-FORMAT.md`. Checked arithmetic shall prevent integer wrap and
allocation overflow. Decoder output shall be planar finite 32-bit float PCM with
the original sample rate and channel count.

Integer PCM shall map symmetrically by its signed full-scale divisor. Unsigned
8-bit PCM shall map around 128. Non-finite float input shall reject the file.
Finite float input outside `[-1, 1]` shall be preserved in prepared PCM and
controlled by the engine's existing safety stages. Import shall report the
out-of-range peak. Decoding shall not normalize.

### 10.3 Determinism and provenance

Decoder versions and licenses shall be pinned in the dependency lockfile and
recorded in the legal and dependency audit before shipping. The same valid bytes
and decoder version shall produce the same channel count, sample rate, frame
count, and canonical little-endian Float32 PCM bytes in Chrome.

Fixture tests shall include every required bit depth and container, mono and
stereo, odd-sized chunks, and metadata chunks. They shall also include maximum
legal values, truncated files, malformed lengths, unsupported codecs,
multichannel files, and decompression-limit attacks. Expected metadata and SHA-256 hashes of canonical
PCM output shall be repository-owned evidence.

Decoded buffers are engine cache data. They shall not be serialized. Original
asset bytes and their content IDs shall remain the persistence source so a cache
can be rebuilt deterministically.

## 11. Routing and Monitor audition

### 11.1 Program routing

The program path shall follow the routing in the
[mixer and effects specification](specs/spec-007-mixer-and-effects.md). The path
goes through voice processing, module sum, module inserts, channel processing,
fader, sends, and send returns. It then goes through the master chain, selected
monitor-only mono fold-down, and physical output.
Offline rack and return stems shall branch at their specified pre-master points.
Only the master export shall include the master chain.

Master-effects bypass shall switch around every user master effect as one
click-safe graph operation, then pass through master gain and the protected
limiter. It shall not change the limiter instance's detailed bypass state.

The header meters shall observe the post-master, post-monitor-mode signal through
a non-audible analysis branch. L/R mode displays channel magnitudes. M/S mode
derives `M = (L + R) / 2` and `S = (L - R) / 2` for analysis only. Switching
meter mode shall not reconnect, sum, or otherwise alter the audible path.

Mute and global solo shall gate both a channel's program path and its four sends
as specified. Graph changes shall alter gains or bounded switches and shall not
rebuild the whole mixer.

### 11.2 Exclusive PFL Monitor mode

Monitor shall be exclusive pre-fader listen for the physical live output. The
selected tap shall be after the module insert chain and before the channel
fader, channel pan, channel mute and solo gates, and send taps.

When Monitor is inactive:

```text
program mix -> master chain -> live monitor mode -> physical output
```

When Monitor is active:

```text
selected post-insert/pre-fader tap
  -> fixed -12 dB monitor safety gain
  -> protected limiter safety processing
  -> live monitor mode
  -> physical output
```

The normal master program shall continue rendering internally while Monitor is
active, but its output gain to the physical destination shall be zero. It shall
not be summed with the selected tap. Only the selected channel shall reach the
physical output. This prevents level doubling and makes single-channel audition
literal.

The protected limiter algorithm shall remain active on the Monitor path even
when the project's master-limiter instance is bypassed. This temporary safety
use shall not change the project bypass state. The Monitor path shall have a
ceiling no higher than -1 dBFS and shall add no user-adjustable project
parameter.

Only one non-empty channel may be selected. Selecting another channel replaces
the selection. A Monitor change shall use this 4-millisecond
fade-through-silence sequence:

1. Fade the old physical source to zero for 2 milliseconds.
2. Switch the source at zero.
3. Fade the new physical source up for 2 milliseconds.

Program and PFL sources shall never overlap during the transition.

Monitor selection shall ignore the selected channel's fader, channel pan, mute,
global solo gate, and send levels. It shall preserve any pan already created
inside the instrument or its inserts. Sends and the internally rendering program
mix shall remain unchanged.

Displayed master meters shall switch to the post-safety Monitor signal and shall
show an explicit `Monitor` mode label. Hidden internal program metering may
continue for engine diagnostics, but it shall not be presented as the audible
master level.

Monitor selection, transition state, safety gain, and monitor meters are
transient session state. They shall not enter commands, undo history,
automation, autosave, project files, recovery data, ordinary Save, portable
export, master WAV export, or stem export. Closing or reloading the page shall
clear Monitor.

Routing tests shall prove zero program contribution while Monitor is active and
zero PFL contribution while it is inactive. They shall also prove one selected
source, fixed safety gain, limiter enforcement, and meter-source switching.
The tests shall prove unchanged sends and export isolation.

## 12. Persistence boundary

The state layer shall define ports for project repositories, asset repositories,
recovery history, global preferences, and cross-tab revision notices. IndexedDB
and local storage shall be implementations of those ports, wired at the
composition boundary.

The project repository shall commit a validated project document,
asset-reference updates, and new revision metadata atomically according to
`PROJECT-FORMAT.md`. A failed transaction shall leave the previous committed
revision loadable. Engine caches and decoded buffers shall not participate in a
persistence transaction.

The repository receives project content plus the last committed
`ProjectRevision`. It shall not serialize the in-memory `StateRevision` used by
commands and engine projections. A successful transaction assigns the next
`ProjectRevision` to the stored head. Later in-memory edits continue with their
independent state-revision sequence.

The canonical origin in section 2 is part of persistence identity.
`PROJECT-FORMAT.md` owns quota requests, persistent-storage behavior, atomic
saves, and pack storage. It also owns archive validation, limits, recovery
pruning, and emergency portable export. Tests shall use the state-owned ports.

Last-writer-wins behavior shall compare complete committed revision tokens for
equality, not timestamps or numeric counters alone. Cross-tab notices may warn a
stale tab but shall not create a lock or conflict copy. Epoch rollover and
same-project-ID import resolution are owned by `PROJECT-FORMAT.md`.

## 13. Test seams

Browser globals shall be wrapped at the owning layer boundary. Tests shall be
able to inject:

- an `IdFactory`.
- a monotonic clock and audio-frame clock.
- a scheduler and lookahead driver.
- an engine graph factory.
- a worklet node and message-port harness.
- a sample decoder and decoder worker transport.
- project, asset, recovery, and preference repositories.
- a cross-tab revision channel.
- file import and export sinks.
- visibility, audio-unlock, and audio-context state signals.

The production composition root shall be the only place that selects browser
implementations. Unit tests shall not require a real DOM or audio device for
state and engine-pure logic. Browser and rendered-audio tests shall use the
production build for integration evidence.

Plugin contract tests shall run every registered manifest through one shared
suite. The suite shall verify IDs, defaults, ranges, smoothing, state migration,
serialization, lifecycle, and disposal. It shall also verify message bounds,
channel behavior, live/offline parity, and declared latency and tail rules.

Architecture tests shall fail on prohibited cross-layer imports, direct UI audio
access, state-held browser objects, and unregistered plugin branches. They shall
also fail on `ScriptProcessorNode`, main-thread custom DSP, MIDI code, a service
worker, a PWA manifest, or a product API endpoint. The current AST and artifact guard is
implemented in `tests/unit/architecture/source-policy.ts`. It also scans delivery
scripts so a static launcher cannot silently grow a product API. Publishing the
static build to GitHub Pages under `.github/workflows/` is permitted, because it
ships the same backend-free artifact rather than introducing a product server.

## 14. Objective audio verification

### 14.1 Required environment record

Every audio evidence run shall record:

- date and source revision.
- production build hash.
- browser name and exact version.
- operating system.
- live or offline context.
- requested and actual sample rate.
- exposed latency or buffer information where the browser provides it.
- fixture project and deterministic seed.
- active instruments, voices, effects, and routing.
- render length and comparison method.
- produced report and audio artifact hashes.

The release matrix shall use the then-current stable Chrome. The browser shall
run at 44.1 kHz and 48 kHz where the browser and device allow
the requested live rate. Unsupported live-rate selection shall be recorded and
covered with an offline context at that rate rather than reported as a pass.

### 14.2 Deterministic tiers and tolerances

The following gates shall apply:

<!-- markdownlint-disable MD013 MD060 -->

| Contract                     | Fixture and comparison                                                       | Pass limit                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Decoder determinism          | Canonical decoded Float32 PCM for every format fixture                       | Metadata and SHA-256 PCM hash exactly match on all three browsers                                                       |
| Custom DSP repeatability     | Two offline renders in the same browser, build, sample rate, state, and seed | Sample-for-sample maximum absolute error at or below `1e-6`; no non-finite samples                                      |
| Save and reload              | Offline render before Save and after reload in the same browser and build    | Identical event frames; null RMS at or below -120 dBFS and maximum absolute error at or below `1e-6`                    |
| Cross-browser custom DSP     | Same offline fixture and sample rate, aligned by expected latency            | Maximum absolute error at or below `1e-6`; no non-finite samples                                                        |
| Native-node adapter behavior | Analytic impulse, sweep, gain, latency, and tail fixtures                    | Latency within 1 frame; gain within 0.1 dB; response within 0.25 dB; declared tail endpoint within 10 ms                |
| Sample-rate pitch            | Identical musical fixture at 44.1 and 48 kHz                                 | Detected steady pitch differs by at most 1 cent                                                                         |
| Sample-rate timing           | Expected event frames converted to seconds at 44.1 and 48 kHz                | Every scheduled event differs by at most 1 ms after conversion to seconds                                               |
| Parameter smoothing          | Constant-input full-range sweep and worst-case discrete step fixtures        | Control trajectory error at or below `1e-6`; no output discontinuity above 0.02 full scale at an update boundary        |
| Sample boundaries            | Start, stop, offset, choke, loop, and very-short-sample fixtures             | Specified 2 ms and 4 ms ramps within 1 frame; no boundary jump above 0.01 full scale                                    |
| Export resampling            | Deterministic 48 kHz to 44.1 kHz impulse, sweep, and test-tone fixtures      | Passband error within 0.1 dB from 20 Hz through 20 kHz; aliased or imaged test-tone energy at or below -90 dBFS         |
| Monitor exclusivity          | Orthogonal deterministic signals on program and selected PFL paths           | Rejected path below -120 dBFS; selected path matches fixed gain and limiter tolerances; no source overlap during switch |

<!-- markdownlint-enable MD013 MD060 -->

An adapter whose documented algorithm cannot meet a generic native-node limit
shall define a stricter feature-specific measurement before implementation and
obtain a product decision. It shall not weaken a limit after seeing a failing
result.

### 14.3 Live browser evidence

Each supported browser shall also prove in the production build:

- audio remains locked until a valid gesture and editing still works while
  locked.
- the first-sound timer uses the exact start event defined in the
  [audio engine and transport specification](specs/spec-004-audio-engine-and-transport.md).
- play, pause, stop, tempo change, quantized launch, and pattern/song switching
  are audibly and visibly coherent.
- a compatible module or effect edit does not suspend the context or rebuild
  unrelated branches.
- Monitor changes the actual destination source and meter source as section 11
  requires.
- saving, reloading, theme changes, and compatible graph edits do not stop
  transport.
- a processor fault affects only its declared branch and produces the defined
  recovery state.

Automated rendered evidence is the release gate for numeric claims. A documented
listening pass may find artifacts that numeric fixtures missed, but a subjective
listening statement shall not replace a failed or absent measurement.

## 15. Failure and recovery rules

Failure shall remain local whenever safe:

- Invalid commands shall leave state and audio unchanged.
- Persistence failure shall retain the last committed revision and keep editing
  available while showing Save and portable-export recovery actions.
- Decoder failure shall retain the previous asset assignment and shall not
  consume the project asset budget.
- Unknown required plugin data shall reject import atomically.
- No plugin bypass, silence substitute, or placeholder shall be created to
  recover an incompatible project.
- Engine projection failure shall preserve project state and rebuild only the
  affected graph branch when possible.
- Protocol or processor failure shall follow sections 8.6 and 9.
- Audio unavailable shall disable audible operations without disabling editing,
  validation, Save, or project export.
- Canonical port conflict shall fail startup and name `127.0.0.1:4173`. It shall
  not move the user to a different origin.

Errors shall identify what failed, what data remains safe, and the next recovery
action. No recovery path shall require a destructive confirmation dialog.

## 16. Accepted and rejected alternatives

<!-- markdownlint-disable MD013 MD060 -->

| Decision            | Accepted                                                                    | Rejected                                                                         | Verification consequence                                                              |
| ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Domain shape        | Strict engine, state, and UI layers with a wiring-only composition boundary | UI-owned audio, state-held audio nodes, or one global application object         | Static import tests and injected-port unit tests are required                         |
| Runtime             | Static build at exact `http://127.0.0.1:4173` with strict port; the same static artifact may also be published to GitHub Pages | Variable ports, `localhost`, `file:`, or a product backend       | Persistence and browser evidence use the canonical origin; a port conflict must fail  |
| Plugin model        | Build-time registry with typed instrument/effect specializations            | Runtime executable plugins or one untyped plugin interface                       | Registry conformance and no-product-branch tests are required                         |
| Project edits       | Atomic typed commands with one history entry per gesture                    | Direct mutation or one history entry per pointer event                           | Command, coalescing, Undo, Redo, and cancellation suites are required                 |
| Worklet control     | Versioned, sequenced, acknowledged, bounded messages                        | Unversioned objects, unbounded posting, or direct UI ports                       | Protocol fuzzing, queue-limit, stale, duplicate, gap, and recovery tests are required |
| Bulk audio transfer | Bounded transferable buffers prepared outside `process()`                   | PCM in JSON messages or allocation during real-time processing                   | Transfer ownership, in-flight limit, and allocation checks are required               |
| Sample import       | Pulsebox-owned bundled WAV, AIFF, and FLAC decoders                         | Browser-format dependence through `decodeAudioData()` or a server decoder        | Cross-browser fixture hashes must match exactly                                       |
| Monitor             | Exclusive post-insert, pre-fader PFL to the physical output                 | Additive PFL mixed with the program                                              | Destination null tests must prove no doubling or rejected-path leakage                |
| Worklet transport   | `MessagePort` with explicit bounds                                          | `SharedArrayBuffer` as an MVP requirement                                        | No cross-origin-isolation dependency is allowed without a later contract change       |
| DSP placement       | AudioWorklet for custom DSP and engine adapters for suitable native nodes   | Main-thread custom DSP or `ScriptProcessorNode`                                  | Dependency, source, and production-browser audits are required                        |
| Persistence         | State-owned ports backed by browser storage                                 | Engine or UI access to storage, remote storage, or path-based durable references | Repository contract and canonical-origin integration tests are required               |

<!-- markdownlint-enable MD013 MD060 -->

## 17. Phase 0 exit gate

This document is complete as a contract when:

1. The indexed product specifications, `ARCHITECTURE.md`, `THEMING.md`, and
   `PROJECT-FORMAT.md` use the same terms and do not contradict each other.
2. The base manifest, instrument contract, effect contract, parameter
   descriptor, command model, and worklet protocol have independent architecture
   review.
3. The project-format contract owns the persistence and archive details
   referenced here.
4. The theme contract owns every user-theme token and validation rule.
5. Every future implementation phase has an objective test seam and evidence
   requirement.
6. Documentation distinguishes implemented Phase 1 work from planned later
   phases and cites current checks for implementation claims.

Phase 0 was the document gate. Its acceptance-blocking conflicts were resolved
before the Phase 1 product source tree was created.

## 18. Primary technical references

These references support browser-platform constraints. The normative Pulsebox
choices remain in this document:

- [Web Audio API 1.1](https://www.w3.org/TR/webaudio-1.1/) defines
  `decodeAudioData()`, the AudioWorklet processing model, processor faults, and
  the paired `MessagePort` objects.
- [HTML Standard: origins](https://html.spec.whatwg.org/dev/browsers.html#origins)
  defines tuple origins by scheme, host, and port.
