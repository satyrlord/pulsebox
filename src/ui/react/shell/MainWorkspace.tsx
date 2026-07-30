import { ModuleBrowser } from "./ModuleBrowser";
import { Rack } from "./Rack";
import { RackOverview } from "./RackOverview";
import { StudioPanel } from "./StudioPanel";
import styles from "./Shell.module.css";

export function MainWorkspace() {
  return (
    <main
      className={styles.mainWorkspace}
      data-component="main-workspace"
      aria-label="Rack workspace"
    >
      <ModuleBrowser />
      <RackOverview />
      <Rack />
      <StudioPanel />
    </main>
  );
}
