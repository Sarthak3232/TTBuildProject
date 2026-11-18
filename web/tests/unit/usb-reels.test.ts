import { afterEach, describe, expect, it } from "vitest";
import type { Roll } from "../../src/domain/activity";
import { UsbReelLink, parseState } from "../../src/features/redeem/usb/link";
import { confirmSetup, DEFAULT_ORDER, deliverSavedRoll, parseOrder, readiness, resolveInspection, savedReceipt, unresolvedReceipt } from "../../src/features/redeem/usb/delivery";
import { fakeReelMotor } from "../support/fakeReelMotor";

const order = parseOrder(DEFAULT_ORDER);
const roll = (slot: number | null = 1): Roll => ({ id: "77777777-7777-4777-8777-777777777777", allocations: [1, 1, 1, 1], cost: 4, threshold: 200000,
  won: slot !== null, slot, wheels: slot ? ["jacqueminot", "jacqueminot", "jacqueminot"] : ["hammer", "garnet", "tongs"], policyVersion: "roll-v1", deliveryState: slot ? "hardware_pending" : "not_applicable", createdAt: new Date().toISOString(), balance: 0 });
const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const links: UsbReelLink[] = [];
async function connected(options: Parameters<typeof fakeReelMotor>[0] = {}) {
  const board = fakeReelMotor(options); const link = new UsbReelLink(); links.push(link);
  await link.connect(board.port); return { link, board };
}
afterEach(async () => { await Promise.all(links.splice(0).map(link => link.disconnect())); });

