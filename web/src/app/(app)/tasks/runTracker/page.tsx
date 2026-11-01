import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Run / Walk Tracker" };

export default function RunTrackerPage() {
  return (
    <>
      <Link className="back-link" href="/tasks">Back to Tasks</Link>
      <h1>Run / Walk Tracker</h1>
      <p>Your route map, distance, and activity timer will appear here.</p>
      <p className="placeholder-note">Coming soon.</p>
    </>
  );
}
