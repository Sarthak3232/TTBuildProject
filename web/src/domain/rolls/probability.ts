export const ROLL_SCALE = 1_000_000;
export function winThreshold(tokens: number): number { if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > 4_000_000) throw new Error("Allocate between 1 and 4,000,000 whole tokens"); return Math.round((0.60 - 0.40 * Math.exp(-(tokens - 1) / 3)) * ROLL_SCALE); }
export function eligibleAllocations(allocations: number[]): number[] {
 if(allocations.length!==4||allocations.some(n=>!Number.isSafeInteger(n)||n<0||n>1_000_000))throw new Error("Invalid allocation");
 return allocations.some(n=>n>=10)?allocations.map(n=>n>=10?n:0):allocations;
}
export function rollThreshold(allocations: number[]): number {
 const eligible=eligibleAllocations(allocations);const total=allocations.reduce((sum,n)=>sum+n,0);
 const normal=winThreshold(total);return eligible.some(n=>n>=10)?ROLL_SCALE:normal;
}
export function selectOutcome(allocations: number[], winSample: number, slotSample: number | null): { won: boolean; slot: number | null } {
 if (allocations.length !== 4 || allocations.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid allocation");
 const eligible=eligibleAllocations(allocations); const total = eligible.reduce((a,b) => a+b,0); const threshold = rollThreshold(allocations);
 if (!Number.isInteger(winSample) || winSample < 0 || winSample >= ROLL_SCALE) throw new Error("Invalid sample");
 if (winSample >= threshold) return {won:false,slot:null};
 if (slotSample === null || !Number.isInteger(slotSample) || slotSample < 0 || slotSample >= total) throw new Error("Invalid weighted sample");
 let cumulative = 0; for (let i=0;i<4;i++) { cumulative += eligible[i]; if(slotSample < cumulative) return {won:true,slot:i+1}; }
 throw new Error("No funded slot");
}
