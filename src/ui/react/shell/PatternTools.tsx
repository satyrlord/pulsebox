import { useEffect, useRef, useState } from "react";

import { createNoteEventId, type NoteEventId } from "../../../contracts";
import {
  doubleTimePatternEvents,
  generateEuclideanTriggers,
  halfTimePatternEvents,
  humanizePatternEvents,
  invertPatternEvents,
  legatoPatternEvents,
  randomizePatternEvents,
  reversePatternEvents,
  shiftPatternEvents,
  stretchPatternEvents,
  transposePatternEvents,
  varyPatternEvents,
  type PatternEvent,
  type PatternPartState,
} from "../../../state/public";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Shell.module.css";

type PatternTool =
  | "euclidean"
  | "randomize"
  | "humanize"
  | "variation"
  | "reverse"
  | "invert"
  | "transpose"
  | "double"
  | "half"
  | "shift"
  | "legato"
  | "stretch";

const TOOL_LABELS: Readonly<Record<PatternTool, string>> = {
  euclidean: "Euclidean rhythm",
  randomize: "Randomize",
  humanize: "Humanize timing and velocity",
  variation: "Pattern variation",
  reverse: "Reverse",
  invert: "Invert",
  transpose: "Transpose",
  double: "Double time",
  half: "Half time",
  shift: "Shift",
  legato: "Legato",
  stretch: "Stretch to length",
};

/**
 * Keeps generated event data out of project state until Apply. Preview sends
 * the complete transformed part through the temporary audio-preview path.
 */
