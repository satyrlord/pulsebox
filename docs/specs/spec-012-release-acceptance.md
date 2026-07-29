# Pulsebox Release Acceptance Specification

**Status:** Approved normative release gate  
**Spec ID:** `spec-012`  
**Read with:** [Specification index](spec-000-index.md) and all build-order
specifications.  
**Owns:** The complete MVP release gate. The index assigns each criterion one
primary product owner.

---

## 26. Acceptance criteria

The merged MVP is complete only when:

1. **AC-001.** It is a real strict-TypeScript application.
2. **AC-002.** Its UI layer uses one component model consistently across the
   shell, rack, mixer, effects, and editors.
3. **AC-003.** Its dependency tree contains no unused or undeclared runtime
   dependency.
4. **AC-004.** Its 1536 × 1024 composition follows
   `docs/design/claude-mock-up.html`. The rack remains dominant. The compact
   right studio column provides mutually exclusive Mixer, Effects, and Master
   views. It has no duplicate effects region.
5. **AC-005.** It remains usable without overlap at 1280 × 720 and at larger supported
   sizes. Below either minimum dimension, the approved notice appears. The
   limited Save, portable Export, autosave, and read-only summary behavior works.
6. **AC-006.** Naming and capitalization rules pass the production audit, with `/research`
   as the only historical-name exception.
7. **AC-007.** All six instruments exist.
8. **AC-008.** Eight rack slots work. The user cannot add a ninth instrument in
   the MVP.
9. **AC-009.** Duplicate instruments work.
10. **AC-010.** Add, select, collapse, expand, swap, duplicate, remove, and
    reorder work. Empty-slot plus controls are the only visible rack Add action.
    `Delete module` is in the loaded module context menu. It works by right-click
    and the standard keyboard context-menu gesture. No persistent Add or minus
    buttons exist below the slot list.
11. **AC-011.** The Piano Roll is the only surface that edits Pattern event
    data. No rack faceplate contains a step grid, any per-step editing, or a
    Pattern activity indicator. The faceplate
    audition control sounds the module while held by pointer or keyboard. It
    stops on release or after lost focus or capture. It respects mute, solo, and
    routing. It writes no Pattern event, project state, or Undo entry.
12. **AC-012.** Piano-roll note creation, movement, resizing, deletion, velocity, selection,
    and quantization work.
13. **AC-013.** Drum-grid painting, velocity, probability, micro-timing, flam, roll, voice
    length, and resolution work.
14. **AC-014.** Computer-keyboard live input and recording work through physical key
    positions.
15. **AC-015.** Pattern generation and transforms work.
16. **AC-016.** A project supports 1 through 32 stable named Patterns. Each
    Pattern contains compatible per-module parts. The UI identifies it by its
    name, never a compound number such as `1 - 1`.
17. **AC-017.** Quantized pattern switching works.
18. **AC-018.** The mixer exposes exactly eight visible instrument channels plus
    one master channel. The mixer disables empty channels. Their two-digit slot
    numbers identify them visually. They expose their Empty state accessibly.
19. **AC-019.** No mixer banking, channels 9–16, or horizontal mixer scrolling exists in the
    MVP.
20. **AC-020.** Mute, solo, fader, pan, the visible 2 × 2 A–D module-send grid,
    and exclusive single-channel pre-fader Monitor audition affect audio as
    specified. Monitor never doubles the selected channel, and displayed master
    meters follow the physical monitor signal while it is active.
21. **AC-021.** Voice level, tune, decay, pan, blend, mute, solo, and voice inserts affect
    audio. Voice-level sends do not exist.
22. **AC-022.** Voice inserts work.
23. **AC-023.** Module pedalboards work.
24. **AC-024.** Four modular send chains work. Each compact card uses a pinned
    focus effect and that plugin's four declared compact controls.
25. **AC-025.** The master chain works.
26. **AC-026.** All listed effects process audio.
27. **AC-027.** A–D defaults match the approved compact effect design and use circular
    return Mix controls.
28. **AC-028.** The reverb shimmer feature works.
29. **AC-029.** The ordered named-Pattern Playlist supports add, choose, reorder,
    repeat, duplicate, delete, Undo, and Redo without a separate full timeline.
30. **AC-030.** Pattern mode loops the selected named Pattern and Song mode plays
    Playlist rows and repeats in order. Section and Scene do not exist as
    separate entities.
31. **AC-031.** Pattern and Song transport modes switch without stopping.
32. **AC-032.** Deliberate parameter moves record into the active Pattern while
    transport Record is on in either transport mode. They use the fixed 1/16
    automation grid and apply the last-value-wins hold rule.
33. **AC-033.** Undo and redo cover every retained committed edit. Destructive actions use
    no confirmation dialogs. A new valid action evicts the oldest Undo entries. It
    does not fail because the active-history budget is full.
