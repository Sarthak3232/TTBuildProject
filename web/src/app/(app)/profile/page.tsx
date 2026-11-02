import type { Metadata } from "next";
import { ProfilePreview } from "@/features/profile/ProfilePreview";
export const metadata: Metadata = { title: "Profile" };
export default function ProfilePage(){return <ProfilePreview />;}
