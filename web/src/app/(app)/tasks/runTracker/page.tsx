import type { Metadata } from "next";
import { ActivityPreview } from "@/features/tracking/ActivityPreview";
export const metadata: Metadata = { title: "Track Activity" };
export default function RunTrackerPage() { return <ActivityPreview />; }
