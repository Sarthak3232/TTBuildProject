import { z } from "zod";
import { requireUser,readBody,keySchema,jsonError,noStore } from "@/server/api";
import { createServiceClient } from "@/server/supabase/clients";
import { getSession,mutate } from "@/server/services/sessions";
export async function GET(request:Request){try{const {user}=await requireUser(request);const {data,error}=await createServiceClient().from("activity_sessions").select("id").eq("user_id",user.id).in("state",["created","running","paused"]).maybeSingle();if(error)throw error;return noStore({activity:data?await getSession(user.id,data.id):null});}catch(e){return jsonError(e)}}
export async function POST(request:Request){try{const {user}=await requireUser(request,true);const {key,...payload}=await readBody(request,z.object({key:keySchema,taskId:z.uuid()}).strict());return noStore(await mutate(user.id,"session.start",key,payload));}catch(e){return jsonError(e)}}
