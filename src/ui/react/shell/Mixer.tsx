import type { ModuleInstanceId } from "../../../contracts";
import { DEFAULT_MASTER_LEVEL, DEFAULT_MODULE_LEVEL } from "../../../state/public";
import { Fader } from "../controls/Fader";
import { Knob } from "../controls/Knob";
import { LevelMeter } from "../controls/LevelMeter";
import { Toggle } from "../controls/Toggle";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { decibelsToGain, gainToDecibels, MINIMUM_FADER_DB } from "./fader-decibels";
import { masterMeterLevel } from "./master-meter";
import styles from "./Mixer.module.css";

const SENDS = ["A", "B", "C", "D"] as const;

/**
 * Leaf meter subscription for one strip. Meter frames arrive per animation
 * frame, so only this small component re-renders, not the nine-strip mixer.
 */
function StripMeter(props: { readonly moduleId: ModuleInstanceId; readonly label: string }) {
  const level = useAppStore((state) => state.meterLevels[props.moduleId] ?? 0);
  return <LevelMeter label={props.label} level={level} width={6} stretch />;
}

/** Leaf meter subscription for the master strip, for the same reason. */
function MasterStripMeter(props: { readonly masterLevel: number }) {
  const level = useAppStore((state) => masterMeterLevel(state.meterLevels, props.masterLevel));
  return <LevelMeter label="Master output" level={level} width={6} stretch />;
}

