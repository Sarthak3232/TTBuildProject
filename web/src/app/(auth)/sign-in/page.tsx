import { LoginPreview } from "@/features/auth/LoginPreview";
export default async function SignInPage({searchParams}:{searchParams:Promise<{message?:string}>}){const{message}=await searchParams;return <LoginPreview message={typeof message==="string"?message.slice(0,250):undefined}/>}
