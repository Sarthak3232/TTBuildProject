import { z } from "zod";
import { requireUser,readBody,keySchema,jsonError,noStore } from "@/server/api";
import { mutate } from "@/server/services/sessions";
const task=z.object({key:keySchema,id:z.uuid().optional(),name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(""),minimumMs:z.number().int().min(1800000).max(31536000000),reflectionQuestion:z.string().trim().max(500).nullable().optional()}).strict();
export async function POST(request:Request){try{const {user}=await requireUser(request,true);const {key,...payload}=await readBody(request,task);return noStore(await mutate(user.id,"task.save",key,payload));}catch(e){return jsonError(e)}}
export const PATCH=POST;
export async function DELETE(request:Request){try{const {user}=await requireUser(request,true);const {key,...payload}=await readBody(request,z.object({key:keySchema,id:z.uuid()}).strict());return noStore(await mutate(user.id,"task.archive",key,payload));}catch(e){return jsonError(e)}}
