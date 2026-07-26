---
name: generate-mix
description: Hand-author a .mixjam mix from the sample corpus, after web research into the genre.
disable-model-invocation: true
argument-hint: "Genre and constraints, e.g. 'melodic techno, moody, ~4 minutes'."
---

# Generate Mix

Hand-author a complete `.mixjam` the way the reference projects in
`tmp/generated-songs/` were made: research the genre on the web, scout the
corpus, compose through a one-off build script, and prove the file by
round-trip. Run no repository generator (`scripts/generate-*`, the
`generator-*` engine) and change nothing outside `tmp/` — no app code, specs,
tests, or docs.

The invocation text is the commission: genre plus any BPM, length, mood, or
material constraints. When it is empty, pick a corpus-supported genre that
`tmp/generated-songs/` does not cover yet. When it asks to revise an existing
manual mix, edit that mix's build script under `tmp/` and redo steps 3–4.

## 1. Research the genre

Web-search the genre before touching samples. The deliverable is an
arrangement brief written to `tmp/<slug>/brief.md`:

- Tempo norm (must match a corpus pool, step 2) and typical track length.
- Section arc in 8-bar phrases (e.g. Intro → Groove → Breakdown → Drop → Peak
  → Outro) with bar counts and an energy curve.
- Signature elements: rhythm patterns (offbeat bass, shuffled hats, four-on-
  the-floor…), instrumentation per section, build and transition habits.
- Mix and FX conventions: what gets reverb vs delay, stereo treatment,
  what stays dry.

Complete only when every brief item is grounded in something read this run,
not prior knowledge alone.

## 2. Scout the corpus

`tmp/test-samples` holds ~25k WAVs as `Genre/Role/ROLE###_STYLE_BPM_KEY_PACK.wav`
(roles: Bass, Beats, Drum, FX, Keys, Loop, Sphere, Vocals, Voice, Xtra,
Guitar, Singleshots; `(L)`/`(R)` suffixes are stereo pairs; key `X` means
unkeyed). Major BPM/key pools: 140/A, 125/A, 160/C, 132/A, 104/A, 90/C.

- Pick one pool for all tempo-stretched pitched material. Natural-rate
  placements (`nativeBPM: null`, true pitch, non-rhythmic or one-shot) are
  exempt and may come from any pool.
- Write a scout script in `tmp/<slug>/` after the pattern of
  `tmp/agent-manual-trance/scout-new-corpus.ts`: list candidates per role,
  decode each with `decodeWav`, and verify duration against the stated BPM's
  whole-bar grid before trusting a file.
- Cover every role the brief calls for, including riser/impact FX and at
  least one stereo pair. Target 24–40 distinct samples, ~2 per lane.

## 3. Compose

Write a one-off build script `tmp/<slug>/build-<slug>.ts` and run it with
`npx tsx`. It must live under `tmp/`, not the scratchpad — cross-drive
relative imports into `src/` fail. Start from
`tmp/agent-manual-trance/build-trance2.ts` and reuse the repo's plumbing
rather than reimplementing it: `placeSampleOnLane` and
`placementDurationTicks` (`src/renderer/src/lib/arrangement.ts`),
`sourceGroupFromRelpath` and `sourceGroupSlot`
(`src/shared/sample-palette.ts`), `TICKS_PER_BAR` and
`tickDurationSeconds` (`engine/transport.ts`), `serializeProject` and
`parseProject` (`project/project-file.ts`), the `createDefault*` factories
(`project/project-state.ts`), and the return-effect factories
(`engine/return-effects.ts`).

Format v7 traps: all placements of one sampleRef share `durationTicks`;
placement ids unique; sampleRefs forward-slash relative; exactly 4 fx buses
with fixed ids `fx-1`…`fx-4`; 1–64 lanes; no extra fields (`assertKeys`
rejects them); omit `generator` metadata on manual builds.

Playback model: the engine resamples each clip so its audio fills
`durationTicks` at project BPM — set `nativeBPM` to the song BPM for
bar-locked loops (playback rate 1, no artifacts) and `null` for true-pitch
one-shots. Lanes are monophonic: a new trigger cuts the previous voice, which
is what makes accelerating one-shot rolls work.

Arrangement craft, proven on the reference projects — apply what the brief
supports and let the research drive genre-specific choices:

- Sections on 8-bar phrases; song length a multiple of 8 bars, 96–160 bars.
- End-align risers so they finish exactly on the boundary
  (`bar * TICKS_PER_BAR - durationTicks`); follow big arrivals with a
  down-sweep starting on the boundary.
- Tail clearance is arithmetic: place odd-length pads so start + duration
  lands on a structural line.
- Sibling swaps at the peak: harder same-family numbered variants raise
  intensity without breaking lane identity.
- One bass at a time; hand the low end off between sections.
- Build by subtraction plus acceleration: drums and bass out for the last 2
  bars before a boundary while one-shot rolls accelerate (4 → 8 → 16
  hits/bar) into it.
- Breakdown = pads + lead + sparse vocal; the emotional statement lives
  there, not in the drop. Vocal hooks land on phrase lines, never mid-phrase.
- Gain hierarchy: kick ~0.78, bass ~0.66, lead/voice ~0.5, hats/stabs ~0.42,
  pads ~0.36, spheres ~0.32. Pans: mirrored pairs ±0.5–0.65, everything else
  within ±0.35, at least 6 distinct values.
- FX returns: exactly two modules — Aetherform reverb + Echoform delay — with
  genre-matched settings from the brief (trance: ~4.5 s hall + ducked
  dotted-eighth ping-pong; techno: small room + 1/4 tape echo; house: plate +
  1/8 slap). Sends on most lanes; kick and bass stay dry.

## 4. Validate and report

1. Round-trip the serialized text through `parseProject` inside the build
   script before writing — it enforces the whole schema.
2. Write to `tmp/generated-songs/Agent-Manual-<Genre>-<BPM>-<NNN>.mixjam`
   (next free NNN) and verify the file exists.
3. Have the build script measure and print the envelope self-check
   (targets measured on the reference library):

   | Measure | Target |
   | --- | --- |
   | Bars | multiple of 8, 96–160 |
   | Populated lanes | 12–18 |
   | Distinct samples | 24–40, median ~2 per lane |
   | Mean lane occupancy | 30–55%; no lane >90%; ≥30% of lanes <50% |
   | Entries per lane (mean) | 3–8 |
   | Quiet stretch | ≥8 contiguous bars at ≤35% of peak density |
   | Peak stretch | ≥8 contiguous bars at ≥85% of peak density |
   | Sends | non-zero on ≥70% of lanes; exactly 2 return modules |
   | Pan | ≥6 distinct values; ≤±0.35 non-pair, ≤±0.65 pairs |
   | Song end | last placement ends exactly at the final tick |

4. Report the file path, BPM, bars, duration, section arc, the pool used, and
   the envelope table with each measure's actual value. A missed target is
   not a failure — explain any deliberate deviation instead of hiding it.

Complete only when the file round-trips, exists on disk, and every envelope
row is reported with a measured value.
