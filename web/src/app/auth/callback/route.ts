import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/server/supabase/clients";
export async function GET(request:Request){const url=new URL(request.url);const db=await createServerSupabaseClient();const code=url.searchParams.get("code");const tokenHash=url.searchParams.get("token_hash");const type=url.searchParams.get("type");const next=url.searchParams.get("next")==="/reset-password" || type==="recovery"?"/reset-password":"/dashboard";
 if(code){const{error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(next,url.origin))}
 if(tokenHash && ["signup","email","recovery","email_change"].includes(type??"")){const{error}=await db.auth.verifyOtp({token_hash:tokenHash,type:type as EmailOtpType});if(!error)return NextResponse.redirect(new URL(next,url.origin))}
 return NextResponse.redirect(new URL("/sign-in?message=Confirmation%20link%20expired.%20Please%20sign%20in%20or%20request%20a%20new%20recovery%20email.",url.origin));}
