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
2. **AC-002.** It uses native DOM and Web Components.
3. **AC-003.** It contains no UI framework or virtual DOM.
4. **AC-004.** Its 1536 × 1024 composition follows the approved rack, mixer, FX, and editor
   hierarchy.
5. **AC-005.** It remains usable without overlap at 1280 × 720 and at larger supported
   sizes; below either minimum dimension, the approved notice and limited Save,
   portable Export, autosave, and read-only summary behavior works.
6. **AC-006.** Naming and capitalization rules pass the production audit, with `/research`
   as the only historical-name exception.
7. **AC-007.** All six instruments exist.
8. **AC-008.** Eight rack slots work and no ninth instrument can be added in the MVP.
9. **AC-009.** Duplicate instruments work.
10. **AC-010.** Add, select, collapse, expand, swap, duplicate, remove, and reorder work.
11. **AC-011.** Compact step editing works.
12. **AC-012.** Piano-roll note creation, movement, resizing, deletion, velocity, selection,
    and quantization work.
13. **AC-013.** Drum-grid painting, velocity, probability, micro-timing, flam, roll, voice
    length, and resolution work.
14. **AC-014.** Computer-keyboard live input and recording work through physical key
    positions.
15. **AC-015.** Pattern generation and transforms work.
16. **AC-016.** Every module has at least 32 flat-numbered patterns.
17. **AC-017.** Quantized pattern switching works.
18. **AC-018.** The mixer exposes exactly eight visible instrument channels plus one master
    channel; empty channels are disabled and labeled `Empty`.
19. **AC-019.** No mixer banking, channels 9–16, or horizontal mixer scrolling exists in the
    MVP.
20. **AC-020.** Mute, solo, fader, pan, four module-level sends, and exclusive
    single-channel pre-fader Monitor audition affect audio as specified. Monitor
    never doubles the selected channel, and displayed master meters follow the
    physical monitor signal while it is active.
21. **AC-021.** Voice level, tune, decay, pan, blend, mute, solo, and voice inserts affect
    audio; voice-level sends do not exist.
22. **AC-022.** Voice inserts work.
23. **AC-023.** Module pedalboards work.
24. **AC-024.** Four modular send chains work; each compact card uses a pinned focus effect
    and that plugin's four declared compact controls.
25. **AC-025.** The master chain works.
26. **AC-026.** All listed effects process audio.
27. **AC-027.** A–D defaults match the approved compact effect design and use circular
    return Mix controls.
28. **AC-028.** The reverb shimmer feature works.
29. **AC-029.** The full Song timeline works.
30. **AC-030.** Sections, clips, scenes, and step automation work.
31. **AC-031.** Pattern and Song transport modes switch without stopping.
32. **AC-032.** Deliberate parameter moves record while transport Record is armed, use the
    dedicated 1/16 automation grid by default, write to the active pattern or
    Song arrangement by mode, and apply the last-value-wins hold rule.
33. **AC-033.** Undo and redo cover every retained committed edit; destructive actions use
    no confirmation dialogs, and a new valid action evicts oldest history rather
    than failing because the active-history budget is full.
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
39. **AC-039.** Theme switching does not interrupt audio or shift layout; theme and contrast
    persist globally and never travel in project files.
40. **AC-040.** All five themes and high-contrast mode pass the numeric accessibility checks
    in section 24.1 at every supported viewport.
41. **AC-041.** User theme import enforces the complete bounded allowlist and safe value
    grammar in `THEMING.md`, ignores unknown tokens with a report, applies
    atomically, and rejects raw CSS and unsafe values.
42. **AC-042.** The application is operable by keyboard.
43. **AC-043.** No MIDI code exists.
44. **AC-044.** No main-thread custom DSP exists.
45. **AC-045.** No `ScriptProcessorNode` exists.
46. **AC-046.** Custom synthesis and custom DSP use AudioWorklet; native nodes remain behind
    engine adapters.
47. **AC-047.** AudioWorklet plugins process the host-supplied frame count without assuming
    128 frames; any fixed-block buffering is bounded and documented.
48. **AC-048.** 44.1 kHz and 48 kHz live playback meets the 1-millisecond event-time and
    1-cent pitch tolerances in section 24.4.
49. **AC-049.** Parameter sweeps meet their declared smoothing trajectories and the
    constant-input discontinuity threshold in section 24.4.
