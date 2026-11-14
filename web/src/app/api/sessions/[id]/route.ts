import { z } from "zod";
import { ApiError,requireUser,readBody,controlSessionSchema,jsonError,noStore } from "@/server/api";
import { getSession,mutateSession } from "@/server/services/sessions";
async function sessionId(params:Promise<{id:string}>){const{id}=await params;if(!z.uuid().safeParse(id).success)throw new ApiError(422,"validation","Invalid activity id");return id}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const{user,supabase}=await requireUser(request);return noStore({activity:await getSession(supabase,user.id,await sessionId(params))});}catch(e){return jsonError(e)}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const{supabase}=await requireUser(request,true);const id=await sessionId(params);const input=await readBody(request,controlSessionSchema);return noStore(await mutateSession(supabase,id,input));}catch(e){return jsonError(e)}}
