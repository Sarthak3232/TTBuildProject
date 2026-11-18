import { z } from "zod";

export const WHEEL_SYMBOLS = ["jacqueminot", "garnet", "tongs", "hammer"] as const;
export type WheelSymbol = typeof WHEEL_SYMBOLS[number];
export type WheelResults = [WheelSymbol, WheelSymbol, WheelSymbol];
export const wheelResultsSchema = z.tuple([
  z.enum(WHEEL_SYMBOLS), z.enum(WHEEL_SYMBOLS), z.enum(WHEEL_SYMBOLS),
]);

// Validate saved database outputs at the app/hardware boundary. Generation is
// cryptographic and persisted in Postgres, never rerun on page render or retry.
export function readWheelResults(value: unknown, won: boolean, threshold: number): WheelResults {
  const wheels = wheelResultsSchema.parse(value);
  const matches = wheels[0] === wheels[1] && wheels[1] === wheels[2];
  if (matches !== won || (!won && threshold >= 500_000 && wheels[0] !== wheels[1])) {
    throw new Error("Saved wheel results do not match the roll outcome");
  }
  return wheels;
}

export type WheelCommand = {
  schemaVersion: 1;
  eventId: string;
  outcome: "win" | "loss";
  wheels: WheelResults;
  winningSlot: number | null;
};

export function wheelCommand(roll: { id: string; won: boolean; slot: number | null; threshold: number; wheels: WheelResults }): WheelCommand {
  if (roll.won ? !Number.isInteger(roll.slot) || roll.slot! < 1 || roll.slot! > 4 : roll.slot !== null) {
    throw new Error("Invalid winning drawer");
  }
  return { schemaVersion: 1, eventId: roll.id, outcome: roll.won ? "win" : "loss",
    wheels: readWheelResults(roll.wheels, roll.won, roll.threshold), winningSlot: roll.slot };
}
