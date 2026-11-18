import { describe, expect, it } from "vitest";
import { readWheelResults, wheelCommand } from "../../src/domain/rolls/wheels";

describe("saved wheel results", () => {
  it("accepts three matching symbols only for a win", () => {
    expect(readWheelResults(["garnet","garnet","garnet"],true,200000)).toEqual(["garnet","garnet","garnet"]);
    expect(() => readWheelResults(["garnet","garnet","garnet"],false,200000)).toThrow();
    expect(() => readWheelResults(["garnet","hammer","garnet"],true,600000)).toThrow();
  });
  it("enforces the 50% boundary without changing low-probability loss patterns", () => {
    const mixed = ["jacqueminot","tongs","hammer"];
    expect(readWheelResults(mixed,false,499999)).toEqual(mixed);
    expect(() => readWheelResults(mixed,false,500000)).toThrow();
    expect(readWheelResults(["hammer","hammer","tongs"],false,500000)).toEqual(["hammer","hammer","tongs"]);
  });
  it.each([[],["garnet"],["garnet","garnet","garnet","garnet"],["unknown","unknown","unknown"]])("rejects invalid saved symbols %j", (...symbols) => {
    expect(() => readWheelResults(symbols,true,200000)).toThrow();
  });
  it("prepares a stable three-wheel payload with the winning drawer separate from the symbol", () => {
    const roll = { id: "saved-roll", won: true, slot: 4, threshold: 200000, wheels: ["jacqueminot","jacqueminot","jacqueminot"] as ["jacqueminot","jacqueminot","jacqueminot"] };
    expect(wheelCommand(roll)).toEqual({ schemaVersion: 1, eventId: "saved-roll", outcome: "win", wheels: roll.wheels, winningSlot: 4 });
    expect(wheelCommand(roll)).toEqual(wheelCommand(roll));
  });
  it("a loss command never specifies a drawer", () => {
    expect(wheelCommand({ id: "saved-roll", won: false, slot: null, threshold: 580085, wheels: ["tongs","tongs","garnet"] }).winningSlot).toBeNull();
    expect(() => wheelCommand({ id: "saved-roll", won: false, slot: 1, threshold: 580085, wheels: ["tongs","tongs","garnet"] })).toThrow();
  });
});
