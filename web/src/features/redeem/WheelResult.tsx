import type { Roll } from "@/domain/activity";
import styles from "./rewards.module.css";

export function WheelResult({ roll }: { roll: Roll }) {
  if (!roll.wheels) return <p>Wheel results require the latest database migration.</p>;
  return <ol className={styles.wheels} aria-label="Saved wheel results">
    {roll.wheels.map((symbol, index) => <li key={index}>
      <span>Wheel {index + 1}</span><strong>{symbol}</strong>
    </li>)}
  </ol>;
}
