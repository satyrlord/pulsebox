import { DEFAULT_MASTER_LEVEL } from "../../../state/public";
import { Fader } from "../controls/Fader";
import { LevelMeter } from "../controls/LevelMeter";
import { useAppStore } from "../store/app-store-context";
import { decibelsToGain, gainToDecibels, MINIMUM_FADER_DB } from "./fader-decibels";
import { masterMeterLevel } from "./master-meter";
import styles from "./Shell.module.css";

export function MasterPanel() {
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const meterLevels = useAppStore((state) => state.meterLevels);
  const previewMasterLevel = useAppStore((state) => state.previewMasterLevel);
  const setMasterLevel = useAppStore((state) => state.setMasterLevel);
  const level = masterMeterLevel(meterLevels, masterLevel);

  return (
    <section
      className={styles.masterPanel}
      data-component="master-panel"
      aria-label="Master routing"
    >
      <article>
        <h3>Output</h3>
        <div className={styles.masterOutput}>
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
            onCommit={(value, gestureId) => {
              setMasterLevel(value, gestureId);
            }}
          />
          <LevelMeter label="Master output level" level={level} width={12} height={120} />
        </div>
      </article>
      <article>
        <h3>Master chain</h3>
        <p>No master effects are loaded.</p>
      </article>
    </section>
  );
}
