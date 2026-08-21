import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  createGestureId,
  EFFECT_GAIN_MAXIMUM_DECIBELS,
  EFFECT_GAIN_MINIMUM_DECIBELS,
  PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
  type EffectInstanceId,
  type ParameterDescriptor,
  type PluginId,
} from "../../../contracts";
import { EffectActionIcon } from "../controls/EffectActionIcon";
import { Knob } from "../controls/Knob";
import { automationShortcut } from "../controls/automation-shortcut";
import { displayEnumValue } from "../controls/display-enum-value";
import { useAppStore, useDependencies, useIdFactory } from "../store/app-store-context";
import type { EffectChainTarget } from "../store/app-store";
import styles from "./EffectEditor.module.css";

export interface EffectEditorProps {
  readonly chain: EffectChainTarget;
  readonly title: string;
  readonly slots: readonly (EffectInstanceId | null)[];
  readonly protectedEffectId?: EffectInstanceId;
  readonly pinnedEffectId?: EffectInstanceId | null;
  readonly onClose: () => void;
}

const EDITOR_MINIMUM_INLINE_SIZE = 760;
const EDITOR_MINIMUM_BLOCK_SIZE = 680;
const EDITOR_VIEWPORT_INSET = 32;

interface EditorDimensions {
  readonly inlineSize: number;
  readonly blockSize: number;
  readonly inlineConstrained: boolean;
  readonly blockConstrained: boolean;
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function availableEffects(
  chain: EffectChainTarget,
  pluginIds: readonly PluginId[],
  manifestFor: ReturnType<typeof useDependencies>["manifestFor"],
): readonly PluginId[] {
  const placement =
    chain.scope === "module" ? "module-pedalboard" : chain.scope === "send" ? "send-chain" : "master-chain";
  return pluginIds.filter((pluginId) => {
    const manifest = manifestFor(pluginId);
    return (
      manifest?.kind === "effect" &&
      manifest.placements.includes(placement) &&
      !(chain.scope === "master" && pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID)
    );
  });
}

function EffectGainReduction(props: {
  readonly effectId: EffectInstanceId;
  readonly effectName: string;
}) {
  const { audio } = useDependencies();
  const playing = useAppStore(
    (state) =>
      state.audioRuntimeState === "active" && state.project.transport.status === "playing",
  );
  const [reduction, setReduction] = useState(0);

  useEffect(() => {
    if (!playing || audio.getEffectMeter === undefined) return;
    let frame = 0;
    let lastRead = 0;
    let running = true;
    const tick = (now: number) => {
      if (!running) return;
      if (now - lastRead >= 33) {
        lastRead = now;
        const next = audio.getEffectMeter?.(props.effectId, "gain-reduction") ?? 0;
        setReduction((current) => (Math.abs(current - next) < 0.05 ? current : next));
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [audio, playing, props.effectId]);

  const visibleReduction = playing ? reduction : 0;

  return (
    <div className={styles.gainReduction} data-component="effect-gain-reduction">
      <span>Gain reduction</span>
      <meter
        min={0}
        max={24}
        value={Math.min(24, Math.max(0, visibleReduction))}
        aria-label={`${props.effectName} gain reduction`}
      />
      <output>{`${visibleReduction.toFixed(1)} dB`}</output>
    </div>
  );
}

function numericState(
  state: Readonly<Record<string, string | number | boolean>>,
  id: string,
  fallback: number,
): number {
  const value = state[id];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function DetailedEffectParameter(props: {
  readonly effectId: EffectInstanceId;
  readonly owner: string;
  readonly parameter: ParameterDescriptor;
  readonly value: string | number | boolean;
}) {
  const setEffectParameter = useAppStore((state) => state.setEffectParameter);
  const previewEffectParameter = useAppStore((state) => state.previewEffectParameter);
  const openExternalAutomationTarget = useAppStore(
    (state) => state.openExternalAutomationTarget,
  );
  const enumValues = props.parameter.enumValues ?? [];
  const fixedEnum = props.parameter.valueType === "enum" && enumValues.length === 1;
  const automation =
    props.parameter.automation === "step" && !fixedEnum
      ? () =>
          openExternalAutomationTarget({
            scope: "effect",
            targetId: props.effectId,
            parameterId: props.parameter.id,
          })
      : undefined;
  const automationEntry = automationShortcut(automation);
  const normalizedPercent =
    props.parameter.unit === "percent" &&
    props.parameter.minimum === 0 &&
    props.parameter.maximum === 1;
  const control =
    fixedEnum && typeof props.value === "string" ? (
      <output
        className={styles.parameterIdentity}
        aria-label={`${props.owner} ${props.parameter.name}: ${displayEnumValue(props.value)}`}
        aria-description={props.parameter.description}
        title={props.parameter.description}
      >
        {displayEnumValue(props.value)}
      </output>
    ) : props.parameter.valueType === "boolean" && typeof props.value === "boolean" ? (
      <input
        type="checkbox"
        aria-label={`${props.owner} ${props.parameter.name}`}
        aria-description={props.parameter.description}
        aria-keyshortcuts={automationEntry.ariaKeyShortcuts}
        title={props.parameter.description}
        checked={props.value}
        onChange={(event) =>
          setEffectParameter(props.effectId, props.parameter.id, event.currentTarget.checked)
        }
        onKeyDown={automationEntry.onKeyDown}
        onContextMenu={automationEntry.onContextMenu}
      />
    ) : props.parameter.valueType === "enum" && typeof props.value === "string" ? (
      <select
        aria-label={`${props.owner} ${props.parameter.name}`}
        aria-description={props.parameter.description}
        aria-keyshortcuts={automationEntry.ariaKeyShortcuts}
        title={props.parameter.description}
        value={props.value}
        onChange={(event) =>
          setEffectParameter(props.effectId, props.parameter.id, event.currentTarget.value)
        }
        onKeyDown={automationEntry.onKeyDown}
        onContextMenu={automationEntry.onContextMenu}
      >
        {enumValues.map((option) => (
          <option key={option} value={option}>
            {displayEnumValue(option)}
          </option>
        ))}
      </select>
    ) : typeof props.value === "number" ? (
      <Knob
        controlId={`effect-${props.effectId}-${props.parameter.id}`}
        label={`${props.owner} ${props.parameter.name}`}
        caption={props.parameter.shortLabel ?? props.parameter.name}
        description={props.parameter.description}
        min={props.parameter.minimum ?? 0}
        max={props.parameter.maximum ?? 1}
        step={props.parameter.step ?? 0.01}
        value={props.value}
        defaultValue={
          typeof props.parameter.defaultValue === "number"
            ? props.parameter.defaultValue
            : props.value
        }
        precision={normalizedPercent ? 0 : props.parameter.displayPrecision}
        unit={
          normalizedPercent
            ? "percent"
            : props.parameter.unit === "none"
              ? undefined
              : props.parameter.unit
        }
        {...(normalizedPercent
          ? {
              formatValue: (next: number) => next * 100,
              parseValue: (next: number) => next / 100,
              displayMin: 0,
              displayMax: 100,
              displayStep: 1,
            }
          : {})}
        onInput={(next) => previewEffectParameter(props.effectId, props.parameter.id, next)}
        onCommit={(next, gestureId) =>
          setEffectParameter(props.effectId, props.parameter.id, next, gestureId)
        }
        {...(automation === undefined ? {} : { onAutomate: automation })}
      />
    ) : null;
  if (control === null) return null;
  return (
    <div
      className={styles.parameter}
      data-control-type={fixedEnum ? "identity" : props.parameter.valueType}
    >
      {props.parameter.valueType === "float" ? null : <span>{props.parameter.name}</span>}
      {control}
      {automation === undefined ? null : (
        <button
          type="button"
          className={styles.parameterAutomation}
          aria-label={`Automate ${props.owner} ${props.parameter.name}`}
          title={`Automate ${props.parameter.name}.`}
          onClick={automation}
        >
          <EffectActionIcon kind="automation" />
          <span>Auto</span>
        </button>
      )}
    </div>
  );
}

function frequencyX(frequency: number, width: number): number {
  const low = Math.log10(20);
  const high = Math.log10(20_000);
  return ((Math.log10(Math.max(20, Math.min(20_000, frequency))) - low) / (high - low)) * width;
}

function formatEqFrequency(frequency: number): string {
  if (frequency < 1000) return `${Math.round(frequency).toString()} Hz`;
  const kilohertz = frequency / 1000;
  return `${kilohertz >= 10 ? Math.round(kilohertz).toString() : kilohertz.toFixed(1)} kHz`;
}

function formatEqGain(gain: number): string {
  const prefix = gain > 0 ? "+" : "";
  return `${prefix}${gain.toFixed(1)} dB`;
}

function EqResponseCurve(props: {
  readonly effectId: EffectInstanceId;
  readonly state: Readonly<Record<string, string | number | boolean>>;
}) {
  const idFactory = useIdFactory();
  const previewEffectParameter = useAppStore((state) => state.previewEffectParameter);
  const setEffectParameter = useAppStore((state) => state.setEffectParameter);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{
    readonly id: ReturnType<typeof createGestureId>;
    readonly bandId: "low" | "mid" | "high";
    readonly beforeFrequency: number;
    readonly beforeGain: number;
    frequency: number;
    gain: number;
    pointerId?: number;
  } | undefined>(undefined);
  const [preview, setPreview] = useState<
    Partial<Record<"low" | "mid" | "high", { readonly frequency: number; readonly gain: number }>>
  >({});
  const [announcement, setAnnouncement] = useState("");
  const width = 540;
  const height = 150;
  const lowFrequency = preview.low?.frequency ?? numericState(props.state, "low-frequency", 120);
  const lowGain = preview.low?.gain ?? numericState(props.state, "low-gain", 0);
  const midFrequency = preview.mid?.frequency ?? numericState(props.state, "mid-frequency", 1200);
  const midGain = preview.mid?.gain ?? numericState(props.state, "mid-gain", 0);
  const midQ = numericState(props.state, "mid-q", 1);
  const highFrequency = preview.high?.frequency ?? numericState(props.state, "high-frequency", 8000);
  const highGain = preview.high?.gain ?? numericState(props.state, "high-gain", 0);
  const yForGain = (gain: number) => height / 2 - (Math.max(-24, Math.min(24, gain)) / 24) * 64;
  const bands = [
    { id: "low" as const, frequency: lowFrequency, gain: lowGain, minimum: 20, maximum: 1000 },
    { id: "mid" as const, frequency: midFrequency, gain: midGain, minimum: 100, maximum: 10_000 },
    { id: "high" as const, frequency: highFrequency, gain: highGain, minimum: 1000, maximum: 20_000 },
  ];
  const beginGesture = (band: (typeof bands)[number]) => {
    if (gesture.current !== undefined) return gesture.current;
    gesture.current = {
      id: createGestureId(idFactory),
      bandId: band.id,
      beforeFrequency: band.frequency,
      beforeGain: band.gain,
      frequency: band.frequency,
      gain: band.gain,
    };
    return gesture.current;
  };
  const updateGesture = (
    active: NonNullable<typeof gesture.current>,
    band: (typeof bands)[number],
    frequency: number,
    gain: number,
  ) => {
    active.frequency = Math.max(band.minimum, Math.min(band.maximum, frequency));
    active.gain = Math.max(-18, Math.min(18, gain));
    previewEffectParameter(props.effectId, `${band.id}-frequency`, active.frequency);
    previewEffectParameter(props.effectId, `${band.id}-gain`, active.gain);
    setPreview((current) => ({
      ...current,
      [band.id]: { frequency: active.frequency, gain: active.gain },
    }));
  };
  const finishGesture = useCallback(
    (commit: boolean) => {
      const active = gesture.current;
      if (active === undefined) return;
      gesture.current = undefined;
      if (commit) {
        if (active.frequency !== active.beforeFrequency) {
          setEffectParameter(
            props.effectId,
            `${active.bandId}-frequency`,
            active.frequency,
            active.id,
          );
        }
        if (active.gain !== active.beforeGain) {
          setEffectParameter(props.effectId, `${active.bandId}-gain`, active.gain, active.id);
        }
        if (
          active.frequency !== active.beforeFrequency ||
          active.gain !== active.beforeGain
        ) {
          setAnnouncement(
            `${active.bandId} EQ: ${formatEqFrequency(active.frequency)}, ${formatEqGain(active.gain)}.`,
          );
        }
      } else {
        previewEffectParameter(
          props.effectId,
          `${active.bandId}-frequency`,
          active.beforeFrequency,
        );
        previewEffectParameter(props.effectId, `${active.bandId}-gain`, active.beforeGain);
      }
      setPreview((current) => {
        return Object.fromEntries(
          Object.entries(current).filter(([bandId]) => bandId !== active.bandId),
        );
      });
    },
    [previewEffectParameter, props.effectId, setEffectParameter],
  );

  useEffect(() => {
    const listeners = new AbortController();
    window.addEventListener("blur", () => finishGesture(true), { signal: listeners.signal });
    return () => {
      listeners.abort();
      // Match shared range controls: commit the last valid preview if the editor
      // closes during a gesture so project state and audio cannot diverge.
      finishGesture(true);
    };
  }, [finishGesture]);
  const responseAt = (frequency: number) => {
    const logFrequency = Math.log(frequency);
    const low = lowGain / (1 + Math.exp((logFrequency - Math.log(lowFrequency)) * 5));
    const midDistance = Math.log(frequency / midFrequency) * Math.max(0.2, midQ);
    const mid = midGain * Math.exp(-0.5 * midDistance * midDistance);
    const high = highGain / (1 + Math.exp((Math.log(highFrequency) - logFrequency) * 5));
    return low + mid + high;
  };
  const path = Array.from({ length: 81 }, (_, index) => {
    const x = (index / 80) * width;
    const frequency = 20 * 1000 ** (index / 80);
    const command = index === 0 ? "M" : "L";
    return `${command}${x.toFixed(1)},${yForGain(responseAt(frequency)).toFixed(1)}`;
  }).join(" ");

  return (
    <div ref={surfaceRef} className={styles.eqCurveSurface} data-component="eq-response-curve">
      <svg
        className={styles.eqCurve}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        role="img"
        aria-label="Parametric EQ response curve"
      >
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} data-part="zero-line" />
        <path d={path} data-part="response" />
      </svg>
      <div className={styles.eqAxisLabels} aria-hidden="true">
        <span data-axis="gain-high">+18</span>
        <span data-axis="gain-zero">0</span>
        <span data-axis="gain-low">-18</span>
        <span data-axis="frequency-low">20</span>
        <span data-axis="frequency-mid">1k</span>
        <span data-axis="frequency-high">20k</span>
      </div>
      {bands.map((band) => (
        <button
          key={band.id}
          type="button"
          className={styles.eqBandHandle}
          data-band-id={band.id}
          aria-label={`Edit ${band.id} EQ band, ${formatEqFrequency(band.frequency)}, ${formatEqGain(band.gain)}`}
          title={`${formatEqFrequency(band.frequency)}, ${formatEqGain(band.gain)}. Drag to set frequency and gain. Use arrows for gain and Shift plus arrows for frequency.`}
          style={{
            insetInlineStart: `${String((frequencyX(band.frequency, width) / width) * 100)}%`,
            insetBlockStart: `${String((yForGain(band.gain) / height) * 100)}%`,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const active = beginGesture(band);
            active.pointerId = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = gesture.current;
            const bounds = surfaceRef.current?.getBoundingClientRect();
            if (active?.pointerId !== event.pointerId || bounds === undefined || bounds.width <= 0 || bounds.height <= 0) return;
            const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
            updateGesture(active, band, 20 * 1000 ** x, ((0.5 - y) * height * 24) / 64);
          }}
          onPointerUp={(event) => {
            if (gesture.current?.pointerId !== event.pointerId) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            finishGesture(true);
          }}
          onPointerCancel={() => finishGesture(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              finishGesture(false);
              return;
            }
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            const active = beginGesture(band);
            const frequencyRatio = 2 ** (1 / (event.shiftKey ? 48 : 12));
            const frequency =
              event.key === "ArrowLeft"
                ? active.frequency / frequencyRatio
                : event.key === "ArrowRight"
                  ? active.frequency * frequencyRatio
                  : active.frequency;
            const gain =
              event.key === "ArrowUp"
                ? active.gain + 0.1
                : event.key === "ArrowDown"
                  ? active.gain - 0.1
                  : active.gain;
            updateGesture(active, band, frequency, gain);
          }}
          onKeyUp={(event) => {
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
              finishGesture(true);
            }
          }}
          onBlur={() => finishGesture(true)}
        >
          <span aria-hidden="true">{band.id.charAt(0).toUpperCase()}</span>
        </button>
      ))}
      <output className={styles.hiddenLabel} aria-live="polite">
        {announcement}
      </output>
    </div>
  );
}

/**
 * The only deep editor used for module, send, and master chains. It owns the
 * mandatory dialog focus boundary, while chain state stays in the command store.
 */
export function EffectEditor(props: EffectEditorProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const chainRef = useRef<HTMLOListElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  const [draggingEffectId, setDraggingEffectId] = useState<EffectInstanceId | undefined>(
    undefined,
  );
  const draggingEffectIdRef = useRef<EffectInstanceId | undefined>(undefined);
  const [dragTargetEffectId, setDragTargetEffectId] = useState<EffectInstanceId | undefined>(
    undefined,
  );
  const [editorDimensions, setEditorDimensions] = useState<EditorDimensions>({
    inlineSize: EDITOR_MINIMUM_INLINE_SIZE,
    blockSize: EDITOR_MINIMUM_BLOCK_SIZE,
    inlineConstrained: false,
    blockConstrained: false,
  });
  const dragTargetEffectIdRef = useRef<EffectInstanceId | undefined>(undefined);
  const { manifestFor, addableEffectPluginIds = [] } = useDependencies();
  const instances = useAppStore((state) => state.project.project.effects.instances);
  const addEffectToChain = useAppStore((state) => state.addEffectToChain);
  const removeEffectFromChain = useAppStore((state) => state.removeEffectFromChain);
  const replaceEffectInChain = useAppStore((state) => state.replaceEffectInChain);
  const reorderEffectInChain = useAppStore((state) => state.reorderEffectInChain);
  const setEffectBypassed = useAppStore((state) => state.setEffectBypassed);
  const setEffectMix = useAppStore((state) => state.setEffectMix);
  const setEffectGain = useAppStore((state) => state.setEffectGain);
  const previewEffectMix = useAppStore((state) => state.previewEffectMix);
  const previewEffectGain = useAppStore((state) => state.previewEffectGain);
  const setSendFocus = useAppStore((state) => state.setSendFocus);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const effects = props.slots.flatMap((id) => (id === null ? [] : [instances[id]])).filter(
    (effect): effect is NonNullable<typeof effect> => effect !== undefined,
  );
  const layoutSignature = effects
    .map((effect) => `${effect.id}:${effect.pluginId}`)
    .join("|");
  const choices = availableEffects(props.chain, addableEffectPluginIds, manifestFor);
  const sendTargetId = props.chain.scope === "send" ? props.chain.targetId : undefined;
  const routingLabel =
    props.chain.scope === "module"
      ? "Instrument pedalboard"
      : props.chain.scope === "send"
        ? "Shared send return"
        : "Master processing";
  const routingDescription =
    props.chain.scope === "module"
      ? "This pedalboard processes only this instrument before its mixer channel."
      : props.chain.scope === "send"
        ? "This shared chain processes signal sent from any mixer channel."
        : "This chain processes the combined mix before the protected limiter.";

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);

  const clearPointerDrag = () => {
    draggingEffectIdRef.current = undefined;
    dragTargetEffectIdRef.current = undefined;
    setDraggingEffectId(undefined);
    setDragTargetEffectId(undefined);
  };

  const updatePointerDragTarget = (effectId: EffectInstanceId) => {
    dragTargetEffectIdRef.current = effectId;
    setDragTargetEffectId(effectId);
  };

  const finishPointerReorder = (targetEffectId: EffectInstanceId) => {
    const sourceId = draggingEffectIdRef.current;
    clearPointerDrag();
    if (sourceId === undefined || sourceId === targetEffectId) return;
    const sourceIndex = effects.findIndex((candidate) => candidate.id === sourceId);
    const targetIndex = effects.findIndex((candidate) => candidate.id === targetEffectId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const targetIsProtected = targetEffectId === props.protectedEffectId;
    const placeBefore = targetIsProtected || sourceIndex > targetIndex;
    const afterEffectId = placeBefore
      ? effects
          .slice(0, targetIndex)
          .filter((candidate) => candidate.id !== sourceId)
          .at(-1)?.id
      : targetEffectId;
    reorderEffectInChain(sourceId, afterEffectId);
  };

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const panel = panelRef.current;
    if (panel === null) return;
    const controller = new AbortController();
    panel.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )].filter((element) => element.offsetParent !== null || element === document.activeElement);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first === undefined || last === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const header = headerRef.current;
    const chain = chainRef.current;
    const footer = footerRef.current;
    if (panel === null || header === null || chain === null || footer === null) return;

