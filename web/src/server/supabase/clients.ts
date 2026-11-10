import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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
export function createServiceClient() {
 const {url}=supabaseConfig();const secret=process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret) throw new Error("Supabase server key missing. Set SUPABASE_SECRET_KEY in web/.env.local (never NEXT_PUBLIC). ");
 return createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
}