export function Mixer() {
  const { visibleSlotCount, manifestFor } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const toggleMute = useAppStore((state) => state.toggleMute);
  const toggleSolo = useAppStore((state) => state.toggleSolo);
  const setChannelLevel = useAppStore((state) => state.setChannelLevel);
  const setChannelPan = useAppStore((state) => state.setChannelPan);
  const setMasterLevel = useAppStore((state) => state.setMasterLevel);
  const previewChannelMix = useAppStore((state) => state.previewChannelMix);
  const previewMasterLevel = useAppStore((state) => state.previewMasterLevel);
  const selectModule = useAppStore((state) => state.selectModule);
  const openSend = useAppStore((state) => state.openSend);
  const visible = rackSlots.slice(0, visibleSlotCount);
  const loaded = visible.flatMap((slot) => {
    const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
    return module === undefined ? [] : [module];
  });
  const anySolo = loaded.some((module) => module.solo);

  return (
    <section className={styles.mixer} data-component="mixer" aria-label="Mixer">
      {visible.map((slot, index) => {
        const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
        const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
        const slotNumber = String(index + 1).padStart(2, "0");
        if (module === undefined || manifest === undefined) {
          return (
            <article
              key={slot.id}
              className={styles.emptyStrip}
              aria-label={`Rack slot ${slotNumber}, Empty channel`}
              data-component="channel-strip"
              data-empty="true"
            >
              <strong>{slotNumber}</strong>
              {/* The empty channel keeps the loaded strip's silhouette. Each
                  visible control is disabled until the user loads a module. */}
              <div className={styles.panControl}>
                <Knob
                  controlId="pan"
                  label={`Rack slot ${slotNumber} pan`}
                  caption="Pan"
                  value={0}
                  min={-1}
                  max={1}
                  step={0.01}
                  defaultValue={0}
                  precision={2}
                  disabled
                  onInput={() => undefined}
                  onCommit={() => undefined}
                />
              </div>
              <div className={styles.sendGrid} aria-label={`Rack slot ${slotNumber} sends`}>
                {SENDS.map((send) => (
                  <button
                    key={send}
                    type="button"
                    disabled
                    aria-label={`Send ${send}, rack slot ${slotNumber}, no module loaded`}
                    title={`Send ${send} is unavailable. Rack slot ${slotNumber} has no module.`}
                  >
                    <span data-part="send-label" aria-hidden="true">
                      {send}
                    </span>
                  </button>
                ))}
              </div>
              <div className={`${styles.faderWell} ${styles.emptyFader}`}>
                <Fader
                  label={`Rack slot ${slotNumber} level`}
                  value={DEFAULT_MODULE_LEVEL}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={DEFAULT_MODULE_LEVEL}
                  unit="dB"
                  precision={1}
                  formatValue={gainToDecibels}
                  parseValue={decibelsToGain}
                  displayMin={MINIMUM_FADER_DB}
                  displayMax={0}
                  displayStep={0.1}
                  disabled
                  onInput={() => undefined}
                  onCommit={() => undefined}
                />
                <LevelMeter
                  label={`Rack slot ${slotNumber} output`}
                  level={0}
                  width={6}
                  stretch
                  inert
                  hiddenFromAssistiveTechnology
                />
              </div>
              <div className={styles.muteSolo}>
                <Toggle
                  label={`Solo rack slot ${slotNumber}, no module loaded`}
                  caption="S"
                  tone="warn"
                  pressed={false}
                  disabled
                  onToggle={() => undefined}
                />
                <Toggle
                  label={`Mute rack slot ${slotNumber}, no module loaded`}
                  caption="M"
                  tone="neutral"
                  pressed={false}
                  disabled
                  onToggle={() => undefined}
                />
              </div>
            </article>
          );
        }

        const name = manifest.productName;
        const silenced = module.muted || (anySolo && !module.solo);
        return (
          <article
            key={module.id}
            className={styles.strip}
            aria-label={`${name} channel`}
            data-component="channel-strip"
            data-silenced={silenced}
            data-selected={selectedModuleId === module.id}
            style={{ "--module-accent": manifest.ui.moduleAccent.accent } as React.CSSProperties}
          >
            <button
              type="button"
              className={styles.channelName}
              aria-pressed={selectedModuleId === module.id}
              aria-label={`Select ${name} channel`}
              onClick={() => selectModule(module.id)}
            >
              {manifest.shortLabel}
            </button>
            <div className={styles.panControl}>
              <Knob
                controlId="pan"
                label={`${name} pan`}
                caption="Pan"
                value={module.pan}
                min={-1}
                max={1}
                step={0.01}
                defaultValue={0}
                precision={2}
                onInput={(value) => previewChannelMix(module.id, "pan", value)}
                onCommit={(value, gestureId) => setChannelPan(module.id, value, gestureId)}
              />
            </div>
            <div className={styles.sendGrid} aria-label={`${name} sends`}>
              {SENDS.map((send) => (
                <button
                  key={send}
                  type="button"
                  aria-label={`Open send ${send} for ${name}`}
                  title={`Open send ${send} for ${name}.`}
                  onClick={() => openSend(send)}
                >
                  <span data-part="send-label" aria-hidden="true">
                    {send}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.faderWell}>
              <Fader
                label={`${name} level`}
                value={module.level}
                min={0}
                max={1}
                step={0.01}
                defaultValue={DEFAULT_MODULE_LEVEL}
                unit="dB"
                precision={1}
                formatValue={gainToDecibels}
                parseValue={decibelsToGain}
                displayMin={MINIMUM_FADER_DB}
                displayMax={0}
                displayStep={0.1}
                onInput={(value) => previewChannelMix(module.id, "level", value)}
                onCommit={(value, gestureId) => setChannelLevel(module.id, value, gestureId)}
              />
              <StripMeter moduleId={module.id} label={`${name} output`} />
            </div>
            {/* Solo leads and mute follows. Solo uses warning. Mute uses a neutral cap. */}
            <div className={styles.muteSolo}>
              <Toggle
                label={`Solo ${name}`}
                caption="S"
                tone="warn"
                pressed={module.solo}
                onToggle={() => toggleSolo(module.id)}
              />
              <Toggle
                label={`Mute ${name}`}
                caption="M"
                tone="neutral"
                pressed={module.muted}
                onToggle={() => toggleMute(module.id)}
              />
            </div>
          </article>
        );
      })}

      <article className={styles.master} aria-label="Master channel" data-component="master-strip">
        <span className={styles.channelName}>
          MIX
        </span>
        <div className={styles.faderWell}>
          <Fader
            label="Master level"
            value={masterLevel}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_MASTER_LEVEL}
            unit="dB"
            precision={1}
            formatValue={gainToDecibels}
            parseValue={decibelsToGain}
            displayMin={MINIMUM_FADER_DB}
            displayMax={0}
            displayStep={0.1}
            onInput={previewMasterLevel}
            onCommit={(value, gestureId) => setMasterLevel(value, gestureId)}
          />
          <MasterStripMeter masterLevel={masterLevel} />
        </div>
      </article>
    </section>
  );
}
