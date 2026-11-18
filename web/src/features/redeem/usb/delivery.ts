import type { Roll } from "@/domain/activity";
import { wheelCommand, WHEEL_SYMBOLS, type WheelSymbol } from "@/domain/rolls/wheels";
import { UsbReelLink, type BoardState } from "./link";

export const DEFAULT_ORDER = "hammer,garnet,rose,tong,hammer,garnet,rose,tong";
const JOURNAL_KEY = "slotty-usb-deliveries-v1";
type Phase = "spinning" | "landed" | "opening" | "finished" | "refused" | "unconfirmed" | "inspected";
export type DeliveryReceipt = { id: string; signature: string; phase: Phase; targets: number[]; message: string };
type Journal = Record<string, DeliveryReceipt>;
export type ReceiptStorage = Pick<Storage, "getItem" | "setItem">;

export function parseOrder(value: string): WheelSymbol[] {
  const aliases: Record<string, WheelSymbol> = { rose: "jacqueminot", tong: "tongs", hammers: "hammer" };
  const names = value.toLowerCase().split(",").map(name => aliases[name.trim()] ?? name.trim());
  if (names.length !== 8 || names.some(name => !(WHEEL_SYMBOLS as readonly string[]).includes(name)) || WHEEL_SYMBOLS.some(name => names.filter(n => n === name).length !== 2))
    throw new Error("Enter eight sectors in physical order, with each of hammer, garnet, rose and tong appearing twice.");
  return names as WheelSymbol[];
}
function journal(storage: ReceiptStorage): Journal {
  const raw = storage.getItem(JOURNAL_KEY);
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.entries(value).some(([id, r]) => {
    const record = r as DeliveryReceipt;
    return !record || record.id !== id || typeof record.signature !== "string" || !["spinning", "landed", "opening", "finished", "refused", "unconfirmed", "inspected"].includes(record.phase) || !Array.isArray(record.targets) || record.targets.length !== 3 || record.targets.some(t => !Number.isInteger(t) || t < 0 || t > 7);
  })) throw new Error("USB delivery history is unreadable. Inspect the machine; do not clear history to retry a roll.");
  return value as Journal;
}
export function savedReceipt(storage: ReceiptStorage, id: string) { return journal(storage)[id]; }
export function unresolvedReceipt(storage: ReceiptStorage) {
  return Object.values(journal(storage)).find(r => ["spinning", "landed", "opening", "unconfirmed"].includes(r.phase));
}
function save(storage: ReceiptStorage, record: DeliveryReceipt) {
  const value = JSON.stringify({ ...journal(storage), [record.id]: record });
  storage.setItem(JOURNAL_KEY, value);
  if (storage.getItem(JOURNAL_KEY) !== value) throw new Error("Cannot save the USB delivery receipt. Motion is blocked.");
}
export function resolveInspection(storage: ReceiptStorage) {
  const record = unresolvedReceipt(storage);
  if (record) save(storage, { ...record, phase: "inspected", message: "Operator inspected and resolved this delivery. It will not be replayed." });
}
export function availableSlots(state: BoardState | null): number[] {
  return state?.servoBoard ? state.drawers.flatMap((drawer, index) => drawer.calibrated ? [index + 1] : []) : [];
}
export function readiness(state: BoardState | null, fresh: boolean, requireAlignment = true, slots?: number[]): string | null {
  if (!state || !fresh) return "Connect the USB motor board and wait for a fresh heartbeat.";
  if (state.spinning || state.reels.some(r => r.moving) || state.drawers.some(d => [2, 4, 5].includes(d.phase))) return "Wait for all motion to stop.";
  if (state.drivers !== 7) return "All three motor drivers must respond. Check the 24 V supply.";
  const selected = slots ?? availableSlots(state);
  if (!state.servoBoard || !selected.length) return "At least one drawer needs saved, confirmed calibration.";
  if (selected.some(slot => !Number.isInteger(slot) || slot < 1 || slot > 4 || !state.drawers[slot - 1].calibrated)) return "Allocate tokens only to calibrated drawers.";
  if (requireAlignment && !state.aligned) return "Reconnect USB to confirm the saved reel alignment.";
  return null;
}
export async function confirmSetup(link: UsbReelLink) {
  const problem = readiness(link.state, link.fresh, false); if (problem) throw new Error(problem);
  const reply = await link.send("ALIGNED 1"); if (!reply.ok) throw new Error(reply.text);
  const next = link.waitFor(event => event.kind === "state" && readiness(event.state, link.fresh) === null, 3000);
  try { await next.promise; } finally { next.cancel(); }
}

