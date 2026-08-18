import { useEffect, useRef, useState } from "react";

import { createGestureId, type EffectInstanceId, type PluginId } from "../../../contracts";
import { Knob } from "../controls/Knob";
import { automationShortcut } from "../controls/automation-shortcut";
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

function availableEffects(
  chain: EffectChainTarget,
  pluginIds: readonly PluginId[],
  manifestFor: ReturnType<typeof useDependencies>["manifestFor"],
): readonly PluginId[] {
  const placement =
    chain.scope === "module" ? "module-pedalboard" : chain.scope === "send" ? "send-chain" : "master-chain";
  return pluginIds.filter((pluginId) => {
    const manifest = manifestFor(pluginId);
    return manifest?.kind === "effect" && manifest.placements.includes(placement);
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

function frequencyX(frequency: number, width: number): number {
  const low = Math.log10(20);
  const high = Math.log10(20_000);
  return ((Math.log10(Math.max(20, Math.min(20_000, frequency))) - low) / (high - low)) * width;
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
  const finishGesture = (commit: boolean) => {
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
  };
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
      {bands.map((band) => (
        <button
          key={band.id}
          type="button"
          className={styles.eqBandHandle}
          data-band-id={band.id}
          aria-label={`Edit ${band.id} EQ band`}
          title="Drag to set frequency and gain. Use arrows for gain and Shift plus arrows for frequency."
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
        />
      ))}
    </div>
  );
}

/**
 * The only deep editor used for module, send, and master chains. It owns the
 * mandatory dialog focus boundary, while chain state stays in the command store.
 */
export function EffectEditor(props: EffectEditorProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  const [draggingEffectId, setDraggingEffectId] = useState<EffectInstanceId | undefined>(
    undefined,
  );
  const draggingEffectIdRef = useRef<EffectInstanceId | undefined>(undefined);
  const [dragTargetEffectId, setDragTargetEffectId] = useState<EffectInstanceId | undefined>(
    undefined,
  );
  const dragTargetEffectIdRef = useRef<EffectInstanceId | undefined>(undefined);
  const { manifestFor, addableEffectPluginIds = [] } = useDependencies();
  const instances = useAppStore((state) => state.project.project.effects.instances);
  const addEffectToChain = useAppStore((state) => state.addEffectToChain);
  const removeEffectFromChain = useAppStore((state) => state.removeEffectFromChain);
  const replaceEffectInChain = useAppStore((state) => state.replaceEffectInChain);
  const reorderEffectInChain = useAppStore((state) => state.reorderEffectInChain);
  const setEffectBypassed = useAppStore((state) => state.setEffectBypassed);
  const setEffectWetDry = useAppStore((state) => state.setEffectWetDry);
  const setEffectParameter = useAppStore((state) => state.setEffectParameter);
  const previewEffectWetDry = useAppStore((state) => state.previewEffectWetDry);
  const previewEffectParameter = useAppStore((state) => state.previewEffectParameter);
  const setSendFocus = useAppStore((state) => state.setSendFocus);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const effects = props.slots.flatMap((id) => (id === null ? [] : [instances[id]])).filter(
    (effect): effect is NonNullable<typeof effect> => effect !== undefined,
  );
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

  return (
    <div className={styles.backdrop} data-component="effect-editor-backdrop">
      <section
        ref={panelRef}
        className={styles.editor}
        data-component="effect-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`${props.title} effect editor`}
      >
        <header>
          <div>
            <span>{routingLabel}</span>
            <h2>{props.title}</h2>
            <p>{routingDescription}</p>
          </div>
          <button ref={closeRef} type="button" onClick={props.onClose}>
            Close
          </button>
        </header>
        <ol className={styles.chain} aria-label={`${props.title} effect order`}>
          {effects.length === 0 ? <li className={styles.empty}>No effects are in this chain.</li> : null}
          {effects.map((effect, index) => {
            const manifest = manifestFor(effect.pluginId);
            const effectName = manifest?.productName ?? effect.pluginId;
            const effectOwner = `${effectName} in ${props.title}`;
            const protectedEffect = effect.id === props.protectedEffectId;
            return (
              <li
                key={effect.id}
                className={styles.pedal}
                data-effect-id={effect.id}
                data-bypassed={effect.bypassed}
                data-dragging={draggingEffectId === effect.id}
                data-drag-target={
                  draggingEffectId !== undefined && dragTargetEffectId === effect.id
                }
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
                <div className={styles.pedalHead}>
                  <strong>{effectName}</strong>
                  <span>{`Slot ${String(index + 1)}`}</span>
                </div>
                <div className={styles.pedalActions}>
                  <button
                    type="button"
                    disabled={protectedEffect}
                    aria-label={`Drag ${effectOwner} to reorder`}
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
                    Drag
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${effectOwner} earlier`}
                    disabled={protectedEffect || index === 0}
                    onClick={() => reorderEffectInChain(effect.id, effects[index - 2]?.id)}
                  >
                    Earlier
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${effectOwner} later`}
                    disabled={
                      protectedEffect ||
                      index === effects.length - 1 ||
                      effects[index + 1]?.id === props.protectedEffectId
                    }
                    onClick={() => reorderEffectInChain(effect.id, effects[index + 1]?.id)}
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    aria-label={`${effect.bypassed ? "Bypassed" : "Bypass"} ${effectOwner}`}
                    aria-pressed={effect.bypassed}
                    onClick={() => setEffectBypassed(effect.id, !effect.bypassed)}
                  >
                    {effect.bypassed ? "Bypassed" : "Bypass"}
                  </button>
                  <button
                    type="button"
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
                    Automate bypass
                  </button>
                  <button
                    type="button"
                    disabled={protectedEffect}
                    aria-label={
                      protectedEffect
                        ? `${effectOwner} is protected from removal`
                        : `Remove ${effectOwner}`
                    }
                    onClick={() => removeEffectFromChain(effect.id)}
                  >
                    Remove
                  </button>
                  <label>
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
                  {sendTargetId !== undefined ? (
                    <button
                      type="button"
                      aria-label={`Pin ${effectOwner} to the compact send card`}
                      aria-pressed={props.pinnedEffectId === effect.id}
                      onClick={() => setSendFocus(sendTargetId, effect.id)}
                    >
                      {props.pinnedEffectId === effect.id ? "Pinned" : "Pin"}
                    </button>
                  ) : null}
                </div>
                <div className={styles.mix}>
                  <span>Wet dry</span>
                  <Knob
                    controlId={`effect-${effect.id}-wet-dry`}
                    label={`${effectOwner} wet dry`}
                    caption="Mix"
                    min={0}
                    max={1}
                    step={0.01}
                    value={effect.wetDry}
                    defaultValue={1}
                    precision={2}
                    onInput={(value) => previewEffectWetDry(effect.id, value)}
                    onCommit={(value, gestureId) =>
                      setEffectWetDry(effect.id, value, gestureId)
                    }
                    onAutomate={() =>
                      openExternalAutomationTarget({
                        scope: "effect",
                        targetId: effect.id,
                        parameterId: "wet-dry",
                      })
                    }
                  />
                </div>
                {manifest?.meters.some((meter) => meter.id === "gain-reduction") === true ? (
                  <EffectGainReduction
                    effectId={effect.id}
                    effectName={manifest.productName}
                  />
                ) : null}
                {manifest?.ui.detailedEditorSections.some((section) => section.id === "bands") === true ? (
                  <EqResponseCurve effectId={effect.id} state={effect.state} />
                ) : null}
                {manifest?.parameters.map((parameter) => {
                  const value = effect.state[parameter.id] ?? parameter.defaultValue;
                  const owner = effectOwner;
                  const automation =
                    parameter.automation === "step"
                      ? () =>
                          openExternalAutomationTarget({
                            scope: "effect",
                            targetId: effect.id,
                            parameterId: parameter.id,
                          })
                      : undefined;
                  const automationEntry = automationShortcut(automation);
                  const normalizedPercent =
                    parameter.unit === "percent" &&
                    parameter.minimum === 0 &&
                    parameter.maximum === 1;
                  const control =
                    parameter.valueType === "boolean" && typeof value === "boolean" ? (
                      <input
                        type="checkbox"
                        aria-label={`${owner} ${parameter.name}`}
                        aria-keyshortcuts={automationEntry.ariaKeyShortcuts}
                        checked={value}
                        onChange={(event) =>
                          setEffectParameter(effect.id, parameter.id, event.currentTarget.checked)
                        }
                        onKeyDown={automationEntry.onKeyDown}
                        onContextMenu={automationEntry.onContextMenu}
                      />
                    ) : parameter.valueType === "enum" && typeof value === "string" ? (
                      <select
                        aria-label={`${owner} ${parameter.name}`}
                        aria-keyshortcuts={automationEntry.ariaKeyShortcuts}
                        value={value}
                        onChange={(event) =>
                          setEffectParameter(effect.id, parameter.id, event.currentTarget.value)
                        }
                        onKeyDown={automationEntry.onKeyDown}
                        onContextMenu={automationEntry.onContextMenu}
                      >
                        {(parameter.enumValues ?? []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : typeof value === "number" ? (
                      <Knob
                        controlId={`effect-${effect.id}-${parameter.id}`}
                        label={`${owner} ${parameter.name}`}
                        caption={parameter.shortLabel ?? parameter.name}
                        min={parameter.minimum ?? 0}
                        max={parameter.maximum ?? 1}
                        step={parameter.step ?? 0.01}
                        value={value}
                        defaultValue={
                          typeof parameter.defaultValue === "number" ? parameter.defaultValue : value
                        }
                        precision={normalizedPercent ? 0 : parameter.displayPrecision}
                        unit={normalizedPercent ? "percent" : undefined}
                        {...(normalizedPercent
                          ? {
                              formatValue: (next: number) => next * 100,
                              parseValue: (next: number) => next / 100,
                              displayMin: 0,
                              displayMax: 100,
                              displayStep: 1,
                            }
                          : {})}
                        onInput={(next) => previewEffectParameter(effect.id, parameter.id, next)}
                        onCommit={(next, gestureId) =>
                          setEffectParameter(effect.id, parameter.id, next, gestureId)
                        }
                        {...(automation === undefined ? {} : { onAutomate: automation })}
                      />
                    ) : null;
                  if (control === null) return null;
                  return (
                    <div key={parameter.id} className={styles.parameter}>
                      <span>{parameter.name}</span>
                      {control}
                      {parameter.automation === "step" ? (
                        <button
                          type="button"
                          aria-label={`Automate ${owner} ${parameter.name}`}
                          title={`Automate ${parameter.name}.`}
                          onClick={automation}
                        >
                          Automate
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ol>
        <footer>
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
