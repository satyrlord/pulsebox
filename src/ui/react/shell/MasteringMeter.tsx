import { LevelMeter } from "../controls/LevelMeter";
import { useAppStore } from "../store/app-store-context";
import styles from "./Shell.module.css";

const MINIMUM_DBTP = -60;

function formatTruePeak(level: number): string {
  if (level <= 0) return `${MINIMUM_DBTP.toFixed(1)} dBTP`;
  return `${Math.max(MINIMUM_DBTP, 20 * Math.log10(level)).toFixed(1)} dBTP`;
}

export function MasteringMeter() {
  const meterMode = useAppStore((state) => state.meterMode);
  const toggleMeterMode = useAppStore((state) => state.toggleMeterMode);
  const left = useAppStore((state) => meterMode === "lr"
    ? state.masterMeter.truePeakLeft
    : state.masterMeter.truePeakMid);
  const right = useAppStore((state) => meterMode === "lr"
    ? state.masterMeter.truePeakRight
    : state.masterMeter.truePeakSide);
  const clipped = useAppStore((state) => state.masterPeakHeld);
  const resetMasterPeak = useAppStore((state) => state.resetMasterPeak);
  const maximum = Math.max(left, right);

  return (
    <aside
      className={styles.masteringMeter}
      data-component="mastering-meter"
      aria-label="Master true peak meter"
    >
      <div className={styles.masteringMeterHeading}>
        <span>True peak</span>
        <output aria-label="Master true peak level">{formatTruePeak(maximum)}</output>
      </div>
      <div className={styles.masteringMeterScale} aria-hidden="true">
        <span>0</span>
        <span>-6</span>
        <span>-12</span>
        <span>-24</span>
        <span>-48</span>
      </div>
      <div className={styles.masteringMeterLadders}>
        <div>
          <LevelMeter label={`Master true peak ${meterMode === "lr" ? "left" : "mid"}`} level={left} width={10} stretch />
          <span aria-hidden="true">{meterMode === "lr" ? "L" : "M"}</span>
        </div>
        <div>
          <LevelMeter label={`Master true peak ${meterMode === "lr" ? "right" : "side"}`} level={right} width={10} stretch />
          <span aria-hidden="true">{meterMode === "lr" ? "R" : "S"}</span>
        </div>
      </div>
      <div className={styles.masteringMeterActions}>
        <button
          type="button"
          className={styles.masteringMeterMode}
          aria-label={meterMode === "lr" ? "Master meter mode: left and right" : "Master meter mode: mid and side"}
          aria-pressed={meterMode === "ms"}
          title={meterMode === "lr" ? "Show mid and side." : "Show left and right."}
          onClick={toggleMeterMode}
        >
          {meterMode === "lr" ? "L/R" : "M/S"}
        </button>
        <button
          type="button"
          className={styles.masteringClip}
          data-clipped={clipped}
          aria-label="Reset master true peak clip"
          aria-pressed={clipped}
          title={clipped ? "True peak clipping detected. Reset indicator." : "No true peak clipping detected."}
          onClick={resetMasterPeak}
        >
          TP
        </button>
      </div>
    </aside>
  );
}
