import { useEffect } from "react";

import { SILENT_MASTER_METER } from "../store/app-store";
import { useAppContext, useDependencies } from "../store/app-store-context";

/** Master analysis publishes at most this often, matching the meter protocol. */
const METER_INTERVAL_MILLISECONDS = 33;

/**
 * Drives the playhead and the header master meters from the audio clock, never
 * the other way round. The loop pauses while the document is hidden and is torn
 * down on unmount, so StrictMode's second mount cannot leave two loops running.
 */
export function useAudioPosition(): void {
  const { store } = useAppContext();
  const { audio } = useDependencies();

  useEffect(() => {
    let frame = 0;
    let running = true;
    let lastMeterAt = 0;

    const tick = () => {
      if (!running) return;
      const state = store.getState();
      state.setPositionTicks(audio.getPositionTicks());
      // The meters read the real analysis branch only while the transport
      // runs. While stopped they hold at silence: no fake motion.
      if (state.project.transport.status === "playing" && audio.getMasterMeter !== undefined) {
        const now = performance.now();
        if (now - lastMeterAt >= METER_INTERVAL_MILLISECONDS) {
          lastMeterAt = now;
          state.setMasterMeterFrame(audio.getMasterMeter());
        }
      } else {
        state.setMasterMeterFrame(SILENT_MASTER_METER);
      }
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        return;
      }
      start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [audio, store]);
}