50. **AC-050.** Sample boundaries use the approved micro-fades.
51. **AC-051.** User sample import uses the bundled deterministic WAV, AIFF, and FLAC
    decoders; preserves mono or stereo; rejects multichannel files; enforces 32
    MiB per source, 512 MiB stored assets per project, and every decoded frame
    and expansion limit in `PROJECT-FORMAT.md`; and supports assignment, reuse,
    validation, and removal.
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
54. **AC-054.** An imported project exceeding eight rack slots is rejected in full and
    reports every over-cap slot.
55. **AC-055.** Type checking passes.
56. **AC-056.** Unit, component, end-to-end, and visual tests pass in the current stable
    Chrome, Edge, and Firefox release channels. Exact versions are recorded, and
    any physical-audio-only claim has a passing manual procedure in all three
    browsers.
57. **AC-057.** The production build completes without unresolved imports, framework
    dependencies, a service worker, or PWA packaging.
58. **AC-058.** The legal audit permits named historical sources only under non-shipping
    `/research` and verifies that shipped factory voice lists, ranges, curves,
    defaults, sound targets, layouts, assets, and public text remain original
    and free of prohibited names.
59. **AC-059.** No visible control is fake or decorative.
60. **AC-060.** Final documentation is complete.
61. **AC-061.** Final self-critique fixes all acceptance-blocking gaps.
62. **AC-062.** Mixer strips use a fixed structure with swappable processing modules and
    insert chains.
63. **AC-063.** On a warm cache, audible playback begins within three seconds in every run
    of the five-run, per-browser procedure in section 21.8.
64. **AC-064.** Workspace, Performance, Sequencer, Piano roll, Rack, Edit, and Song
    navigation follow the approved hierarchy defined in section 8.6.
65. **AC-065.** The Pattern inspector defaults to pattern `1`, and studio tabs work.
66. **AC-066.** Nonessential visual animation pauses when hidden.
67. **AC-067.** CSS token, spacing, radius, scrollbar, and supported-viewport rules are
    followed.
68. **AC-068.** The visible mixer supports slim and single-expanded strip states.
69. **AC-069.** The piano-roll toolbar and four-bar default timeline work.
70. **AC-070.** Step automation contains no line or curve segments.
71. **AC-071.** The engine, state, and UI remain slot-count agnostic for the explicit
    sixteen-slot post-MVP target without enabling more than eight slots in the
    MVP.
72. **AC-072.** The compact pattern strip handles lengths above sixteen steps through
    sixteen-step pages, playback follow, a page indicator, and viewed-page
    locking.
73. **AC-073.** Pause preserves position; Stop returns to the last explicit start marker,
    with the defined Pattern and Song defaults and no second-stop behavior.
74. **AC-074.** The compact send-chain `Mix` control changes return level from silence to
    unity without adding a dry copy or replacing per-effect wet/dry controls.
75. **AC-075.** Channel mute silences main and sends; global solo passes only soloed
    channels and their sends; shared returns contain only surviving soloed
    sources.
76. **AC-076.** Mono folds down live monitoring after the master chain, changes the
    displayed meters, and does not affect WAV or stem export.
77. **AC-077.** At least four of five unfamiliar participants start the supplied loop
    without assistance within one minute under the procedure in section 24.4.
78. **AC-078.** Development and built-product launch use `http://127.0.0.1:4173`; a busy
    port fails visibly instead of selecting a different origin.
79. **AC-079.** Time signatures are validated structural Song events at bar boundaries, are
    editable through undoable commands, and are never written by parameter
    automation recording.
80. **AC-080.** Rack-module collapse persists only as a local UI preference keyed by
    project, project lineage, and module, does not travel in `.pulsebox` files,
    creates no undo entry, and never leaks across whole-project replacement
    lineages.
81. **AC-081.** Every referenced plugin is required and known at a compatible version;
    missing pack references use the degraded, reference-preserving recovery
    behavior in `PROJECT-FORMAT.md`.
82. **AC-082.** A same-project-ID import makes no change until the user chooses Open
    existing, Import as copy, or Replace existing; every path follows the exact
    remapping, recovery, validation, and rollback contract.
83. **AC-083.** Project revision tokens advance atomically and roll from the maximum safe
    counter to counter zero under a new epoch without changing the project ID.
84. **AC-084.** Active Undo and Redo enforce the 100-entry, 64 MiB combined budget, 17 MiB
    per-entry limit, encoding-envelope limit, oldest-first eviction, Redo
    clearing, and blob-pin release, including a maximum-before/maximum-after
    fixture.
85. **AC-085.** Time-signature imports and edits enforce the tick-zero anchor, unique ticks,
    exact preceding-signature bar-boundary calculation, and atomic downstream
    revalidation.

