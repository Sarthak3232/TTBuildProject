import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/navigation/AppNavigation";
import { AppProvider } from "@/features/app/AppProvider";
import { createServerSupabaseClient,supabaseConfig } from "@/server/supabase/clients";
export const dynamic = "force-dynamic";
export default async function AppLayout({children}:Readonly<{children:React.ReactNode}>){
 try{supabaseConfig()}catch(e){return <main className="setup-message"><h1>Connect Supabase to start Slotty.</h1><p>{(e as Error).message}</p><p>Copy web/.env.example to web/.env.local, add your project keys, and restart the development server.</p></main>}
 const client=await createServerSupabaseClient();
 const {data:{user}}=await client.auth.getUser();if(!user)redirect("/sign-in");
 return <AppProvider><div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><AppNavigation/><main id="main-content" tabIndex={-1}>{children}</main></div></AppProvider>
}
