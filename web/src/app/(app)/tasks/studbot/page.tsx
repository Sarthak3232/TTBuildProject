import type { Metadata } from "next";
import { StudyPreview } from "@/features/studbot/StudyPreview";
export const metadata: Metadata = { title: "StudBot" };
export default function StudbotPage() { return <StudyPreview />; }
