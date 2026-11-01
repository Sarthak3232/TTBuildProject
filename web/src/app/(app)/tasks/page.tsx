import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <>
      <h1>Tasks</h1>
      <p>Choose an activity to explore.</p>
      <ul className="task-links">
        <li><Link href="/tasks/studbot">Studbot</Link></li>
        <li><Link href="/tasks/runTracker">Run / Walk Tracker</Link></li>
      </ul>
      <p className="placeholder-note">Activity tracking and custom tasks are coming soon.</p>
    </>
  );
}
