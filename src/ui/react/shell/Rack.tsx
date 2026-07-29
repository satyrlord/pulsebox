import { useAppStore, useDependencies } from "../store/app-store-context";
import { RackModule } from "./RackModule";
import styles from "./Rack.module.css";

const TICKS_PER_STEP = 240;

export function Rack() {
  const { visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const playing = useAppStore((state) => state.project.transport.status === "playing");
  // The playhead advances every animation frame, but the rack only cares which
  // step is sounding. Selecting the step index means this subtree re-renders a
  // few times a second instead of sixty.
  const absoluteStep = useAppStore((state) => Math.floor(state.positionTicks / TICKS_PER_STEP));
  const activePatternIndex = useAppStore((state) => state.project.project.activePatternIndex);

  const visible = rackSlots.slice(0, visibleSlotCount);
  const firstEmpty = visible.find((slot) => slot.moduleId === undefined);

  return (
    <section className={styles.rack} data-component="rack" aria-label="Rack">
      {visible.map((slot, index) => {
        const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
        const stepCount = module?.parts[activePatternIndex]?.length ?? 0;
        const playingStep = playing && stepCount > 0 ? absoluteStep % stepCount : undefined;
        return (
          <RackModule
            key={slot.id}
            slotId={slot.id}
            slotNumber={index + 1}
            module={module}
            canMoveLeft={index > 0}
            canMoveRight={index < visible.length - 1}
            hasEmptySlot={firstEmpty !== undefined}
            previousSlotId={visible[index - 1]?.id}
            nextSlotId={visible[index + 1]?.id}
            firstEmptySlotId={firstEmpty?.id}
            playingStep={playingStep}
          />
        );
      })}
    </section>
  );
}
