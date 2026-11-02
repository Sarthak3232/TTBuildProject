import type { Metadata } from "next";
import { CompletionLog } from "@/features/history/CompletionLog";
export const metadata: Metadata = { title: "History" };
export default function HistoryPage() { return <CompletionLog />; }
