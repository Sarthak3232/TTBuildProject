import { z } from "zod";
import { requireUser,readBody,keySchema,jsonError,noStore } from "@/server/api";
import { getSession,mutate } from "@/server/services/sessions";
export async function GET(request:Request){try{const {user,supabase}=await requireUser(request);const {data,error}=await supabase.from("activity_sessions").select("id").eq("user_id",user.id).in("state",["created","running","paused"]).maybeSingle();if(error)throw error;return noStore({activity:data?await getSession(supabase,user.id,data.id):null});}catch(e){return jsonError(e)}}
export async function POST(request:Request){try{const {supabase}=await requireUser(request,true);const {key,...payload}=await readBody(request,z.object({key:keySchema,taskId:z.uuid()}).strict());return noStore(await mutate(supabase,"session.start",key,payload));}catch(e){return jsonError(e)}}
