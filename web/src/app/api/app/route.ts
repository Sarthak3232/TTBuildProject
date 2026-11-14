import { requireUser,jsonError,noStore } from "@/server/api";
export async function GET(request:Request){try{const {user,supabase}=await requireUser(request);const {data,error}=await supabase.rpc("my_app_snapshot");if(error)throw error;return noStore({...data,profile:{...data.profile,email:user.email??""}});}catch(e){return jsonError(e)}}