34. **AC-034.** Autosave, recovery, explicit Save, import, export, and migrations are
    atomic. Quota failure preserves the last committed project, leaves the
    editor dirty, reports recovery actions, and keeps portable Export available.
35. **AC-035.** Multiple tabs follow last-writer-wins behavior.
36. **AC-036.** Master WAV export is unnormalized 16-bit, 44.1 kHz PCM with deterministic
    TPDF dither and high-quality deterministic resampling.
37. **AC-037.** Stem export produces post-module-insert, post-fader rack stems and separate
    send-return stems before the master chain, plus a master mix that includes
    the master chain.
38. **AC-038.** Projects reload and sound the same within the deterministic manifest,
    schedule, and rendered-sample limits in section 24.4.
39. **AC-039.** Theme switching from Settings does not interrupt audio or shift
    layout. Theme and contrast persist globally. They never travel in project
    files and have no selector in the application header.
40. **AC-040.** The `rack` theme and high-contrast mode pass the numeric accessibility
    checks in section 24.1 at every supported viewport.
41. **AC-041.** User theme import enforces the complete bounded allowlist and safe value
    grammar in `THEMING.md`. It ignores unknown tokens with a report. It applies
    atomically and rejects raw CSS and unsafe values.
42. **AC-042.** The application is operable by keyboard.
43. **AC-043.** No MIDI code exists.
44. **AC-044.** No main-thread custom DSP exists.
45. **AC-045.** No `ScriptProcessorNode` exists.
46. **AC-046.** Custom synthesis and custom DSP use AudioWorklet. Native nodes
    remain behind engine adapters.
47. **AC-047.** AudioWorklet plugins process the host-supplied frame count without
    assuming 128 frames. All fixed-block buffering has documented bounds.
48. **AC-048.** 44.1 kHz and 48 kHz live playback meets the 1-millisecond event-time and
    1-cent pitch tolerances in section 24.4.
49. **AC-049.** Parameter sweeps meet their declared smoothing trajectories and the
    constant-input discontinuity threshold in section 24.4.
50. **AC-050.** Sample boundaries use the approved micro-fades.
51. **AC-051.** User sample import uses the bundled deterministic WAV, AIFF, and FLAC
    decoders. It preserves mono or stereo and rejects multichannel files. It
    enforces 32 MiB per source and 512 MiB of stored assets per project. It also
    enforces each decoded-frame and expansion limit in `PROJECT-FORMAT.md`. It
    supports assignment, reuse, validation, and removal.
52. **AC-052.** Ordinary Save preserves each asset's embedded or recognized-pack-reference
    mode. Pack references meet the install, identity, integrity, version,
    missing-pack, and removal contract in `PROJECT-FORMAT.md`. Portable Export
    offers embedding for eligible pack references, while loose imports are
    embedded.
53. **AC-053.** Portable `.pulsebox` export produces a ZIP-compatible archive with root
    `manifest.json` and assets under `assets/`. Import rejects every unsafe
    path, link, collision, duplicate, excessive expansion, excessive record
    count, and incompatible referenced plugin defined in `PROJECT-FORMAT.md`
    before state changes.
54. **AC-054.** Import rejects a full project that exceeds eight rack slots. The
    report identifies each over-cap slot.
55. **AC-055.** Type checking passes.
56. **AC-056.** Unit, component, end-to-end, and visual tests pass in the current stable
    Chrome release channel. The evidence records the exact version. Each
    physical-audio-only claim has a passing manual procedure.
57. **AC-057.** The production build completes without unresolved imports, a
    service worker, or PWA packaging.
58. **AC-058.** The legal audit permits named historical sources only under non-shipping
    `/research`. It verifies that shipped factory voice lists, ranges, curves,
    and defaults remain original. It applies the same check to sound targets,
    layouts, assets, and public text. These items contain no prohibited names.
59. **AC-059.** No visible control is fake or decorative.
60. **AC-060.** Final documentation is complete.
61. **AC-061.** Final self-critique fixes all acceptance-blocking gaps.
62. **AC-062.** Mixer strips use a fixed structure with swappable processing modules and
    insert chains.
63. **AC-063.** On a warm cache, audible playback begins within three seconds in every run
    of the five-run, per-browser procedure in section 21.8.
64. **AC-064.** The compact Pattern/Song toggle sits left of transport and
    changes transport scope without stopping. The bottom bar's single editor
    toggle collapses and restores the complete lower workspace without changing
    project or playback state. Workspace, Performance, Sequencer, Rack, Edit,
    and full Song-timeline navigation do not exist in the MVP.
65. **AC-065.** The Pattern inspector has no Pattern/Song subtabs and defaults to
    `Verse` in the supplied project. Studio tabs work. Only the selected Mixer,
    Effects, or Master studio pane is visible and interactive. Only that pane is
    exposed to assistive technology.
