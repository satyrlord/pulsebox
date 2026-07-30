import { DEFAULT_MASTER_LEVEL, DEFAULT_MODULE_LEVEL } from "../../../state/public";
import { Fader } from "../controls/Fader";
import { Knob } from "../controls/Knob";
import { LevelMeter } from "../controls/LevelMeter";
import { Toggle } from "../controls/Toggle";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { masterMeterLevel } from "./master-meter";
import styles from "./Mixer.module.css";

const SENDS = ["A", "B", "C", "D"] as const;
const MINIMUM_FADER_DB = -60;

function gainToDecibels(gain: number): number {
  return gain <= 0 ? MINIMUM_FADER_DB : Math.max(MINIMUM_FADER_DB, 20 * Math.log10(gain));
}

function decibelsToGain(decibels: number): number {
  return decibels <= MINIMUM_FADER_DB ? 0 : 10 ** (decibels / 20);
}

export function Mixer() {
  const { visibleSlotCount, manifestFor } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const meterLevels = useAppStore((state) => state.meterLevels);
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
  const setStudioView = useAppStore((state) => state.setStudioView);
  const visible = rackSlots.slice(0, visibleSlotCount);
  const loaded = visible.flatMap((slot) => {
    const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
    return module === undefined ? [] : [module];
  });
  const anySolo = loaded.some((module) => module.solo);
  const masterMeter = masterMeterLevel(meterLevels, masterLevel);

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
              <span className={styles.emptyText}>Empty</span>
              <div className={styles.emptyFader} aria-hidden="true">
                <i />
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
                    {send}
                  </button>
                ))}
              </div>
              {/* An empty channel has nothing to mute or solo. The placeholders
                  are marked decorative so assistive technology is not offered
                  two controls that do not exist. */}
              <div className={styles.muteSolo} aria-hidden="true">
                <i>M</i>
                <i>S</i>
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
              <LevelMeter
                label={`${name} output`}
                level={meterLevels[module.id] ?? 0}
                width={6}
                height={120}
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
                  {send}
                </button>
              ))}
            </div>
            <div className={styles.muteSolo}>
              <Toggle
                label={`Mute ${name}`}
                caption="M"
                tone="warn"
                pressed={module.muted}
                onToggle={() => toggleMute(module.id)}
              />
              <Toggle
                label={`Solo ${name}`}
                caption="S"
                tone="accent"
                pressed={module.solo}
                onToggle={() => toggleSolo(module.id)}
              />
            </div>
          </article>
        );
      })}

      <article className={styles.master} aria-label="Master channel" data-component="master-strip">
        <button
          type="button"
          className={styles.channelName}
          aria-label="Open the master channel"
          title="Open the master channel."
          onClick={() => setStudioView("master")}
        >
          MIX
        </button>
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
          <LevelMeter label="Master output" level={masterMeter} width={6} height={164} />
        </div>
      </article>
    </section>
  );
}
