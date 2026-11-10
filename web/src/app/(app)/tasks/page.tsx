import type { Metadata } from "next";
import { TaskList } from "@/features/tasks/TaskList";
export const metadata: Metadata = { title: "Tasks" };
export default function TasksPage() { return <TaskList />; }
