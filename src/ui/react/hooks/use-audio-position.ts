import { useEffect } from "react";

import { useAppContext, useDependencies } from "../store/app-store-context";

/**
 * Drives the playhead from the audio clock, never the other way round. The loop
 * pauses while the document is hidden and is torn down on unmount, so
 * StrictMode's second mount cannot leave two loops running.
 */
export function useAudioPosition(): void {
  const { store } = useAppContext();
  const { audio } = useDependencies();

  useEffect(() => {
    let frame = 0;
    let running = true;

    const tick = () => {
      if (!running) return;
      store.getState().setPositionTicks(audio.getPositionTicks());
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
