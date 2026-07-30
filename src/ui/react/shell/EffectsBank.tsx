import { useAppStore } from "../store/app-store-context";
import styles from "./Shell.module.css";

const SENDS = ["A", "B", "C", "D"] as const;

export function EffectsBank() {
  const selectedSend = useAppStore((state) => state.selectedSend);
  const openSend = useAppStore((state) => state.openSend);

  return (
    <section className={styles.effectsBank} data-component="effects-bank" aria-label="Send chains">
      {SENDS.map((send) => {
        const selected = selectedSend === send;
        return (
          <article
            key={send}
            className={styles.effectCard}
            data-component="effect-slot"
            data-selected={selected}
          >
            <span className={styles.sendBadge}>{send}</span>
            <div>
              <h3>{`Send ${send}`}</h3>
              <p>Empty chain</p>
            </div>
            <button
              type="button"
              aria-expanded={selected}
              aria-controls={`send-${send.toLowerCase()}-details`}
              onClick={() => {
                openSend(send);
              }}
            >
              Details
            </button>
            {/* Rendered even when collapsed so the button's `aria-controls`
                always resolves to a real element. */}
            <p
              id={`send-${send.toLowerCase()}-details`}
              className={styles.effectDetails}
              hidden={!selected}
            >
              No effects are loaded. The chain returns silence to the mix bus.
            </p>
          </article>
        );
      })}
    </section>
  );
}
