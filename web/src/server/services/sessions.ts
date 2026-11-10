import "server-only";
import { z } from "zod";
import type { Activity,Completion } from "@/domain/activity";
import { createServiceClient } from "../supabase/clients";
import { ApiError,controlSessionSchema } from "../api";
export async function mutate(userId:string,operation:string,key:string,payload:Record<string,unknown>) {
 const {data,error}=await createServiceClient().rpc("app_mutate",{p_user_id:userId,p_operation:operation,p_key:key,p_payload:payload});if(error)throw error;return data;
}
export async function getSession(userId:string,id:string):Promise<Activity> {
 const {data,error}=await createServiceClient().from("activity_sessions").select("*").eq("user_id",userId).eq("id",id).maybeSingle();if(error)throw error;if(!data)throw new ApiError(404,"not_found","Activity not found");
 const task=data.task_snapshot;
 return {id:data.id,taskId:data.task_id,task:{id:task.id,kind:task.kind,name:task.name,description:task.description,minimumMs:task.minimum_ms,reflectionQuestion:task.reflection_question,archivedAt:task.archived_at},state:data.state,revision:data.revision,activeSince:data.active_since,accumulatedMs:data.accumulated_ms,eligibleMs:data.eligible_ms,startedAt:data.started_at,serverTime:new Date().toISOString()};
}
export async function mutateSession(userId:string,id:string,input:z.infer<typeof controlSessionSchema>):Promise<{activity:Activity;completion:Completion|null;balance:number}>{const {key,...payload}=input;return mutate(userId,"session.control",key,{id,...payload})}
