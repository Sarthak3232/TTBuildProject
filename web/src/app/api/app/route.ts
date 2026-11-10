import { requireUser,jsonError,noStore } from "@/server/api";
import { createServiceClient } from "@/server/supabase/clients";
export async function GET(request:Request){try{const {user}=await requireUser(request);const {data,error}=await createServiceClient().rpc("app_snapshot",{p_user_id:user.id});if(error)throw error;return noStore({...data,profile:{...data.profile,email:user.email??""}});}catch(e){return jsonError(e)}}
