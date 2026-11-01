import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Studbot" };

export default function StudbotPage() {
  return (
    <>
      <Link className="back-link" href="/tasks">Back to Tasks</Link>
      <h1>Studbot</h1>
      <p>Your study timer, camera setup, and study activity checks will appear here.</p>
      <p className="placeholder-note">Coming soon.</p>
    </>
  );
}
