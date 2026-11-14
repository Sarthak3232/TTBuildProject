import { afterEach,describe,expect,it,vi } from "vitest";
import { mutation } from "../../src/features/app/client";
afterEach(()=>vi.unstubAllGlobals());
describe("browser idempotent mutation recovery",()=>{
 it("retains the original task key after lost replies and clears it after success",async()=>{
  const storage=new Map<string,string>();vi.stubGlobal("sessionStorage",{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
  const fetch=vi.fn().mockRejectedValueOnce(new TypeError("Lost reply")).mockResolvedValue({ok:true,json:async()=>({saved:true})});vi.stubGlobal("fetch",fetch);
  const body={name:"Recover my task",minimumMs:1800000};await expect(mutation("/api/tasks",body)).rejects.toThrow("Lost reply");expect(storage.size).toBe(1);
  await mutation("/api/tasks",body);const first=JSON.parse(fetch.mock.calls[0][1].body),second=JSON.parse(fetch.mock.calls[1][1].body);expect(second.key).toBe(first.key);expect(storage.size).toBe(0);
  await mutation("/api/tasks",body);expect(JSON.parse(fetch.mock.calls[2][1].body).key).not.toBe(first.key);
 });
 it("respects an explicit persisted roll key",async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({saved:true})});vi.stubGlobal("fetch",fetch);await mutation("/api/rolls",{allocations:[1,0,0,0]},"POST","explicit-key");expect(JSON.parse(fetch.mock.calls[0][1].body).key).toBe("explicit-key")});
});
