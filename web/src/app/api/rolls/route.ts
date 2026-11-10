import { randomInt } from "node:crypto";
import { z } from "zod";
import { winThreshold,ROLL_SCALE } from "@/domain/rolls/probability";
import { requireUser,readBody,keySchema,jsonError,noStore } from "@/server/api";
import { mutate } from "@/server/services/sessions";
export async function POST(request:Request){try{const {user}=await requireUser(request,true);const {key,allocations}=await readBody(request,z.object({key:keySchema,allocations:z.array(z.number().int().min(0).max(1000000)).length(4)}).strict());const total=allocations.reduce((a,b)=>a+b,0);const threshold=winThreshold(total);const winSample=randomInt(ROLL_SCALE);const slotSample=winSample<threshold?randomInt(total):null;return noStore(await mutate(user.id,"roll",key,{allocations,winSample,slotSample}));}catch(e){return jsonError(e)}}
