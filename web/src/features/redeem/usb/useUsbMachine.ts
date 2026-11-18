"use client";
import { useEffect, useRef, useState } from "react";
import type { Roll } from "@/domain/activity";
import { UsbReelLink, type SerialPortLike } from "./link";
import { availableSlots, confirmSetup, DEFAULT_ORDER, deliverSavedRoll, parseOrder, readiness, resolveInspection, unresolvedReceipt, type DeliveryReceipt } from "./delivery";

type SerialNavigator = Navigator & { serial?: { requestPort(): Promise<SerialPortLike> } };
export function useUsbMachine() {
  const [link] = useState(() => new UsbReelLink());
  const [, render] = useState(0);
  const [supported, setSupported] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("Connect the motor ESP32 to spin physical reels.");
  const [receipt, setReceipt] = useState<DeliveryReceipt | null>(null);
  const [unresolved, setUnresolved] = useState<DeliveryReceipt | null>(null);
  const [storageError, setStorageError] = useState("");
  const operating = useRef(false);
  const confirmedNow = useRef(false);
  const orderNow = useRef(DEFAULT_ORDER);
  useEffect(() => {
    queueMicrotask(() => {
      setSupported(Boolean((navigator as SerialNavigator).serial) && window.isSecureContext);
      try { orderNow.current = localStorage.getItem("slottyOrder") ?? DEFAULT_ORDER; setOrder(orderNow.current); setUnresolved(unresolvedReceipt(localStorage) ?? null); }
      catch { setStorageError("USB history is unavailable. Enable browser storage before using the machine."); }
    });
    const unsubscribe = link.subscribe(event => {
      if (event.kind === "fault") { confirmedNow.current = false; setConfirmed(false); setChecked(false); setMessage(event.reason); }
      render(n => n + 1);
    });
    return () => { unsubscribe(); void link.disconnect(); };
  }, [link]);
  useEffect(() => {
    if (!working) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [working]);
  function changeOrder(value: string) { orderNow.current = value; confirmedNow.current = false; setOrder(value); setConfirmed(false); setChecked(false); }
  async function run(action: () => Promise<void>) {
    if (operating.current) return;
    operating.current = true; setWorking(true);
    try { await action(); }
    catch (error) { setMessage((error as Error).message); }
    finally {
      operating.current = false; setWorking(false);
      try { setUnresolved(unresolvedReceipt(localStorage) ?? null); }
      catch { setStorageError("USB delivery history could not be read. Inspect the machine."); }
    }
  }
  function connect() {
    // requestPort must be invoked directly from the user's click, before any await.
    const serial = (navigator as SerialNavigator).serial;
    if (!serial || operating.current) return;
    const port = serial.requestPort();
    void run(async () => {
      await link.connect(await port); parseOrder(orderNow.current);
      localStorage.setItem("slottyOrder", orderNow.current);
      confirmedNow.current = true; setConfirmed(true);
      setMessage("USB connected. Saved alignment confirmed automatically. Drawers are assumed closed before opening. Machine ready.");
    });
  }
  function preflight(allocations?: number[]) {
    if (storageError) throw new Error(storageError);
    if (unresolvedReceipt(localStorage)) throw new Error("Inspect and resolve the interrupted delivery first.");
    parseOrder(orderNow.current);
    if (!confirmedNow.current) throw new Error("Reconnect USB or confirm the sector order first.");
    const slots = allocations?.flatMap((amount, index) => amount > 0 ? [index + 1] : []);
    const problem = readiness(link.state, link.fresh, true, slots); if (problem) throw new Error(problem);
  }
  async function deliver(roll: Roll) {
    if (operating.current) throw new Error("A machine operation is already running.");
    preflight();
    operating.current = true; setWorking(true);
    try {
      await deliverSavedRoll(link, roll, parseOrder(orderNow.current), localStorage, value => { setReceipt(value); setMessage(value.message); });
    } finally {
      operating.current = false; setWorking(false);
      setUnresolved(unresolvedReceipt(localStorage) ?? null);
    }
  }
  return {
    supported, connected: link.attached, state: link.state, availableSlots: availableSlots(link.state), working, message, receipt, unresolved, storageError,
    checked, setChecked, order, changeOrder, connect, deliver, preflight,
    ready: confirmed && !working && !storageError && !unresolved && readiness(link.state, link.fresh) === null,
    confirm: () => void run(async () => {
      if (!checked) throw new Error("Check the sector-order confirmation box first.");
      parseOrder(order); localStorage.setItem("slottyOrder", order);
      await confirmSetup(link); confirmedNow.current = true; setConfirmed(true); setChecked(false); setMessage("Machine ready. Spin now will move the reels and open the winning drawer.");
    }),
    disconnect: () => void run(async () => { await link.disconnect(); }),
    stop: () => { confirmedNow.current = false; setConfirmed(false); setChecked(false); void link.send("STOP").then(reply => setMessage(reply.text), error => setMessage((error as Error).message)); },
    inspect: () => { try { resolveInspection(localStorage); setUnresolved(unresolvedReceipt(localStorage) ?? null); confirmedNow.current = false; setConfirmed(false); setChecked(false); setMessage("Inspection recorded. Confirm setup again before a new roll. The inspected roll will not replay."); } catch (error) { setMessage((error as Error).message); } },
  };
}
export type UsbMachine = ReturnType<typeof useUsbMachine>;
