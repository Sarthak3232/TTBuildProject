"use client";
import { useEffect, useRef, useState } from "react";
import type { Roll } from "@/domain/activity";
import { useApp } from "@/features/app/AppProvider";
import { mutation, ClientError } from "@/features/app/client";
import { winThreshold } from "@/domain/rolls/probability";
import { WalletHistory } from "./WalletHistory";
import { WheelResult } from "./WheelResult";
import { useUsbMachine } from "./usb/useUsbMachine";
import { UsbMachinePanel } from "./usb/UsbMachinePanel";
import styles from "./rewards.module.css";

type Pending = { key: string; allocations: number[] };
export function RewardPreview() {
  const { data, refresh, online } = useApp();
  const machine = useUsbMachine();
  const committing = useRef(false);
  const [allocations, setAllocations] = useState([0, 0, 0, 0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Roll | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const storageKey = `slotty-pending-roll:${data?.profile.email ?? ""}`;
  useEffect(() => {
    if (!data?.profile.email) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved) as Pending;
        queueMicrotask(() => { setPending(value); setAllocations(value.allocations); });
      }
    } catch { sessionStorage.removeItem(storageKey); }
  }, [storageKey, data?.profile.email]);
  const balance = data?.balance ?? 0;
  const total = allocations.reduce((a, b) => a + b, 0);
  const chance = total > 0 ? data?.testWins ? 1 : winThreshold(total) / 1000000 : 0;
  const roll = result ?? data?.latestRoll;
  const locked = busy || machine.working || Boolean(pending);
  function change(index: number, amount: number) {
    setAllocations(current => current.map((n, i) => i === index ? n + amount : n));
  }
  async function sendSaved(saved: Roll) {
    setBusy(true); setNotice("");
    try { await machine.deliver(saved); }
    catch (error) { setNotice(`Your result is saved. ${(error as Error).message} No new payment or roll is needed.`); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (committing.current) return;
    committing.current = true; setBusy(true); setNotice("");
    let accepted = false;
    let recoveryNeeded = Boolean(pending);
    try {
      // Readiness is checked before accepting a new charge. Recovery only reads
      // the original idempotent result, even if the USB board is now disconnected.
      if (!pending) machine.preflight(allocations);
      const request = pending ?? { key: crypto.randomUUID(), allocations };
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request); recoveryNeeded = true;
      const response = await mutation<{ roll: Roll }>("/api/rolls", { allocations: request.allocations }, "POST", request.key);
      accepted = true; setResult(response.roll); sessionStorage.removeItem(storageKey);
      setPending(null); setAllocations([0, 0, 0, 0]);
      void refresh().catch(() => {});
      await machine.deliver(response.roll);
    } catch (error) {
      if (accepted) setNotice(`Your result is saved. ${(error as Error).message} Use the saved result below; do not pay or roll again.`);
      else if (error instanceof ClientError && [400, 403, 409, 422].includes(error.status)) {
        sessionStorage.removeItem(storageKey); setPending(null); setNotice(error.message);
      } else setNotice(`${(error as Error).message}${recoveryNeeded ? " Use Recover roll to retrieve the same accepted outcome without another charge." : ""}`);
      void refresh().catch(() => {});
    } finally { committing.current = false; setBusy(false); }
  }
  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><span>Slotty</span><span>Physical rewards</span></div>
      <h1>WELL EARNED.</h1><p>Spend tokens, spin the physical reels, and collect a winning reward.</p>
    </header>
    <UsbMachinePanel machine={machine}/>
    {data?.testWins && <p role="status">100% win test mode: new rolls always win with three matching symbols. Tokens are still spent. Previously saved results stay unchanged.</p>}
    <section className={styles.balance} aria-label="Token balance">
      <div><h2>Available tokens</h2><span aria-hidden="true">◎</span></div>
      <p><strong>{data ? balance : "…"}</strong> tokens</p>
    </section>
    <h2 className={styles.heading}>Choose your slot</h2>
    <div className={styles.slots}>{allocations.map((value, index) => <section className={styles.slot} key={index}>
      <h3>Slot {index + 1}</h3><div className={styles.controls}>
        <button aria-label={`Remove one token from slot ${index + 1}`} disabled={value === 0 || locked} onClick={() => change(index, -1)}>−</button>
        <output aria-label={`Slot ${index + 1} allocation`}>{value}</output><span>{value === 1 ? "token" : "tokens"}</span>
        <button aria-label={`Add one token to slot ${index + 1}`} disabled={total >= balance || value >= 1000000 || locked || !machine.availableSlots.includes(index + 1)} onClick={() => change(index, 1)}>+</button>
      </div><p>{machine.availableSlots.includes(index + 1) ? "A win opens this drawer after the reels land" : "Unavailable until drawer calibration is confirmed"}</p>
    </section>)}</div>
    <section className={styles.summary}>
      <h2>Your allocation</h2><dl>
        <div><dt>Total stake</dt><dd>{total} tokens</dd></div>
        <div><dt>Remaining after roll</dt><dd>{balance - total}</dd></div>
        <div><dt>Overall win probability</dt><dd>{(chance * 100).toFixed(1)}%</dd></div>
      </dl>
      <ul>{allocations.map((value, index) => <li key={index}>Slot {index + 1}: {total ? (value / total * 100).toFixed(1) : "0.0"}% conditional on a win · {total ? (chance * value / total * 100).toFixed(1) : "0.0"}% overall</li>)}</ul>
      <p>First decide win or no win, then choose one funded slot by token weight. The full stake is spent on both wins and losses. Results are final and saved.</p>
      <button className={styles.roll} disabled={busy || machine.working || !online || !data || (!pending && (!machine.ready || total === 0 || total > balance))} onClick={() => void commit()}>
        {busy ? "Processing saved roll…" : pending ? "Recover roll" : "Spin now"}
      </button><p role="status" className="live-error">{notice}</p>
    </section>
    {roll && <section className={styles.summary} aria-label="Saved roll result">
      <h2>{roll.won ? `You won slot ${roll.slot}!` : "No win this time."}</h2><WheelResult roll={roll}/>
      <p>Spent {roll.cost} tokens · roll {roll.id}</p>
      <p>{roll.won ? "Your winning entitlement is saved." : "No entitlement was created. Your tokens were spent and this outcome is saved."}</p>
      <p>{machine.receipt?.id === roll.id ? machine.receipt.message : "USB delivery has not been confirmed on this page."}</p>
      <button onClick={() => void sendSaved(roll)} disabled={busy || !machine.ready || !roll.wheels || (machine.receipt?.id === roll.id && ["finished", "inspected"].includes(machine.receipt.phase))}>Send saved result to machine</button>
      <p>Uses this saved roll without another token charge. Completed or uncertain USB deliveries are never replayed automatically.</p>
      <p>{new Date(roll.createdAt).toLocaleString()}</p>
    </section>}
    <WalletHistory onRoll={value => { setResult(value); window.scrollTo({ top: 0, behavior: "smooth" }); }}/>
    <p className={styles.preview}>The machine uses the saved wheel symbols and the saved winning slot. Winning drawers open for 3 seconds, stay open for 3 seconds, then close for 3 seconds.</p>
  </div>;
}
