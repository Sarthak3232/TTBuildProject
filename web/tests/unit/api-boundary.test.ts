import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),mutate:vi.fn(),mutateSession:vi.fn(),getSession:vi.fn()}));
const client={auth:{getUser:mocks.getUser}};
vi.mock("@/server/supabase/clients",()=>({createServerSupabaseClient:async()=>client}));
vi.mock("@/server/services/sessions",()=>({mutate:mocks.mutate,getSession:mocks.getSession,mutateSession:mocks.mutateSession}));
import { ApiError,assertSameOrigin,readBody,requireUser } from "../../src/server/api";
import { POST as start } from "../../src/app/api/sessions/route";
import { POST as roll } from "../../src/app/api/rolls/route";
import { z } from "zod";
import { PATCH as control } from "../../src/app/api/sessions/[id]/route";
const origin="http://localhost:3000";const userId="11111111-1111-4111-8111-111111111111";const taskId="22222222-2222-4222-8222-222222222222";const key="33333333-3333-4333-8333-333333333333";
function request(path:string,body:unknown,from=origin){return new Request(origin+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:from},body:JSON.stringify(body)})}
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:userId}},error:null});mocks.mutate.mockResolvedValue({activity:{id:"session"},roll:{id:"roll"}})});
describe("HTTP boundary",()=>{
 it("rejects cross-site and absent origin before writes",()=>{expect(()=>assertSameOrigin(request("/api/sessions",{},"https://other.invalid"))).toThrow(ApiError);expect(()=>assertSameOrigin(new Request(origin))).toThrow(ApiError)});
 it("verifies the current auth user rather than trusting claims",async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:{message:"expired"}});await expect(requireUser(new Request(origin))).rejects.toMatchObject({status:401})});
 it("caps chunked input while reading and cancels the stream",async()=>{let canceled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(33000))},cancel(){canceled=true}});const req=new Request(origin,{method:"POST",headers:{"Content-Type":"application/json"},body:stream,duplex:"half"} as RequestInit);await expect(readBody(req,z.object({}))).rejects.toMatchObject({status:413});expect(canceled).toBe(true)});
 it("rejects malformed JSON",async()=>{const r=new Request(origin,{method:"POST",headers:{"Content-Type":"application/json"},body:"{"});await expect(readBody(r,z.object({}))).rejects.toMatchObject({status:400})});
 it("passes the authenticated client for session starts",async()=>{const response=await start(request("/api/sessions",{taskId,key}));expect(response.status).toBe(200);expect(mocks.mutate).toHaveBeenCalledWith(client,"session.start",key,{taskId})});
 it.each([{userId:"other"},{eligibleMs:3600000},{forceWin:true}])("rejects extra trusted fields %j",async extra=>{const response=await start(request("/api/sessions",{taskId,key,...extra}));expect(response.status).toBe(422);expect(mocks.mutate).not.toHaveBeenCalled()});
 it("routes versioned controls through the authenticated client",async()=>{mocks.mutateSession.mockResolvedValue({activity:{id:taskId}});const r=await control(request(`/api/sessions/${taskId}`,{key,revision:3,action:"pause"}),{params:Promise.resolve({id:taskId})});expect(r.status).toBe(200);expect(mocks.mutateSession).toHaveBeenCalledWith(client,taskId,{key,revision:3,action:"pause"})});
 it("rejects invalid session control ids",async()=>expect((await control(request("/api/sessions/nope",{key,revision:0,action:"pause"}),{params:Promise.resolve({id:"nope"})})).status).toBe(422));
 it("refuses unauthenticated POST",async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:null});expect((await start(request("/api/sessions",{taskId,key}))).status).toBe(401);expect(mocks.mutate).not.toHaveBeenCalled()});
});
describe("roll trust boundary",()=>{
 it.each([[0,0,0,0],[-1,2,0,0],[0.5,1,0,0]])("rejects invalid allocation %j",async(...allocations)=>expect((await roll(request("/api/rolls",{key,allocations}))).status).toBe(422));
 it("rejects public random/outcome overrides",async()=>{expect((await roll(request("/api/rolls",{key,allocations:[1,0,0,0],winSample:0}))).status).toBe(422);expect(mocks.mutate).not.toHaveBeenCalled()});
 it("passes only the stake to the database for an authenticated roll",async()=>{const response=await roll(request("/api/rolls",{key,allocations:[0,3,0,1]}));expect(response.status).toBe(200);expect(mocks.mutate).toHaveBeenCalledWith(client,"roll",key,{allocations:[0,3,0,1]})});
});