export async function deliverSavedRoll(link: UsbReelLink, roll: Roll, order: WheelSymbol[], storage: ReceiptStorage, progress: (receipt: DeliveryReceipt) => void) {
  const command = wheelCommand(roll);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(command.eventId)) throw new Error("Invalid saved roll ID.");
  // Revalidate even callers outside the setup UI, before recording or moving anything.
  parseOrder(order.join(","));
  const signature = JSON.stringify(command);
  const existing = savedReceipt(storage, roll.id);
  if (existing && existing.signature !== signature) throw new Error("This roll ID already has a different USB payload. Motion blocked.");
  if (existing && existing.phase !== "refused") {
    progress(existing);
    if (existing.phase === "finished" || existing.phase === "inspected") return existing;
    throw new Error("This delivery needs inspection. It will not be spun or opened again automatically.");
  }
  if (unresolvedReceipt(storage)) throw new Error("Resolve the interrupted USB delivery before starting another roll.");
  const problem = readiness(link.state, link.fresh, true, command.winningSlot === null ? undefined : [command.winningSlot]); if (problem) throw new Error(problem);
  // Either occurrence of a duplicated symbol is valid. Keep the resolved sectors in the receipt.
  const random = new Uint32Array(3); crypto.getRandomValues(random);
  const targets = command.wheels.map((name, i) => order.map((n, k) => n === name ? k : -1).filter(k => k >= 0)[random[i] % 2]);
  let record: DeliveryReceipt = { id: roll.id, signature, targets, phase: "spinning", message: "Spinning to the saved result…" };
  const update = (phase: Phase, message: string) => { record = { ...record, phase, message }; save(storage, record); progress(record); };
  // USB has no firmware event receipts. Persist BEFORE sending, and never replay uncertainty.
  update("spinning", record.message);
  const landed = link.waitFor(event => event.kind === "line" && /^E LANDED /.test(event.line));
  try {
    const angles = targets.map(sector => sector * 4500 + 2250);
    const accepted = await link.send(`SPIN ${angles[0]} ${angles[1]} ${angles[2]}`);
    if (!accepted.ok) { update("refused", `Board refused the spin: ${accepted.text}`); throw new Error(record.message); }
    const event = await landed.promise;
    if (event.kind !== "line" || event.line !== `E LANDED ${targets.join(" ")}`) throw new Error("The board's landing report differs from the saved targets. Drawer opening blocked.");
    const settled = link.waitFor(e => e.kind === "state" && !e.state.spinning && e.state.reels.every(r => !r.moving));
    try { await settled.promise; } finally { settled.cancel(); }
    if (!link.fresh || !link.state?.aligned || link.state.reels.some((r, i) => r.sector !== targets[i])) throw new Error("Reel state did not confirm the requested landing. Inspect the reels.");
    update("landed", "Board reported the saved reel positions.");
    if (command.winningSlot !== null) {
      const drawer = command.winningSlot - 1;
      if (!link.state.servoBoard || !link.state.drawers[drawer].calibrated || [2, 4, 5].includes(link.state.drawers[drawer].phase)) throw new Error("Winning drawer is uncalibrated or still moving.");
      update("opening", `Opening drawer ${command.winningSlot}…`);
      // Operator policy: each opening starts from an assumed manually closed drawer.
      // This changes only the board's phase; it never drives the servo closed.
      const marked = await link.send(`DMARK ${drawer} closed`);
      if (!marked.ok) throw new Error(marked.text);
      const opened = link.waitFor(e => e.kind === "state" && e.state.drawers[drawer].phase === 3, 35_000);
      try {
        const reply = await link.send(`DOPEN ${drawer}`); if (!reply.ok) throw new Error(reply.text);
        await opened.promise;
      } finally { opened.cancel(); }
    }
    update("finished", command.winningSlot === null ? "Board reported the saved reel positions. No drawer opened." : `Board reported drawer ${command.winningSlot} open. Collect your reward and close it by hand.`);
    return record;
  } catch (error) {
    if (record.phase !== "refused") update("unconfirmed", `${(error as Error).message} Inspect this delivery; do not roll or pay again.`);
    throw error;
  } finally { landed.cancel(); }
}
