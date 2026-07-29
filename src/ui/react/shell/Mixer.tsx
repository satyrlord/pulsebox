import { Fader } from "../controls/Fader";
import { LevelMeter } from "../controls/LevelMeter";
import { Toggle } from "../controls/Toggle";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Mixer.module.css";

/**
 * One strip per loaded module plus a master strip. Every control dispatches a
 * command; none of them touch an AudioNode, and none rebuild a voice.
 */
export function Mixer() {
  const { visibleSlotCount, manifestFor } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const meterLevels = useAppStore((state) => state.meterLevels);
  const toggleMute = useAppStore((state) => state.toggleMute);
  const toggleSolo = useAppStore((state) => state.toggleSolo);
  const setChannelLevel = useAppStore((state) => state.setChannelLevel);
  const setChannelPan = useAppStore((state) => state.setChannelPan);
  const setMasterLevel = useAppStore((state) => state.setMasterLevel);
  const previewChannelMix = useAppStore((state) => state.previewChannelMix);
  const previewMasterLevel = useAppStore((state) => state.previewMasterLevel);

  const loaded = rackSlots
    .slice(0, visibleSlotCount)
    .map((slot) => (slot.moduleId === undefined ? undefined : modules[slot.moduleId]))
    .filter((module): module is NonNullable<typeof module> => module !== undefined);

  const anySolo = loaded.some((module) => module.solo);

  return (
    <section className={styles.mixer} data-component="mixer" aria-label="Mixer">
      {loaded.length === 0 ? (
        <p className={styles.empty}>Add a module to the rack to mix it.</p>
      ) : (
        loaded.map((module) => {
          const name = manifestFor(module.pluginId)?.productName ?? "Module";
          const silenced = module.muted || (anySolo && !module.solo);
          return (
            <article
              key={module.id}
              className={styles.strip}
              aria-label={`${name} channel`}
              data-silenced={silenced}
            >
              <h3 className={styles.name}>{name}</h3>

              <div className={styles.body}>
                <Fader
                  label={`${name} level`}
                  value={module.level}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.8}
                  onInput={(value) => {
                    previewChannelMix(module.id, "level", value);
                  }}
                  onCommit={(value, gestureId) => {
                    setChannelLevel(module.id, value, gestureId);
                  }}
                />
                <LevelMeter label={`${name} output`} level={meterLevels[module.id] ?? 0} />
              </div>

              <Fader
                label={`${name} pan`}
                value={module.pan}
                min={-1}
                max={1}
                step={0.01}
                defaultValue={0}
                onInput={(value) => {
                  previewChannelMix(module.id, "pan", value);
                }}
                onCommit={(value, gestureId) => {
                  setChannelPan(module.id, value, gestureId);
                }}
              />

              <div className={styles.buttons}>
                <Toggle
                  label={`Mute ${name}`}
                  caption="M"
                  tone="warn"
                  pressed={module.muted}
                  onToggle={() => {
                    toggleMute(module.id);
                  }}
                />
                <Toggle
                  label={`Solo ${name}`}
                  caption="S"
                  tone="accent"
                  pressed={module.solo}
                  onToggle={() => {
                    toggleSolo(module.id);
                  }}
                />
              </div>
            </article>
          );
        })
      )}

      <article className={styles.master} aria-label="Master channel">
        <h3 className={styles.name}>Master</h3>
        <Fader
          label="Master level"
          value={masterLevel}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.8}
          onInput={previewMasterLevel}
          onCommit={(value, gestureId) => {
            setMasterLevel(value, gestureId);
          }}
        />
      </article>
    </section>
  );
}
