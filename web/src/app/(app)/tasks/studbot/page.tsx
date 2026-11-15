import type { Metadata } from "next";
import { StudbotFocus } from "@/features/studbot/StudbotFocus";
export const metadata: Metadata = { title: "StudBot" };
export default function StudbotPage() { return <StudbotFocus />; }
