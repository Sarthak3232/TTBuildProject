import { describe, expect, it } from "vitest";
import { tokenAward, canComplete } from "../../src/domain/rewards/earn";
import { activeMilliseconds } from "../../src/domain/activity";
import { winThreshold, selectOutcome } from "../../src/domain/rolls/probability";
describe("earning policy",()=>{
 it.each([[1_799_000,0],[1_800_000,1],[3_599_000,1],[3_600_000,2]])("rounds %i to %i",(ms,tokens)=>expect(tokenAward(ms)).toBe(tokens));
 it("requires minimum and reflection",()=>{expect(canComplete(1_799_000,1_800_000,null,"")).toBe(false);expect(canComplete(1_800_000,1_800_000,"What?"," ")).toBe(false);expect(canComplete(1_800_000,1_800_000,"What?","Done")).toBe(true)});
 it("has no cross-session remainder",()=>expect(tokenAward(2_700_000)+tokenAward(900_000)).toBe(1));
 it("accepts no untrusted numeric duration",()=>expect(()=>tokenAward(Infinity)).toThrow());
 it("empty session has no elapsed time",()=>expect(activeMilliseconds(null)).toBe(0));
});
describe("roll-v1",()=>{
 it("quantizes known anchors",()=>{expect(winThreshold(1)).toBe(200000);expect(winThreshold(10)/10000).toBeCloseTo(58.0085,3);expect(winThreshold(20)/10000).toBeCloseTo(59.9289,3)});
 it("loss never selects a slot",()=>expect(selectOutcome([0,1,0,0],999999,null)).toEqual({won:false,slot:null}));
 it("chooses only funded slots at exact boundaries",()=>{expect(selectOutcome([0,3,0,1],0,2)).toEqual({won:true,slot:2});expect(selectOutcome([0,3,0,1],0,3)).toEqual({won:true,slot:4})});
 it.each([[0,0,0,0],[-1,2,0,0],[0.5,1,0,0]])("rejects invalid allocations",(...a)=>expect(()=>selectOutcome(a,0,0)).toThrow());
});
