import { useAppStore, useDependencies } from "../store/app-store-context";
import { RackModule } from "./RackModule";
import styles from "./Rack.module.css";

export function Rack() {
  const { visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);

  const visible = rackSlots.slice(0, visibleSlotCount);
  const firstEmpty = visible.find((slot) => slot.moduleId === undefined);

  return (
    <section className={styles.rack} data-component="rack" aria-label="Rack">
      {visible.map((slot, index) => {
        const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
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
          />
        );
      })}
    </section>
  );
}
