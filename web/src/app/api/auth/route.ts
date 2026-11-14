import { z } from "zod";
import { assertSameOrigin,readBody,jsonError,noStore,ApiError } from "@/server/api";
import { createServerSupabaseClient } from "@/server/supabase/clients";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("login"),email:z.email().max(254),password:z.string().min(1).max(256)}).strict(),
 z.object({action:z.literal("signup"),email:z.email().max(254),password:z.string().min(8).max(256),displayName:z.string().trim().max(80),timezone:z.string().max(100)}).strict(),
 z.object({action:z.literal("reset"),email:z.email().max(254)}).strict(),
 z.object({action:z.literal("password"),password:z.string().min(8).max(256)}).strict(),
 z.object({action:z.literal("logout")}).strict()
]);
export async function POST(request:Request){try{assertSameOrigin(request);const body=await readBody(request,schema);const db=await createServerSupabaseClient();const base=process.env.APP_URL??new URL(request.url).origin;
 if(body.action==="login"){const {error}=await db.auth.signInWithPassword({email:body.email,password:body.password});if(error)throw new ApiError(400,"auth","Could not sign in. Check your credentials and confirm your email.");return noStore({signedIn:true})}
 if(body.action==="signup"){const {data,error}=await db.auth.signUp({email:body.email,password:body.password,options:{data:{display_name:body.displayName,timezone:body.timezone},emailRedirectTo:`${base}/auth/callback`}});if(error)throw new ApiError(400,"auth",error.message);return noStore({signedIn:Boolean(data.session),message:"Check your email to confirm your account, then sign in."})}
 if(body.action==="reset"){const{error}=await db.auth.resetPasswordForEmail(body.email,{redirectTo:`${base}/auth/callback?next=/reset-password`});if(error)throw new ApiError(503,"recovery_unavailable","A recovery email could not be requested right now. Please try again later.");return noStore({message:"If that account exists, a password reset email is on its way."})}
 if(body.action==="password"){const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)throw new ApiError(401,"auth","Open the password recovery link from your email first.");const{error}=await db.auth.updateUser({password:body.password});if(error)throw new ApiError(400,"auth",error.message);return noStore({message:"Password updated. You can now continue to your dashboard."})}
 const {error}=await db.auth.signOut();if(error)throw new ApiError(400,"auth","Sign out failed. Please retry.");return noStore({signedOut:true});
 }catch(e){return jsonError(e)}}
