import type { UsbMachine } from "./useUsbMachine";
import { parseOrder } from "./delivery";
import styles from "../rewards.module.css";

export function UsbMachinePanel({ machine }: { machine: UsbMachine }) {
  let names: string[] = [];
  try { names = parseOrder(machine.order); } catch {}
  return <section className={`${styles.summary} ${styles.machine}`} aria-label="USB slot machine">
    <h2>USB slot machine</h2>
    <p>Connect the motor ESP32 by USB. Close Serial Monitor and the control page so this page can use the port. Keep this page open during a spin.</p>
    {!machine.supported && <p>USB control requires desktop Chrome or Edge on HTTPS or localhost.</p>}
    <div className={styles.machineActions}>
      <button onClick={machine.connect} disabled={!machine.supported || machine.connected || machine.working}>Connect USB</button>
      <button onClick={machine.disconnect} disabled={!machine.connected || machine.working}>Disconnect USB</button>
      <button className={styles.stop} onClick={machine.stop} disabled={!machine.connected}>Stop machine</button>
    </div>
    <label htmlFor="reel-order">Physical sector order (0–7, same order as your calibration page)</label>
    <input id="reel-order" value={machine.order} onChange={event => machine.changeOrder(event.target.value)} disabled={machine.working} spellCheck={false}/>
    <p>Rose = jacqueminot; tong = tongs. Saved slot 1 opens servo 0, slot 2 opens servo 1, slot 3 opens servo 2, and slot 4 opens servo 3.</p>
    {machine.state && <p>Board positions: {machine.state.reels.map((reel, i) => `reel ${i + 1}: ${names[reel.sector] ?? "?"} (sector ${reel.sector})`).join(" · ")}</p>}
    <p>Available calibrated drawers: {machine.availableSlots.join(", ") || "none"}. Saved reel alignment is confirmed automatically on connection.</p>
    <label className={styles.check}><input type="checkbox" checked={machine.checked} onChange={event => machine.setChecked(event.target.checked)} disabled={machine.working}/><span>I checked the sector order, and only this page controls the machine.</span></label>
    <button onClick={machine.confirm} disabled={!machine.connected || !machine.checked || machine.working || Boolean(machine.unresolved) || Boolean(machine.storageError)}>Confirm sector order</button>
    <p>Each drawer is assumed closed immediately before its servo opens it. Winning drawers open for 3 seconds, stay open for 3 seconds, then close for 3 seconds.</p>
    <p role="status">{machine.storageError || machine.message}</p>
    {machine.unresolved && !machine.working && <div role="alert">
      <p>Delivery {machine.unresolved.id} needs inspection. Check the reels and the reward drawer, and resolve delivery manually before continuing. This result will not be replayed.</p>
      <button onClick={machine.inspect}>I inspected and resolved this delivery</button>
    </div>}
  </section>;
}
