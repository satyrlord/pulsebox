import { useRef } from "react";

import { BypassAllIcon } from "../controls/BypassAllIcon";
import { useAppStore, type StudioView } from "../store/app-store-context";
import { EffectsBank } from "./EffectsBank";
import { MasterPanel } from "./MasterPanel";
import { Mixer } from "./Mixer";
import styles from "./Shell.module.css";

const VIEWS: readonly { readonly id: StudioView; readonly label: string }[] = [
  { id: "mixer", label: "Mixer" },
  { id: "effects", label: "Effects" },
  { id: "master", label: "Master" },
];

export function StudioPanel() {
  const studioView = useAppStore((state) => state.studioView);
  const setStudioView = useAppStore((state) => state.setStudioView);
  const sendEffectsBypassed = useAppStore(
    (state) => state.project.project.effects.sendEffectsBypassed,
  );
  const toggleAllSendEffectsBypass = useAppStore(
    (state) => state.toggleAllSendEffectsBypass,
  );
  const tabList = useRef<HTMLDivElement>(null);

  return (
    <section className={styles.studioPanel} data-component="studio-panel" aria-label="Studio">
      <div className={styles.studioHeader}>
        <div className={styles.studioTabs} role="tablist" aria-label="Studio view" ref={tabList}>
          {VIEWS.map((view, index) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              id={`studio-tab-${view.id}`}
              aria-selected={view.id === studioView}
              aria-controls={`studio-pane-${view.id}`}
              tabIndex={view.id === studioView ? 0 : -1}
              onClick={() => {
                setStudioView(view.id);
              }}
              onKeyDown={(event) => {
                const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (direction === 0) return;
                event.preventDefault();
                const next = (index + direction + VIEWS.length) % VIEWS.length;
                const nextView = VIEWS[next];
                if (nextView === undefined) return;
                setStudioView(nextView.id);
                tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}
            >
              {view.label}
            </button>
          ))}
        </div>
        {studioView === "mixer" ? (
          <button
            type="button"
            className={styles.studioBypassAll}
            aria-label="Bypass all Send FX"
            aria-pressed={sendEffectsBypassed}
            data-bypassed={sendEffectsBypassed}
            title={sendEffectsBypassed ? "Enable all Send FX." : "Bypass all Send FX."}
            onClick={toggleAllSendEffectsBypass}
          >
            <BypassAllIcon />
          </button>
        ) : null}
      </div>
      <div
        className={styles.studioPane}
        id={`studio-pane-${studioView}`}
        role="tabpanel"
        aria-labelledby={`studio-tab-${studioView}`}
      >
        {studioView === "mixer" ? <Mixer /> : null}
        {studioView === "effects" ? <EffectsBank /> : null}
        {studioView === "master" ? <MasterPanel /> : null}
      </div>
    </section>
  );
}
