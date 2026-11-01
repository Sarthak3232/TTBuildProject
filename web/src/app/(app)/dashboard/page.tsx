import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      <p>Your daily goals, completed activities, and token summary will appear here.</p>
      <p className="placeholder-note">Coming soon.</p>
    </>
  );
}
