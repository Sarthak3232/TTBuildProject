export const ROLL_SCALE = 1_000_000;
export function winThreshold(tokens: number): number { if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > 4_000_000) throw new Error("Allocate between 1 and 4,000,000 whole tokens"); return Math.round((0.60 - 0.40 * Math.exp(-(tokens - 1) / 3)) * ROLL_SCALE); }
export function selectOutcome(allocations: number[], winSample: number, slotSample: number | null): { won: boolean; slot: number | null } {
 if (allocations.length !== 4 || allocations.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid allocation");
 const total = allocations.reduce((a,b) => a+b,0); const threshold = winThreshold(total);
 if (!Number.isInteger(winSample) || winSample < 0 || winSample >= ROLL_SCALE) throw new Error("Invalid sample");
 if (winSample >= threshold) return {won:false,slot:null};
 if (slotSample === null || !Number.isInteger(slotSample) || slotSample < 0 || slotSample >= total) throw new Error("Invalid weighted sample");
 let cumulative = 0; for (let i=0;i<4;i++) { cumulative += allocations[i]; if(slotSample < cumulative) return {won:true,slot:i+1}; }
 throw new Error("No funded slot");
}
