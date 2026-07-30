import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Shell.module.css";

export function RackOverview() {
  const { addablePluginIds, manifestFor, visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const addModule = useAppStore((state) => state.addModule);
  const selectModule = useAppStore((state) => state.selectModule);
  const firstPlugin = addablePluginIds[0];

  return (
    <aside className={styles.rackOverview} data-component="rack-overview" aria-label="Rack slots">
      <header className={styles.panelHeader}>
        <h2>Slots</h2>
      </header>
      <ol className={styles.slotList}>
        {rackSlots.slice(0, visibleSlotCount).map((slot, index) => {
          const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
          const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
          const selected = module?.id === selectedModuleId;
          return (
            <li key={slot.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {module === undefined || manifest === undefined ? (
                firstPlugin === undefined ? (
                  <span className={styles.emptySlot}>Empty</span>
                ) : (
                  <button
                    type="button"
                    className={styles.emptySlot}
                    aria-label={`Add module to rack slot ${String(index + 1).padStart(2, "0")}`}
                    onClick={() => {
                      addModule(slot.id, firstPlugin);
                    }}
                  >
                    Empty +
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className={styles.occupiedSlot}
                  aria-pressed={selected}
                  aria-label={`Select ${manifest.productName} in rack slot ${String(index + 1).padStart(2, "0")}`}
                  style={
                    { "--module-accent": manifest.ui.moduleAccent.accent } as React.CSSProperties
                  }
                  onClick={() => {
                    selectModule(module.id);
                  }}
                >
                  {manifest.shortLabel}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
