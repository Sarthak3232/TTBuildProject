import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function supabaseConfig() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url || !key) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.local.");
 return {url,key};
}
export async function createServerSupabaseClient() {
 const {url,key}=supabaseConfig(); const store=await cookies();
 return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>store.set(name,value,options))}catch{/* Refresh cookies are written by proxy/route handlers. */}}}});
}
export type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
