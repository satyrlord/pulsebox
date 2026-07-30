import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Shell.module.css";

export function ModuleBrowser() {
  const { addablePluginIds, manifestFor, visibleSlotCount } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const addModule = useAppStore((state) => state.addModule);
  const firstEmpty = rackSlots
    .slice(0, visibleSlotCount)
    .find((slot) => slot.moduleId === undefined);

  return (
    <aside
      className={styles.moduleBrowser}
      data-component="module-browser"
      aria-label="Module browser"
    >
      <header className={styles.panelHeader}>
        <span className={styles.statusLamp} aria-hidden="true" />
        <h2>All modules</h2>
      </header>
      <div className={styles.moduleList}>
        {addablePluginIds.map((pluginId) => {
          const manifest = manifestFor(pluginId);
          if (manifest === undefined) return null;
          return (
            <article
              key={pluginId}
              className={styles.moduleChoice}
              style={{ "--module-accent": manifest.ui.moduleAccent.accent } as React.CSSProperties}
            >
              <div className={styles.moduleThumbnail} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className={styles.moduleChoiceText}>
                <strong>{manifest.shortLabel}</strong>
                <span>{manifest.productName}</span>
                <small>{manifest.kind === "instrument" ? "Instrument" : "Effect"}</small>
              </div>
              {firstEmpty === undefined ? null : (
                <button
                  type="button"
                  aria-label={`Add ${manifest.productName} to the first empty rack slot`}
                  title={`Add ${manifest.productName} to the first empty rack slot.`}
                  onClick={() => {
                    addModule(firstEmpty.id, pluginId);
                  }}
                >
                  Add
                </button>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