describe("USB reel-engine delivery", () => {
  it("automatically confirms alignment on connection without motion", async () => {
    const { link, board } = await connected();
    expect(board.commands.filter(c => c !== "PING")).toEqual(["ALIGNED 1"]);
    expect(readiness(link.state, link.fresh)).toBeNull();
    await confirmSetup(link);
    expect(board.commands.filter(c => c !== "PING")).toEqual(["ALIGNED 1", "ALIGNED 1"]);
    expect(readiness(link.state, link.fresh)).toBeNull();
  });
  it.each([1, 2, 3, 4])("lands the exact saved symbols before opening slot %i's channel", async slot => {
    const { link, board } = await connected(); await confirmSetup(link); const store = storage();
    const receipt = await deliverSavedRoll(link, roll(slot), order, store, () => {});
    const spin = board.commands.find(c => c.startsWith("SPIN "))!;
    expect(spin.split(" ").slice(1).map(a => order[Math.floor(Number(a) / 4500)])).toEqual(roll(slot).wheels);
    expect(board.commands.filter(c => c.startsWith("DOPEN"))).toEqual([`DOPEN ${slot - 1}`]);
    expect(receipt.phase).toBe("finished");
    expect(board.commands.some(c => c.startsWith("DCLOSE"))).toBe(false);
    expect(roll(slot).wheels).toEqual(["jacqueminot", "jacqueminot", "jacqueminot"]);
  });
  it("never opens a drawer on a loss", async () => {
    const { link, board } = await connected(); await confirmSetup(link);
    await deliverSavedRoll(link, roll(null), order, storage(), () => {});
    expect(board.commands.some(c => c.startsWith("DOPEN"))).toBe(false);
  });
  it.each([1, 4])("can use calibrated slot %i while slots 2 and 3 remain uncalibrated", async slot => {
    const { link, board } = await connected({ drawerCalibration: "1001" });
    expect(readiness(link.state, link.fresh)).toBeNull();
    await deliverSavedRoll(link, roll(slot), order, storage(), () => {});
    const marked = board.commands.indexOf(`DMARK ${slot - 1} closed`);
    expect(marked).toBeGreaterThan(-1);
    expect(board.commands[marked + 1]).toBe(`DOPEN ${slot - 1}`);
    expect(board.commands.some(c => c.startsWith("DCLOSE"))).toBe(false);
  });
  it("refuses an uncalibrated winning drawer without spinning", async () => {
    const { link, board } = await connected({ drawerCalibration: "1001" });
    await expect(deliverSavedRoll(link, roll(2), order, storage(), () => {})).rejects.toThrow(/only to calibrated/);
    expect(board.commands.some(c => c.startsWith("SPIN"))).toBe(false);
  });
  it("does not replay a completed event even after constructing a new connection", async () => {
    const first = await connected(); await confirmSetup(first.link); const store = storage();
    await deliverSavedRoll(first.link, roll(), order, store, () => {});
    const second = await connected();
    const receipt = await deliverSavedRoll(second.link, roll(), order, store, () => {});
    expect(receipt.phase).toBe("finished"); expect(second.board.commands).toEqual(["PING", "ALIGNED 1"]);
  });
  it("refuses changed payloads under a completed roll ID", async () => {
    const { link, board } = await connected(); await confirmSetup(link); const store = storage();
    await deliverSavedRoll(link, roll(), order, store, () => {});
    const count = board.commands.length;
    await expect(deliverSavedRoll(link, roll(4), order, store, () => {})).rejects.toThrow(/different USB payload/);
    expect(board.commands).toHaveLength(count);
  });
  it("blocks opening and repeat motion after an incorrect landing", async () => {
    const { link, board } = await connected({ wrongLanding: true }); await confirmSetup(link); const store = storage();
    await expect(deliverSavedRoll(link, roll(), order, store, () => {})).rejects.toThrow(/landing report differs/);
    expect(unresolvedReceipt(store)?.phase).toBe("unconfirmed");
    await expect(deliverSavedRoll(link, roll(), order, store, () => {})).rejects.toThrow(/needs inspection/);
    expect(board.commands.filter(c => c.startsWith("SPIN"))).toHaveLength(1);
    expect(board.commands.some(c => c.startsWith("DOPEN"))).toBe(false);
    resolveInspection(store);
    await deliverSavedRoll(link, roll(), order, store, () => {});
    expect(board.commands.filter(c => c.startsWith("SPIN"))).toHaveLength(1);
  });
  it.each(["spin", "drawer"])("does not retry a lost %s acknowledgement even if motion completed", async which => {
    const { link, board } = await connected({ dropSpinReply: which === "spin", dropDrawerReply: which === "drawer" });
    await confirmSetup(link); const store = storage();
    await expect(deliverSavedRoll(link, roll(), order, store, () => {})).rejects.toThrow(/No USB reply/);
    expect(savedReceipt(store, roll().id)?.phase).toBe("unconfirmed");
    await expect(deliverSavedRoll(link, roll(), order, store, () => {})).rejects.toThrow(/needs inspection/);
    expect(board.commands.filter(c => c.startsWith("SPIN"))).toHaveLength(1);
    expect(board.commands.filter(c => c.startsWith("DOPEN"))).toHaveLength(which === "spin" ? 0 : 1);
  });
  it("records known refusals separately and permits an explicit retry", async () => {
    const { link } = await connected({ refuseSpin: true }); await confirmSetup(link); const store = storage();
    await expect(deliverSavedRoll(link, roll(), order, store, () => {})).rejects.toThrow(/refused/);
    expect(savedReceipt(store, roll().id)?.phase).toBe("refused"); expect(unresolvedReceipt(store)).toBeUndefined();
  });
  it("writes the local claim before any motor command and blocks motion if storage fails", async () => {
    const { link, board } = await connected(); await confirmSetup(link);
    const broken = { getItem: () => null, setItem: () => { throw new Error("storage full"); } };
    await expect(deliverSavedRoll(link, roll(), order, broken, () => {})).rejects.toThrow("storage full");
    expect(board.commands.some(c => c.startsWith("SPIN"))).toBe(false);
  });
  it.each(["E BOOT brownout", "E STOPPED", "E LINKLOST"])("blocks the drawer after %s during a spin", async event => {
    const { link, board } = await connected(); await confirmSetup(link); const store = storage();
    const pending = deliverSavedRoll(link, roll(), order, store, () => {});
    setTimeout(() => board.emit(event), 5);
    await expect(pending).rejects.toThrow(/interrupted/);
    expect(savedReceipt(store, roll().id)?.phase).toBe("unconfirmed");
    expect(board.commands.some(c => c.startsWith("DOPEN"))).toBe(false);
  });
  it("preserves uncertainty after a cable disconnect", async () => {
    const { link, board } = await connected(); await confirmSetup(link); const store = storage();
    const pending = deliverSavedRoll(link, roll(), order, store, () => {});
    setTimeout(() => { void link.disconnect(); }, 5);
    await expect(pending).rejects.toThrow(/connection closed|disconnected/);
    expect(unresolvedReceipt(store)?.phase).toBe("unconfirmed");
    expect(board.commands.some(c => c.startsWith("DOPEN"))).toBe(false);
  });
  it("blocks spins with missing drivers, unconfirmed alignment or open drawers", async () => {
    const { link, board } = await connected({ drivers: 3 });
    await expect(confirmSetup(link)).rejects.toThrow(/three motor drivers/);
    await expect(deliverSavedRoll(link, roll(), order, storage(), () => {})).rejects.toThrow(/three motor drivers/);
    expect(board.commands.some(c => c.startsWith("SPIN"))).toBe(false);
  });
  it("ignores truncated and malformed heartbeats", () => {
    expect(parseState("S 1 7 1 0")).toBeNull();
    expect(parseState("S 1 7 1 0 0 0 9 0 1600 0 0 0 0 0 1600 0 0 0 0 0 1600 0 1 1111 1111")).toBeNull();
  });
  it("uses the explicit sector order and aliases, rejecting incomplete maps", () => {
    expect(order).toEqual(["hammer", "garnet", "jacqueminot", "tongs", "hammer", "garnet", "jacqueminot", "tongs"]);
    expect(() => parseOrder("hammer,garnet,rose,tong")).toThrow();
  });
});
