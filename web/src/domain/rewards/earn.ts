export const TOKEN_MS = 1_800_000;
export function tokenAward(eligibleMs: number): number { if (!Number.isSafeInteger(eligibleMs) || eligibleMs < 0) throw new Error("Invalid eligible duration"); return Math.floor(eligibleMs / TOKEN_MS); }
export function canComplete(eligibleMs: number, minimumMs: number | null, question: string | null, reflection: string): boolean { return eligibleMs >= (minimumMs ?? 0) && (!question?.trim() || Boolean(reflection.trim())); }
