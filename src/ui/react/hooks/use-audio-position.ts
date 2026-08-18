import { useEffect } from "react";

import { masterMeterFrameFor, SILENT_MASTER_METER } from "../store/app-store";
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
      // Only a real analysis read waits for the publish interval. Silence costs
      // nothing to produce, and the store drops an unchanged frame anyway.
      const now = performance.now();
      const analyzing =
        state.audioRuntimeState === "active" &&
        state.project.transport.status === "playing";
      if (!analyzing || now - lastMeterAt >= METER_INTERVAL_MILLISECONDS) {
        if (analyzing) lastMeterAt = now;
        state.setMasterMeterFrame(
          masterMeterFrameFor(
            state.audioRuntimeState,
            state.project.transport.status,
            audio.getMasterMeter,
          ),
        );
        if (state.studioView === "master") {
          state.setMasterChainMeterFrames(
            masterMeterFrameFor(
              state.audioRuntimeState,
              state.project.transport.status,
              audio.getMasterChainMeter === undefined
                ? undefined
                : () => audio.getMasterChainMeter?.("pre") ?? SILENT_MASTER_METER,
            ),
            masterMeterFrameFor(
              state.audioRuntimeState,
              state.project.transport.status,
              audio.getMasterChainMeter === undefined
                ? undefined
                : () => audio.getMasterChainMeter?.("post") ?? SILENT_MASTER_METER,
            ),
          );
        }
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
