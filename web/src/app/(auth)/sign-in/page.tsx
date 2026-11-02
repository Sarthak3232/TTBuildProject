"use client";
import { useRouter } from "next/navigation";
import { LoginPreview } from "@/features/auth/LoginPreview";
export default function SignInPage(){
 const router=useRouter();
 return <LoginPreview onEnter={()=>{sessionStorage.setItem("slotty-preview-entered","yes");window.dispatchEvent(new Event("slotty-preview-access"));router.push("/dashboard");}} />;
}
