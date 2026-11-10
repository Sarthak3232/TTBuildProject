import type { Metadata } from "next";
import { SignUpPreview } from "@/features/auth/SignUpPreview";
export const metadata: Metadata = { title: "Sign up" };
export default function SignUpPage(){return <SignUpPreview />;}
