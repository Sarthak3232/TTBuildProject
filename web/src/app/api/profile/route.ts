import { z } from "zod";
import { requireUser,readBody,keySchema,jsonError,noStore } from "@/server/api";
import { mutate } from "@/server/services/sessions";
export async function PATCH(request:Request){try{const {user}=await requireUser(request,true);const {key,...payload}=await readBody(request,z.object({key:keySchema,displayName:z.string().trim().max(80),timezone:z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat("en-US",{timeZone:v});return true}catch{return false}},"Choose a valid IANA timezone")}).strict());return noStore(await mutate(user.id,"profile.save",key,payload));}catch(e){return jsonError(e)}}