export function PatternTools() {
  const { audio, auditionNoteFor, idFactory, manifestFor } = useDependencies();
  const project = useAppStore((state) => state.project.project);
  const patterns = useAppStore((state) => state.project.project.patterns);
  const activePatternId = useAppStore((state) => state.project.project.activePatternId);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const modules = useAppStore((state) => state.project.project.modules);
  const replacePatternPartEvents = useAppStore((state) => state.replacePatternPartEvents);
  const [tool, setTool] = useState<PatternTool>("randomize");
  const [amount, setAmount] = useState(50);
  const [pulses, setPulses] = useState(4);
  const [steps, setSteps] = useState(1);
  const [euclideanVoiceId, setEuclideanVoiceId] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<
    | {
        readonly patternId: typeof activePatternId;
        readonly moduleId: NonNullable<typeof selectedModuleId>;
        readonly part: PatternPartState;
        readonly sourceEvents: readonly PatternEvent[];
        readonly tool: PatternTool;
        readonly amount: number;
        readonly pulses: number;
        readonly steps: number;
        readonly voiceId: string | undefined;
        readonly tempo: number;
        readonly swing: number;
        readonly humanize: number;
        readonly seed: number;
      }
    | undefined
  >(undefined);
  const previewRef = useRef<typeof preview>(undefined);

  const pattern = patterns.find((candidate) => candidate.id === activePatternId);
  const part =
    pattern === undefined || selectedModuleId === undefined
      ? undefined
      : pattern.parts[selectedModuleId];
  const module = selectedModuleId === undefined ? undefined : modules[selectedModuleId];
  const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
  const euclideanVoices = manifest?.kind === "instrument" ? manifest.voices : [];
  const selectedEuclideanVoice =
    euclideanVoices.find((voice) => voice.id === euclideanVoiceId) ?? euclideanVoices[0];
  const canGenerateEuclidean = selectedEuclideanVoice !== undefined;
  const euclideanPulseMaximum = Math.max(1, part?.length ?? 16);
  const displayedPulses = Math.min(pulses, euclideanPulseMaximum);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(
    () => () => {
      const current = previewRef.current;
      if (current !== undefined) audio.stopAudition(current.moduleId);
    },
    [audio],
  );

  useEffect(() => {
    const current = previewRef.current;
    if (
      current !== undefined &&
      (current.patternId !== activePatternId ||
        current.moduleId !== selectedModuleId ||
        current.sourceEvents !== part?.events ||
        current.part.length !== part.length ||
        pattern === undefined ||
        current.tempo !== project.tempo ||
        current.swing !== project.swing ||
        current.humanize !== pattern.humanize ||
        current.seed !== pattern.seed)
    ) {
      audio.stopAudition(current.moduleId);
      previewRef.current = undefined;
      setPreview(undefined);
    }
  }, [
    activePatternId,
    audio,
    part?.events,
    part?.length,
    pattern,
    project.swing,
    project.tempo,
    selectedModuleId,
  ]);

  const cancelPreview = () => {
    const current = previewRef.current ?? preview;
    if (current !== undefined) audio.stopAudition(current.moduleId);
    previewRef.current = undefined;
    setPreview(undefined);
  };

  const makePreview = () => {
    if (
      pattern === undefined ||
      part === undefined ||
      module === undefined ||
      selectedModuleId === undefined ||
      (tool === "euclidean" && !canGenerateEuclidean)
    ) {
      return;
    }
    const random = seededRandom(pattern.seed);
    const source = part.events;
    cancelPreview();
    const strength = amount / 100;
    const targetLength = clampInteger(tool === "stretch" ? steps : part.length, 1, 64);
    const voiceId = selectedEuclideanVoice?.id;
    const euclideanNote =
      tool === "euclidean" && voiceId !== undefined
        ? auditionNoteFor(module.pluginId, voiceId)
        : undefined;
    const pulseCount = clampInteger(displayedPulses, 0, part.length);
    const events = transformEvents(
      tool,
      source,
      part.length,
      targetLength,
      strength,
      steps,
      pulseCount,
      euclideanNote,
      random,
      () => createNoteEventId(idFactory),
    );
    const previewPart: PatternPartState = { ...part, events, length: targetLength };
    const nextPreview = {
      patternId: pattern.id,
      moduleId: selectedModuleId,
      part: previewPart,
      sourceEvents: source,
      tool,
      amount,
      pulses: pulseCount,
      steps,
      voiceId,
      tempo: project.tempo,
      swing: project.swing,
      humanize: pattern.humanize,
      seed: pattern.seed,
    };
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    void audio
      .previewPatternPart?.(selectedModuleId, previewPart, {
        tempo: project.tempo,
        swing: project.swing,
        humanize: pattern.humanize,
        seed: pattern.seed,
      })
      .catch(() => {
        if (previewRef.current === nextPreview) cancelPreview();
      });
  };

  const apply = () => {
    if (
      preview?.patternId !== activePatternId ||
      preview.moduleId !== selectedModuleId ||
      preview.sourceEvents !== part?.events
    ) {
      return;
    }
    audio.stopAudition(preview.moduleId);
    replacePatternPartEvents(
      preview.moduleId,
      preview.patternId,
      preview.part.events,
      preview.part.length,
    );
    previewRef.current = undefined;
    setPreview(undefined);
  };

  return (
    <section className={styles.patternTools} data-component="pattern-tools" aria-label="Pattern tools">
      <label>
        <span>Generator or transform</span>
        <select
          aria-label="Generator or transform"
          value={tool}
          onChange={(event) => {
            cancelPreview();
            setTool(event.currentTarget.value as PatternTool);
          }}
        >
          <optgroup label="Generators">
            <option value="euclidean">Euclidean rhythm</option>
            <option value="randomize">Randomize</option>
            <option value="humanize">Humanize timing and velocity</option>
            <option value="variation">Pattern variation</option>
          </optgroup>
          <optgroup label="Transforms">
            {(["reverse", "invert", "transpose", "double", "half", "shift", "legato", "stretch"] as const).map(
              (kind) => (
                <option key={kind} value={kind}>
                  {TOOL_LABELS[kind]}
                </option>
              ),
            )}
          </optgroup>
        </select>
      </label>
      {tool === "euclidean" ? (
        <label>
          <span>Drum voice</span>
          <select
            aria-label="Euclidean drum voice"
            value={selectedEuclideanVoice?.id ?? ""}
            onChange={(event) => {
              cancelPreview();
              setEuclideanVoiceId(event.currentTarget.value);
            }}
          >
            {euclideanVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {tool === "randomize" || tool === "humanize" || tool === "variation" || tool === "euclidean" ? (
        <label>
          <span>{tool === "variation" ? "Similarity" : tool === "euclidean" ? "Pulses" : "Strength"}</span>
          <input
            aria-label={`${TOOL_LABELS[tool]} amount`}
            type="range"
            min={0}
            max={tool === "euclidean" ? euclideanPulseMaximum : 100}
            value={tool === "euclidean" ? displayedPulses : amount}
            onChange={(event) => {
              cancelPreview();
              if (tool === "euclidean") setPulses(event.currentTarget.valueAsNumber);
              else setAmount(event.currentTarget.valueAsNumber);
            }}
          />
        </label>
      ) : null}
      {tool === "transpose" || tool === "shift" || tool === "stretch" ? (
        <label>
          <span>{tool === "stretch" ? "Target steps" : "Steps"}</span>
          <input
            aria-label={`${TOOL_LABELS[tool]} steps`}
            type="number"
            min={tool === "stretch" ? 1 : -64}
            max={tool === "stretch" ? 64 : 64}
            value={steps}
            onChange={(event) => {
              cancelPreview();
              setSteps(event.currentTarget.valueAsNumber);
            }}
          />
        </label>
      ) : null}
      <div className={styles.patternToolActions}>
        <button
          type="button"
          disabled={part === undefined || (tool === "euclidean" && !canGenerateEuclidean)}
          onClick={makePreview}
        >
          Preview
        </button>
        <button type="button" disabled={preview === undefined} onClick={apply}>
          Apply
        </button>
        <button type="button" disabled={preview === undefined} onClick={cancelPreview}>
          Cancel
        </button>
      </div>
      <output role="status" aria-live="polite">
        {preview === undefined
          ? "No Pattern preview."
          : `${String(preview.part.events.length)} preview events. Apply creates one Undo entry.`}
      </output>
    </section>
  );
}

function transformEvents(
  tool: PatternTool,
  events: readonly PatternEvent[],
  length: number,
  targetLength: number,
  amount: number,
  steps: number,
  pulses: number,
  euclideanNote: number | undefined,
  random: () => number,
  idFactory: () => NoteEventId,
): readonly PatternEvent[] {
  switch (tool) {
    case "euclidean":
      if (euclideanNote === undefined) return events;
      return generateEuclideanTriggers(events, {
        length,
        note: euclideanNote,
        pulses,
        idFactory,
      });
    case "randomize":
      return randomizePatternEvents(events, { length, strength: amount, random });
    case "humanize":
      return humanizePatternEvents(events, {
        length,
        timingStrength: amount,
        velocityStrength: amount,
        random,
      });
    case "variation":
      return varyPatternEvents(events, { length, similarity: amount, random });
    case "reverse":
      return reversePatternEvents(events, { length });
    case "invert":
      return invertPatternEvents(events, { length });
    case "transpose":
      return transposePatternEvents(events, { length, semitones: steps });
    case "double":
      return doubleTimePatternEvents(events, { length });
    case "half":
      return halfTimePatternEvents(events, { length });
    case "shift":
      return shiftPatternEvents(events, { length, steps });
    case "legato":
      return legatoPatternEvents(events, { length });
    case "stretch":
      return stretchPatternEvents(events, { sourceLength: length, targetLength });
  }
}

function seededRandom(seed: number): () => number {
  let value = seed | 0;
  return () => {
    value = (Math.imul(value ^ (value >>> 16), 0x45d9f3b) + 0x6d2b79f5) | 0;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
