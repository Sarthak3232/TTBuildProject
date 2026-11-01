import type { Metadata } from "next";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <h1>History</h1>
      <p>Your completed activities, reflections, dates, and earned tokens will appear here.</p>
      <p className="placeholder-note">Coming soon.</p>
    </>
  );
}
