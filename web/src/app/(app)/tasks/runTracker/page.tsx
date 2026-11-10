import type { Metadata } from "next";
import { ActivityPreview } from "@/features/tracking/ActivityPreview";
export const metadata: Metadata = { title: "Track Activity" };
export default async function RunTrackerPage({ searchParams }: { searchParams: Promise<{ session?: string | string[] }> }) {
  const { session } = await searchParams;
  return <ActivityPreview savedSessionId={typeof session === "string" ? session : undefined} />;
}