66. **AC-066.** Nonessential visual animation pauses when hidden.
67. **AC-067.** CSS token, spacing, radius, scrollbar, and supported-viewport rules are
    followed. The semantic composition follows the approved composition target's
    major row and column geometry. It also follows its density, materials, typography scale, and
    control sizing. Semantic controls do not become raster artwork.
68. **AC-068.** The visible mixer uses fixed compact strips. Every instrument
    strip keeps its A–D sends visible as a 2 × 2 button grid. Channel selection
    or detail editing does not resize the mixer. Empty strips remain
    visible under their two-digit slot numbers, and the master strip carries no
    A–D send or return grid.
69. **AC-069.** One module-aware Piano Roll switches between monophonic pitched
    rows and named drum-voice rows. Its header has no local Play, pen, or erase
    buttons. Monophonic notes create, delete, move, resize, and slide without
    overlapping sounding notes. Drum triggers add or paint as fixed one-cell
    events, delete by right-click or keyboard, allow simultaneous voices, and do
    not resize. Pattern playback uses global Play.
70. **AC-070.** Step automation contains no line or curve segments.
71. **AC-071.** The engine, state, and UI remain slot-count agnostic for the explicit
    sixteen-slot post-MVP target without enabling more than eight slots in the
    MVP.
72. **AC-072.** The Piano Roll handles part lengths above sixteen steps through
    sixteen-step pages, playback follow, a page indicator, and viewed-page
    locking.
73. **AC-073.** Pause preserves position. Stop returns to the last explicit start marker,
    with the defined Pattern and Song defaults and no second-stop behavior.
74. **AC-074.** The compact send-chain `Mix` control changes return level from silence to
    unity without adding a dry copy or replacing per-effect wet/dry controls.
75. **AC-075.** Channel mute silences main and sends. Global solo passes only soloed
    channels and their sends. Shared returns contain only surviving soloed
    sources.
76. **AC-076.** The header always shows two master meters and one L/R or M/S
    analysis toggle. The toggle changes no audio, project state, automation,
    Undo, or export. Mono remains a separate transient control in the Master
    studio view. It folds down live monitoring after the master chain. It does
    not affect WAV or stem export.
77. **AC-077.** At least four of five unfamiliar participants start the supplied loop
    without assistance within one minute under the procedure in section 24.4.
78. **AC-078.** Development and built-product launch use
    `http://127.0.0.1:4173`. A busy port fails visibly instead of selecting a
    different origin.
79. **AC-079.** The Piano Roll header shows a horizontal Swing slider bound to the
    one global project Swing value. It also shows a Pattern-owned horizontal
    Humanize slider and a Parameter selector. The selector defaults to Velocity
    in place of `Vel 100`. It is the only control that chooses an edited lane.
    It is scoped to the selected module.

    The selector offers the selected module's supported note properties and
    manifest-declared automatable parameters. It changes scope after a module
    change. It marks entries that hold data in the active Pattern. Exactly one
    lane is visible at a time.

    Selecting a parameter without a lane creates no project data or undo entry.
    The first committed edit creates the lane as one undoable command. Erasing
    every step removes the lane record. A mixer, send, effect, or master parameter
    reaches this lane only through `Automate` on its own control.

    The MVP uses fixed 1/16 timing and fixed 100% quantize strength. It has an
    Alt-drag temporary snap override. It has no Straight, grid, triplet, or
    persistent snap-off control.
80. **AC-080.** Rack-module collapse persists only as a local UI preference keyed by
    project, project lineage, and module. It does not travel in `.pulsebox`
    files or create an undo entry. It never leaks across whole-project
    replacement lineages.
81. **AC-081.** Each referenced plugin is required and known at a compatible
    version. Missing pack references use the degraded,
    reference-preserving recovery behavior in `PROJECT-FORMAT.md`.
82. **AC-082.** A same-project-ID import makes no change until the user chooses Open
    existing, Import as copy, or Replace existing. Each path follows the exact
    remapping, recovery, validation, and rollback contract.
83. **AC-083.** Project revision tokens advance atomically and roll from the maximum safe
    counter to counter zero under a new epoch without changing the project ID.
84. **AC-084.** Active Undo and Redo enforce the 100-entry, 64 MiB combined budget, 17 MiB
    per-entry limit, and encoding-envelope limit. They enforce oldest-first
    eviction, Redo clearing, and blob-pin release. The checks include a
    maximum-before/maximum-after fixture.
85. **AC-085.** Master-effects bypass is project-owned, undoable, playback-safe,
    and bypasses user master effects while leaving master gain and the protected
    limiter active. The limiter keeps its own detailed bypass.
86. **AC-086.** Piano Roll ghost notes and ghost lane content are output-only:
    they are not focusable. Marquee and select-all never return them. An edit,
    generator, or transform for the active module never moves, deletes, or
    transforms them. In each supplied theme, they have color and a non-color
    cue. Ghost display persists only as a local view preference. It creates no
    undo entry and does not travel in `.pulsebox` files.
