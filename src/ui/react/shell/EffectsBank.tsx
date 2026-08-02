import { useAppStore } from "../store/app-store-context";
import styles from "./Shell.module.css";

const SENDS = ["A", "B", "C", "D"] as const;

export function EffectsBank() {
  const selectedSend = useAppStore((state) => state.selectedSend);

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
            aria-current={selected ? "true" : undefined}
          >
            <span className={styles.sendBadge}>{send}</span>
            <div>
              <h3>{`Send ${send}`}</h3>
              <p>Empty chain</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