    let resizeFrame = 0;
    const measure = () => {
      const chainStyle = getComputedStyle(chain);
      const pedals = [...chain.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      const gap = pixels(chainStyle.columnGap);
      const inlinePadding =
        pixels(chainStyle.paddingInlineStart) + pixels(chainStyle.paddingInlineEnd);
      const blockPadding =
        pixels(chainStyle.paddingBlockStart) + pixels(chainStyle.paddingBlockEnd);
      const pedalInlineSize = pedals.reduce(
        (total, pedal) => total + pedal.getBoundingClientRect().width,
        0,
      );
      const pedalBlockSize = pedals.reduce(
        (maximum, pedal) =>
          Math.max(maximum, pedal.getBoundingClientRect().height, pedal.scrollHeight),
        0,
      );
      const intrinsicChainInlineSize =
        inlinePadding + pedalInlineSize + Math.max(0, pedals.length - 1) * gap;
      const intrinsicChainBlockSize = blockPadding + pedalBlockSize;
      const panelBounds = panel.getBoundingClientRect();
      const panelInlineChrome = Math.max(0, panelBounds.width - chain.clientWidth);
      const panelBlockChrome = Math.max(0, panelBounds.height - chain.clientHeight);
      const desiredInlineSize = Math.ceil(
        Math.max(
          EDITOR_MINIMUM_INLINE_SIZE,
          intrinsicChainInlineSize + panelInlineChrome,
        ),
      );
      const desiredBlockSize = Math.ceil(
        Math.max(
          EDITOR_MINIMUM_BLOCK_SIZE,
          intrinsicChainBlockSize + panelBlockChrome,
        ),
      );
      const maximumInlineSize = Math.max(
        0,
        window.innerWidth - EDITOR_VIEWPORT_INSET,
      );
      const maximumBlockSize = Math.max(
        0,
        window.innerHeight - EDITOR_VIEWPORT_INSET,
      );
      const next: EditorDimensions = {
        inlineSize: Math.min(maximumInlineSize, desiredInlineSize),
        blockSize: Math.min(maximumBlockSize, desiredBlockSize),
        inlineConstrained: desiredInlineSize > maximumInlineSize,
        blockConstrained: desiredBlockSize > maximumBlockSize,
      };
      setEditorDimensions((current) =>
        current.inlineSize === next.inlineSize &&
        current.blockSize === next.blockSize &&
        current.inlineConstrained === next.inlineConstrained &&
        current.blockConstrained === next.blockConstrained
          ? current
          : next,
      );
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(chain);
    for (const pedal of chain.children) observer.observe(pedal);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [layoutSignature]);

  return (
    <div className={styles.backdrop} data-component="effect-editor-backdrop">
      <section
        ref={panelRef}
        className={styles.editor}
        data-component="effect-editor"
        data-inline-constrained={editorDimensions.inlineConstrained}
        data-block-constrained={editorDimensions.blockConstrained}
        role="dialog"
        aria-modal="true"
        aria-label={`${props.title} effect editor`}
        style={{
          inlineSize: editorDimensions.inlineSize,
          blockSize: editorDimensions.blockSize,
        }}
      >
        <header ref={headerRef}>
          <div>
            <span>{routingLabel}</span>
            <h2>{props.title}</h2>
            <p>{routingDescription}</p>
          </div>
          <button ref={closeRef} type="button" onClick={props.onClose}>
            Close
          </button>
        </header>
        <ol
          ref={chainRef}
          className={styles.chain}
          aria-label={`${props.title} effect order`}
        >
          {effects.length === 0 ? <li className={styles.empty}>No effects are in this chain.</li> : null}
          {effects.map((effect, index) => {
            const manifest = manifestFor(effect.pluginId);
            const effectName = manifest?.productName ?? effect.pluginId;
            const effectOwner = `${effectName} in ${props.title}`;
            const protectedEffect = effect.id === props.protectedEffectId;
            const accent = manifest?.ui.moduleAccent;
            const hasWideEditor =
              (manifest?.parameters.length ?? 0) > 5 ||
              manifest?.ui.detailedEditorSections.some((section) => section.id === "bands") === true;
            const pedalStyle = {
              "--effect-accent": accent?.accent ?? "var(--pulse-color-accent, #7ed9a3)",
              "--effect-accent-muted":
                accent?.accentMuted ?? "var(--pulse-color-selection, #244d38)",
              "--effect-led": accent?.led ?? "var(--pulse-color-status-success, #62d28a)",
              "--effect-control-ring":
                accent?.controlRing ?? "var(--pulse-color-control-fill, #b0f2ca)",
              "--module-control-ring":
                accent?.controlRing ?? "var(--pulse-color-control-fill, #b0f2ca)",
            } as CSSProperties;
            const parameterById = new Map(
              (manifest?.parameters ?? []).map((parameter) => [parameter.id, parameter]),
            );
            const visibilityByParameter = new Map(
              (manifest?.ui.parameterVisibility ?? []).map((rule) => [rule.parameterId, rule]),
            );
            const parameterIsVisible = (parameter: ParameterDescriptor) => {
              const rule = visibilityByParameter.get(parameter.id);
              if (rule === undefined) return true;
              const gateDescriptor = parameterById.get(rule.gateParameterId);
              const gateValue =
                effect.state[rule.gateParameterId] ?? gateDescriptor?.defaultValue;
              return gateValue === rule.gateValue;
            };
            const sectionedParameterIds = new Set(
              (manifest?.ui.detailedEditorSections ?? []).flatMap(
                (section) => section.parameterIds,
              ),
            );
            const unsectionedParameters = (manifest?.parameters ?? []).filter(
              (parameter) =>
                !sectionedParameterIds.has(parameter.id) && parameterIsVisible(parameter),
            );
            return (
              <li
                key={effect.id}
                className={styles.pedal}
                data-component="effect-pedal"
                data-effect-id={effect.id}
                data-bypassed={effect.bypassed}
                data-wide={hasWideEditor}
                data-dragging={draggingEffectId === effect.id}
                data-drag-target={
                  draggingEffectId !== undefined && dragTargetEffectId === effect.id
                }
                style={pedalStyle}
                onPointerEnter={() => {
                  if (draggingEffectIdRef.current !== undefined) {
                    updatePointerDragTarget(effect.id);
                  }
                }}
                onPointerUp={(event) => {
                  if (draggingEffectIdRef.current === undefined) return;
                  event.preventDefault();
                  finishPointerReorder(effect.id);
                }}
                onPointerCancel={() => {
                  clearPointerDrag();
                }}
              >
                <div className={styles.pedalTop}>
                  <button
                    type="button"
                    className={styles.dragHandle}
                    disabled={protectedEffect}
                    aria-label={`Drag ${effectOwner} to reorder`}
                    title={`Drag ${effectName} to reorder.`}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      draggingEffectIdRef.current = effect.id;
                      setDraggingEffectId(effect.id);
                      updatePointerDragTarget(effect.id);
                      const target = event.currentTarget as unknown as {
                        setPointerCapture?: (pointerId: number) => void;
                      };
                      target.setPointerCapture?.(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (draggingEffectIdRef.current !== effect.id) return;
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>("[data-effect-id]")
                        ?.dataset.effectId;
                      if (target !== undefined) {
                        updatePointerDragTarget(target as EffectInstanceId);
                      }
                    }}
                    onPointerUp={(event) => {
                      if (draggingEffectIdRef.current !== effect.id) return;
                      const captureTarget = event.currentTarget as unknown as {
                        hasPointerCapture?: (pointerId: number) => boolean;
                        releasePointerCapture?: (pointerId: number) => void;
                      };
                      if (captureTarget.hasPointerCapture?.(event.pointerId)) {
                        captureTarget.releasePointerCapture?.(event.pointerId);
                      }
                      const target = dragTargetEffectIdRef.current;
                      if (target === undefined) clearPointerDrag();
                      else finishPointerReorder(target);
                    }}
                    onPointerCancel={() => {
                      clearPointerDrag();
                    }}
                  >
                    <EffectActionIcon kind="drag" />
                  </button>
                  <span className={styles.ordinal} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    className={styles.power}
                    aria-label={`${effect.bypassed ? "Bypassed" : "Bypass"} ${effectOwner}`}
                    aria-pressed={effect.bypassed}
                    title={effect.bypassed ? `Enable ${effectName}.` : `Bypass ${effectName}.`}
                    onClick={() => setEffectBypassed(effect.id, !effect.bypassed)}
                  >
                    <span className={styles.powerLabel}>
                      {effect.bypassed ? "Bypassed" : "On"}
                    </span>
                  </button>
                </div>
                <div className={styles.pedalHead}>
                  <div>
                    <span className={styles.familyChip}>{manifest?.shortLabel ?? "FX"}</span>
                    <strong>{effectName}</strong>
                  </div>
                </div>
                <div
                  className={styles.pedalActions}
                  data-has-pin={sendTargetId !== undefined}
                >
                  <button
                    type="button"
                    className={styles.moveAction}
                    data-component="pedal-move-button"
                    aria-label={`Move ${effectOwner} earlier`}
                    title={`Move ${effectName} left.`}
                    disabled={protectedEffect || index === 0}
                    onClick={() => reorderEffectInChain(effect.id, effects[index - 2]?.id)}
                  >
                    <EffectActionIcon kind="move-left" />
                  </button>
                  <button
                    type="button"
                    className={styles.moveAction}
                    data-component="pedal-move-button"
                    aria-label={`Move ${effectOwner} later`}
                    title={`Move ${effectName} right.`}
                    disabled={
                      protectedEffect ||
                      index === effects.length - 1 ||
                      effects[index + 1]?.id === props.protectedEffectId
                    }
                    onClick={() => reorderEffectInChain(effect.id, effects[index + 1]?.id)}
                  >
                    <EffectActionIcon kind="move-right" />
                  </button>
                  <button
                    type="button"
                    className={styles.serviceAuto}
                    title={`Automate ${manifest?.productName ?? effect.pluginId} bypass.`}
                    aria-label={`Automate ${effectOwner} bypass`}
                    onClick={() =>
                      openExternalAutomationTarget({
                        scope: "effect",
                        targetId: effect.id,
                        parameterId: "bypassed",
                      })
                    }
                  >
                    <EffectActionIcon kind="automation" />
                    <span>Auto</span>
                  </button>
                  <button
                    type="button"
                    className={styles.removeAction}
                    data-component="pedal-remove-button"
                    disabled={protectedEffect}
                    title={
                      protectedEffect
                        ? `${effectName} is protected from removal.`
                        : `Remove ${effectName}.`
                    }
                    aria-label={
                      protectedEffect
                        ? `${effectOwner} is protected from removal`
                        : `Remove ${effectOwner}`
                    }
                    onClick={() => removeEffectFromChain(effect.id)}
                  >
                    <EffectActionIcon kind="remove" />
                  </button>
                  {sendTargetId !== undefined ? (
                    <button
                      type="button"
                      className={styles.pinAction}
                      aria-label={`Pin ${effectOwner} to the compact send card`}
                      aria-pressed={props.pinnedEffectId === effect.id}
                      title={
                        props.pinnedEffectId === effect.id
                          ? `Keep ${effectName} pinned to the compact send card.`
                          : `Pin ${effectName} to the compact send card.`
                      }
                      onClick={() => setSendFocus(sendTargetId, effect.id)}
                    >
                      <EffectActionIcon kind="pin" />
                    </button>
                  ) : null}
                  <label className={styles.replaceAction}>
                    <span>Replace</span>
                    <select
                      aria-label={`Replace ${effectOwner}`}
                      defaultValue=""
                      disabled={protectedEffect}
                      onChange={(event) => {
                        if (event.currentTarget.value.length === 0) return;
                        replaceEffectInChain(effect.id, event.currentTarget.value as PluginId);
                        event.currentTarget.value = "";
                      }}
                    >
                      <option value="">Choose effect</option>
                      {choices
                        .filter((pluginId) => pluginId !== effect.pluginId)
                        .map((pluginId) => (
                          <option key={pluginId} value={pluginId}>
                            {manifestFor(pluginId)?.productName ?? pluginId}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className={styles.pedalBody}>
                  {(manifest?.ui.detailedEditorSections ?? []).map(
                    (section, sectionIndex) => {
                      const sectionParameters = section.parameterIds.flatMap((parameterId) => {
                        const parameter = parameterById.get(parameterId);
                        return parameter === undefined || !parameterIsVisible(parameter)
                          ? []
                          : [parameter];
                      });
                      const hasGainReduction =
                        sectionIndex === 0 &&
                        manifest?.meters.some((meter) => meter.id === "gain-reduction") === true;
                      const hasEqCurve = section.id === "bands";
                      if (
                        sectionParameters.length === 0 &&
                        !hasGainReduction &&
                        !hasEqCurve
                      ) {
                        return null;
                      }
                      return (
                        <section
                          key={section.id}
                          className={styles.parameterSection}
                          data-component="effect-parameter-section"
                          data-section-id={section.id}
                        >
                          <span className={styles.sectionLabel}>{section.name}</span>
                          <div className={styles.parameterGrid}>
                            {hasGainReduction ? (
                              <EffectGainReduction
                                effectId={effect.id}
                                effectName={manifest.productName}
                              />
                            ) : null}
                            {hasEqCurve ? (
                              <EqResponseCurve effectId={effect.id} state={effect.state} />
                            ) : null}
                            {sectionParameters.map((parameter) => (
                              <DetailedEffectParameter
                                key={parameter.id}
                                effectId={effect.id}
                                owner={effectOwner}
                                parameter={parameter}
                                value={effect.state[parameter.id] ?? parameter.defaultValue}
                              />
                            ))}
                          </div>
                        </section>
                      );
                    },
                  )}
                  {unsectionedParameters.length === 0 ? null : (
                    <section
                      className={styles.parameterSection}
                      data-component="effect-parameter-section"
                      data-section-id="other"
                    >
                      <span className={styles.sectionLabel}>Other</span>
                      <div className={styles.parameterGrid}>
                        {unsectionedParameters.map((parameter) => (
                          <DetailedEffectParameter
                            key={parameter.id}
                            effectId={effect.id}
                            owner={effectOwner}
                            parameter={parameter}
                            value={effect.state[parameter.id] ?? parameter.defaultValue}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  <section
                    className={styles.outputSection}
                    data-component="effect-output-section"
                  >
                    <span className={styles.sectionLabel}>Output</span>
                    <div className={styles.controlGrid}>
                      <Knob
                        controlId={`effect-${effect.id}-mix`}
                        label={`${effectOwner} Mix`}
                        caption="Mix"
                        description="Blends this effect with its dry input before Gain. At zero, only dry signal passes. At one, only the effect passes."
                        min={0}
                        max={1}
                        step={0.01}
                        value={effect.mix}
                        defaultValue={manifest?.kind === "effect" ? manifest.defaultMix : 1}
                        precision={2}
                        onInput={(value) => previewEffectMix(effect.id, value)}
                        onCommit={(value, gestureId) =>
                          setEffectMix(effect.id, value, gestureId)
                        }
                        onAutomate={() =>
                          openExternalAutomationTarget({
                            scope: "effect",
                            targetId: effect.id,
                            parameterId: "mix",
                          })
                        }
                      />
                      <Knob
                        controlId={`effect-${effect.id}-gain`}
                        label={`${effectOwner} Gain`}
                        caption="Gain"
                        description="Sets this effect's level after Mix and before the next effect. It does not change the dry-to-effect balance."
                        min={EFFECT_GAIN_MINIMUM_DECIBELS}
                        max={EFFECT_GAIN_MAXIMUM_DECIBELS}
                        step={0.1}
                        value={effect.gainDecibels}
                        defaultValue={0}
                        unit="decibels"
                        precision={1}
                        onInput={(value) => previewEffectGain(effect.id, value)}
                        onCommit={(value, gestureId) =>
                          setEffectGain(effect.id, value, gestureId)
                        }
                        onAutomate={() =>
                          openExternalAutomationTarget({
                            scope: "effect",
                            targetId: effect.id,
                            parameterId: "gain",
                          })
                        }
                      />
                    </div>
                  </section>
                </div>
              </li>
            );
          })}
        </ol>
        <footer ref={footerRef}>
          <label>
            <span>Add effect</span>
            <select
              aria-label={`Add an effect to ${props.title}`}
              defaultValue=""
              onChange={(event) => {
                if (event.currentTarget.value.length === 0) return;
                addEffectToChain(props.chain, event.currentTarget.value as PluginId);
                event.currentTarget.value = "";
              }}
            >
              <option value="">Choose effect</option>
              {choices.map((pluginId) => (
                <option key={pluginId} value={pluginId}>
                  {manifestFor(pluginId)?.productName ?? pluginId}
                </option>
              ))}
            </select>
          </label>
        </footer>
      </section>
    </div>
  );
}
