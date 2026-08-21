import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

import {
  PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
  type EffectInstanceId,
} from "../../../contracts";
import { EffectActionIcon } from "../controls/EffectActionIcon";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { CompactEffectEnumMacro, CompactEffectMacro } from "./CompactEffectControls";
import { EffectEditor } from "./EffectEditor";
import { MasteringMeter } from "./MasteringMeter";
import styles from "./Shell.module.css";

interface PedalPointerDrag {
  readonly effectId: EffectInstanceId;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

type PedalPointerTarget = HTMLButtonElement | HTMLDivElement;

export function MasterPanel() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draggingEffectId, setDraggingEffectId] = useState<EffectInstanceId>();
  const [dragTargetEffectId, setDragTargetEffectId] = useState<EffectInstanceId>();
  const pointerDragRef = useRef<PedalPointerDrag | undefined>(undefined);
  const dragTargetRef = useRef<EffectInstanceId | undefined>(undefined);
  const suppressSlotClickRef = useRef(false);
  const masterChain = useAppStore((state) => state.project.project.effects.masterChain);
  const instances = useAppStore((state) => state.project.project.effects.instances);
  const setEffectBypassed = useAppStore((state) => state.setEffectBypassed);
  const reorderEffectInChain = useAppStore((state) => state.reorderEffectInChain);
  const masterEffectsBypassed = useAppStore(
    (state) => state.project.project.effects.masterEffectsBypassed,
  );
  const toggleMasterEffectsBypass = useAppStore((state) => state.toggleMasterEffectsBypass);
  const { manifestFor } = useDependencies();
  const limiterId = [...masterChain]
    .reverse()
    .find((id) => id !== null && instances[id]?.pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID) ?? undefined;
  const pedals = masterChain.flatMap((effectId, index) => {
    if (effectId === null) return [];
    const effect = instances[effectId];
    if (effect === undefined) return [];
    const manifest = manifestFor(effect.pluginId);
    if (manifest?.kind !== "effect") return [];
    return [{ effect, manifest, index }];
  });

  const clearPointerDrag = () => {
    pointerDragRef.current = undefined;
    dragTargetRef.current = undefined;
    setDraggingEffectId(undefined);
    setDragTargetEffectId(undefined);
  };

  const reorderAtTarget = (sourceId: EffectInstanceId, targetId: EffectInstanceId) => {
    if (sourceId === targetId) return;
    const sourceIndex = pedals.findIndex(({ effect }) => effect.id === sourceId);
    const targetIndex = pedals.findIndex(({ effect }) => effect.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const targetIsProtected = targetId === limiterId;
    const placeBefore = targetIsProtected || sourceIndex > targetIndex;
    const afterEffectId = placeBefore
      ? pedals
          .slice(0, targetIndex)
          .filter(({ effect }) => effect.id !== sourceId)
          .at(-1)?.effect.id
      : targetId;
    reorderEffectInChain(sourceId, afterEffectId);
  };

  const updatePointerDrag = (event: PointerEvent<PedalPointerTarget>) => {
    const drag = pointerDragRef.current;
    if (drag === undefined) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    const targetId = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-effect-id]")
      ?.dataset.effectId as EffectInstanceId | undefined;
    if (targetId === undefined) return;
    dragTargetRef.current = targetId;
    setDragTargetEffectId(targetId);
  };

  const finishPointerDrag = (event: PointerEvent<PedalPointerTarget>) => {
    const drag = pointerDragRef.current;
    if (drag === undefined) return;
    const captureTarget = event.currentTarget as unknown as {
      hasPointerCapture?: (pointerId: number) => boolean;
      releasePointerCapture?: (pointerId: number) => void;
    };
    if (captureTarget.hasPointerCapture?.(event.pointerId)) {
      captureTarget.releasePointerCapture?.(event.pointerId);
    }
    const targetId = dragTargetRef.current;
    suppressSlotClickRef.current = drag.moved;
    if (drag.moved) {
      queueMicrotask(() => {
        suppressSlotClickRef.current = false;
      });
    }
    clearPointerDrag();
    if (drag.moved && targetId !== undefined) reorderAtTarget(drag.effectId, targetId);
  };

  const startPointerDrag = (
    event: PointerEvent<PedalPointerTarget>,
    effectId: EffectInstanceId,
    protectedEffect: boolean,
  ) => {
    if (protectedEffect || event.button !== 0) return;
    event.preventDefault();
    pointerDragRef.current = {
      effectId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    dragTargetRef.current = effectId;
    setDraggingEffectId(effectId);
    setDragTargetEffectId(effectId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const reorderWithKeyboard = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    effectId: EffectInstanceId,
    protectedEffect: boolean,
  ) => {
    if (protectedEffect) return;
    const pedalIndex = pedals.findIndex(({ effect }) => effect.id === effectId);
    if (event.key === "ArrowUp" && pedalIndex > 0) {
      event.preventDefault();
      reorderEffectInChain(effectId, pedals[pedalIndex - 2]?.effect.id);
    }
    if (
      event.key === "ArrowDown" &&
      pedalIndex >= 0 &&
      pedalIndex < pedals.length - 1 &&
      pedals[pedalIndex + 1]?.effect.id !== limiterId
    ) {
      event.preventDefault();
      reorderEffectInChain(effectId, pedals[pedalIndex + 1]?.effect.id);
    }
  };

  return (
    <section
      className={styles.masterPanel}
      data-component="master-panel"
      aria-label="Mastering pedals"
    >
      <div className={styles.masterPedalBay}>
        <div className={styles.masterPanelToolbar}>
          <span>Mastering chain</span>
          <button
            type="button"
            aria-label={masterEffectsBypassed ? "Enable all mastering effects" : "Bypass all mastering effects"}
            aria-pressed={masterEffectsBypassed}
            title={masterEffectsBypassed
              ? "User mastering effects are bypassed. The True Peak Limiter remains active."
              : "Bypass all user mastering effects. The True Peak Limiter remains active."}
            onClick={toggleMasterEffectsBypass}
          >
            Bypass all
          </button>
        </div>
        <ol className={styles.masterPedalList} aria-label="Mastering pedal chain">
        {pedals.map(({ effect, manifest, index }) => {
          const macros = manifest.ui.compactControls.slice(0, 4);
          const effectName = manifest.productName;
          const protectedEffect = effect.id === limiterId;
          return (
            <li
              key={effect.id}
              data-effect-id={effect.id}
              data-drag-target={dragTargetEffectId === effect.id}
            >
              <article
                className={`${styles.effectCard} ${styles.masterPedal}`}
                data-component="master-pedal"
                data-bypassed={effect.bypassed}
                data-protected={protectedEffect}
                data-dragging={draggingEffectId === effect.id}
                style={
                  {
                    "--send-accent": manifest.ui.moduleAccent.accent,
                    "--send-accent-muted": manifest.ui.moduleAccent.accentMuted,
                    "--send-led": manifest.ui.moduleAccent.led,
                    "--module-control-ring": manifest.ui.moduleAccent.controlRing,
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  className={`${styles.masterPedalHandle} ${styles.masterPedalHandleStart}`}
                  data-component="master-pedal-handle"
                  data-edge="start"
                  disabled={protectedEffect}
                  aria-label={`Reorder ${effectName}, master slot ${String(index + 1).padStart(2, "0")}`}
                  title={protectedEffect ? "The final True Peak Limiter cannot move." : "Drag to reorder. Arrow keys move the pedal."}
                  onPointerDown={(event) => startPointerDrag(event, effect.id, protectedEffect)}
                  onPointerMove={updatePointerDrag}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={clearPointerDrag}
                  onKeyDown={(event) => reorderWithKeyboard(event, effect.id, protectedEffect)}
                >
                  <span aria-hidden="true" />
                </button>
                <div
                  className={`${styles.masterPedalHandle} ${styles.masterPedalHandleEnd}`}
                  data-component="master-pedal-handle"
                  data-edge="end"
                  data-disabled={protectedEffect}
                  aria-hidden="true"
                  onPointerDown={(event) => startPointerDrag(event, effect.id, protectedEffect)}
                  onPointerMove={updatePointerDrag}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={clearPointerDrag}
                >
                  <span aria-hidden="true" />
                </div>
                <div className={styles.masterPedalHeading}>
                  <button
                    type="button"
                    className={styles.masterPedalSlot}
                    data-active={!effect.bypassed}
                    aria-label={`Master slot ${String(index + 1).padStart(2, "0")}, ${effectName} ${effect.bypassed ? "bypassed" : "active"}. Click to ${effect.bypassed ? "enable" : "bypass"}`}
                    aria-pressed={effect.bypassed}
                    title={`${effectName} is ${effect.bypassed ? "bypassed" : "active"}. Click to ${effect.bypassed ? "enable" : "bypass"}.`}
                    onClick={() => {
                      if (suppressSlotClickRef.current) {
                        suppressSlotClickRef.current = false;
                        return;
                      }
                      setEffectBypassed(effect.id, !effect.bypassed);
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </button>
                  <div className={styles.effectIdentity}>
                    <div className={styles.masterPedalName}>
                      <h3>{effectName}</h3>
                      {protectedEffect ? <span>Protected final</span> : null}
                    </div>
                  </div>
                </div>
                <div className={styles.masterPedalBody}>
                  <div
                    className={styles.effectMacros}
                    data-component="effect-macros"
                    role="group"
                    aria-label={`${effectName} compact controls`}
                  >
                    {macros.length === 0 ? <span className={styles.emptyMacros}>No compact controls</span> : null}
                    {macros.map((macro) => {
                      const descriptor = manifest.parameters.find((item) => item.id === macro.parameterId);
                      const value = effect.state[macro.parameterId] ?? descriptor?.defaultValue;
                      if (descriptor === undefined) return null;
                      if (
                        descriptor.valueType === "enum" &&
                        typeof value === "string" &&
                        descriptor.enumValues !== undefined
                      ) {
                        return (
                          <CompactEffectEnumMacro
                            key={macro.parameterId}
                            effectId={effect.id}
                            owner="Master"
                            effectName={effectName}
                            parameterId={macro.parameterId}
                            label={descriptor.shortLabel ?? descriptor.name}
                            description={descriptor.description}
                            value={value}
                            values={descriptor.enumValues}
                          />
                        );
                      }
                      if (typeof value !== "number") return null;
                      return (
                        <CompactEffectMacro
                          key={macro.parameterId}
                          effectId={effect.id}
                          owner="Master"
                          effectName={effectName}
                          parameterId={macro.parameterId}
                          label={descriptor.shortLabel ?? descriptor.name}
                          description={descriptor.description}
                          value={value}
                          minimum={descriptor.minimum ?? 0}
                          maximum={descriptor.maximum ?? 1}
                          step={descriptor.step ?? 0.01}
                          resetValue={typeof descriptor.resetValue === "number" ? descriptor.resetValue : value}
                          precision={descriptor.displayPrecision}
                          unit={descriptor.unit === "none" ? undefined : descriptor.unit}
                          normalizedPercent={
                            descriptor.unit === "percent" &&
                            descriptor.minimum === 0 &&
                            descriptor.maximum === 1
                          }
                        />
                      );
                    })}
                  </div>
                  <div className={styles.masterPedalActions}>
                    <button
                      type="button"
                      aria-label={`Edit ${effectName} in Master chain`}
                      title={`Edit ${effectName}.`}
                      onClick={() => setEditorOpen(true)}
                    >
                      <EffectActionIcon kind="edit" />
                    </button>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
        </ol>
      </div>
      <MasteringMeter />
      {editorOpen ? (
        <EffectEditor
          chain={{ scope: "master" }}
          title="Master chain"
          slots={masterChain}
          {...(limiterId === undefined ? {} : { protectedEffectId: limiterId })}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </section>
  );
}
