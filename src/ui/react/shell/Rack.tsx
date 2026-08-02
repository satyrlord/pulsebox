import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ModuleInstanceId } from "../../../contracts";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { RackModule } from "./RackModule";
import styles from "./Rack.module.css";

interface DragState {
  readonly moduleId: ModuleInstanceId;
  readonly fromIndex: number;
  readonly targetIndex: number;
  readonly pointerId: number;
}

/**
 * The rack owns the reorder gesture, because the insertion marker must render
 * on whichever slot the drag currently targets. Slot geometry is measured once
 * when the gesture starts and reused for every move, so pointer moves never
 * trigger layout reads (section 21.9).
 */
export function Rack() {
  const { visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const revealRequest = useAppStore((state) => state.rackRevealRequest);
  const moveModule = useAppStore((state) => state.moveModule);

  const rackRef = useRef<HTMLElement | null>(null);
  const slotBands = useRef<readonly { readonly top: number; readonly bottom: number }[]>([]);
  const [drag, setDrag] = useState<DragState | undefined>(undefined);

  const visible = useMemo(
    () => rackSlots.slice(0, visibleSlotCount),
    [rackSlots, visibleSlotCount],
  );
  const firstEmpty = visible.find((slot) => slot.moduleId === undefined);

  // `visible` is memoized because this effect depends on it. A fresh array each
  // render would re-subscribe all four window listeners on every pointer move
  // of a drag.
  useEffect(() => {
    if (drag === undefined) return;
    const targetIndexFor = (clientY: number): number => {
      const bands = slotBands.current;
      for (const [index, band] of bands.entries()) {
        if (clientY >= band.top && clientY <= band.bottom) return index;
      }
      const first = bands[0];
      if (first !== undefined && clientY < first.top) return 0;
      return bands.length - 1;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      const targetIndex = targetIndexFor(event.clientY);
      if (targetIndex !== drag.targetIndex) setDrag({ ...drag, targetIndex });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      setDrag(undefined);
      // The store commits the move on release (section 14).
      const target = visible[drag.targetIndex];
      if (target !== undefined && drag.targetIndex !== drag.fromIndex) {
        moveModule(drag.moduleId, target.id);
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      setDrag(undefined);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape stops the drag without a change (section 14). It must not also
      // reach the global transport shortcut, because a reorder never
      // interrupts playback.
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDrag(undefined);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [drag, moveModule, visible]);

  // Section 13.2: selecting a slot scrolls its full module into view. The rack
  // owns its own DOM, so the reveal lives here; the overview and the mixer
  // only dispatch the selection.
  useEffect(() => {
    if (selectedModuleId === undefined) return;
    const index = visible.findIndex((slot) => slot.moduleId === selectedModuleId);
    if (index < 0) return;
    const sections = rackRef.current?.querySelectorAll('[data-component="rack-module"]');
    sections?.[index]?.scrollIntoView({ block: "nearest" });
  }, [revealRequest, selectedModuleId, visible]);

  // Stable across renders, because `RackModule` is memoized and a fresh handler
  // for each faceplate would make that memo produce new output on every rack
  // render. Both refs and `setDrag` keep their identity.
  const startReorder = useCallback(
    (moduleId: ModuleInstanceId, fromIndex: number, pointerId: number) => {
      const sections = rackRef.current?.querySelectorAll('[data-component="rack-module"]');
      slotBands.current = [...(sections ?? [])].map((section) => {
        const rect = section.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      setDrag({ moduleId, fromIndex, targetIndex: fromIndex, pointerId });
    },
    [],
  );

  return (
    <section ref={rackRef} className={styles.rack} data-component="rack" aria-label="Rack">
      {visible.map((slot, index) => {
        const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
        const moduleId = module?.id;
        return (
          <RackModule
            key={moduleId ?? slot.id}
            slotNumber={index + 1}
            module={module}
            canMoveUp={index > 0}
            canMoveDown={index < visible.length - 1}
            hasEmptySlot={firstEmpty !== undefined}
            previousSlotId={visible[index - 1]?.id}
            nextSlotId={visible[index + 1]?.id}
            firstEmptySlotId={firstEmpty?.id}
            dragging={moduleId !== undefined && drag?.moduleId === moduleId}
            dropTarget={drag?.targetIndex === index && drag.fromIndex !== index}
            onReorderStart={startReorder}
          />
        );
      })}
    </section>
  );
}
