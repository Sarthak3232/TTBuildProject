import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "./supabase/clients";
export class ApiError extends Error { constructor(public status:number,public code:string,message:string){super(message)} }
export function assertSameOrigin(request:Request) {
 const origin=request.headers.get("origin"); const expected=new URL(request.url).origin;
 if(!origin || origin!==expected || request.headers.get("sec-fetch-site")==="cross-site") throw new ApiError(403,"origin","Use this app's own page to make changes.");
}
export async function requireUser(request:Request,mutating=false) {
 if(mutating) assertSameOrigin(request);
 const supabase=await createServerSupabaseClient();const {data:{user},error}=await supabase.auth.getUser();
 if(error || !user) throw new ApiError(401,"unauthenticated","Your session has expired. Sign in again.");
 return {user,supabase};
}
export async function readBody<T extends z.ZodType>(request:Request,schema:T):Promise<z.infer<T>> {
 if(!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415,"content_type","Send JSON.");
 if(Number(request.headers.get("content-length")??0)>65536) throw new ApiError(413,"body_size","Request too large.");
 const content=await request.text();if(content.length>65536) throw new ApiError(413,"body_size","Request too large.");
 let value:unknown;try{value=JSON.parse(content)}catch{throw new ApiError(400,"json","Invalid JSON.")}
 const parsed=schema.safeParse(value);if(!parsed.success) throw new ApiError(400,"validation",parsed.error.issues[0]?.message??"Invalid request.");return parsed.data;
}
export function noStore(data:unknown,status=200) {return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}})}
export function jsonError(error:unknown) {
 if(error instanceof ApiError)return noStore({error:{code:error.code,message:error.message}},error.status);
 const value=error as {code?:string;message?:string};
 const statuses:Record<string,number>={P0002:404,"23505":409,"40001":409,"22023":400,"23514":400,"54000":429};
 if(value.code && statuses[value.code])return noStore({error:{code:value.code,message:value.message??"Request failed"}},statuses[value.code]);
 const setup=value.message?.startsWith("Supabase")?value.message:undefined;
 if(!setup)console.error("Application request failed",{code:value.code??"unexpected"});
 return noStore({error:{code:"server_error",message:setup??"The request could not be saved. Please retry."}},503);
}
export const keySchema=z.uuid();
export const controlSessionSchema=z.object({action:z.enum(["pause","resume","complete","cancel"]),revision:z.number().int().min(0),key:keySchema,reflection:z.string().trim().max(4000).optional(),description:z.string().trim().max(2000).optional()}).strict();
