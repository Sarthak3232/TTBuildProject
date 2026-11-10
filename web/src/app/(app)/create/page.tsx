import type { Metadata } from "next";
import { CreateList } from "@/features/tasks/CreateList";
export const metadata: Metadata = { title: "Create" };
export default function CreatePage() { return <CreateList />; }
