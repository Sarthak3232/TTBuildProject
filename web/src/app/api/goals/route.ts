import { z } from "zod";
import { requireUser,readBody,keySchema,jsonError,noStore } from "@/server/api";
import { mutate } from "@/server/services/sessions";
const schema=z.object({key:keySchema,id:z.uuid().optional(),taskId:z.uuid(),targetMs:z.number().int().min(60000).max(86400000),repeatKind:z.enum(["today","daily","weekdays"]),weekdays:z.array(z.number().int().min(1).max(7)).max(7).optional()}).strict().refine(v=>v.repeatKind!=="weekdays" || (v.weekdays?.length && new Set(v.weekdays).size===v.weekdays.length),"Choose one or more distinct weekdays");
export async function POST(request:Request){try{const {user}=await requireUser(request,true);const {key,...payload}=await readBody(request,schema);return noStore(await mutate(user.id,"goal.save",key,payload));}catch(e){return jsonError(e)}}
export async function DELETE(request:Request){try{const {user}=await requireUser(request,true);const {key,...payload}=await readBody(request,z.object({key:keySchema,id:z.uuid()}).strict());return noStore(await mutate(user.id,"goal.archive",key,payload));}catch(e){return jsonError(e)}}
