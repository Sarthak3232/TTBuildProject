export type TaskKind = "study" | "run" | "walk" | "custom";
export type Task = { id: string; kind: TaskKind; name: string; description: string; minimumMs: number | null; reflectionQuestion: string | null; archivedAt: string | null };
export type Activity = { id: string; taskId: string; task: Task; state: "created" | "running" | "paused" | "completed" | "cancelled"; revision: number; activeSince: string | null; accumulatedMs: number; eligibleMs: number; startedAt: string; serverTime: string };
export type Completion = { id: string; sessionId: string; task: Task; description: string; reflection: string | null; completedAt: string; timezone: string; eligibleMs: number; distanceM: number | null; tokenAward: number };
export type Goal = { id: string; taskId: string; taskName: string; localDate: string; targetMs: number; progressMs: number; provisionalMs: number; timezone: string; repeatKind: "today" | "daily" | "weekdays"; weekdays: number[] | null; completedAt: string | null };
export type Roll = { id: string; allocations: number[]; cost: number; threshold: number; won: boolean; slot: number | null; policyVersion: string; deliveryState: "hardware_pending" | "not_applicable"; createdAt: string; balance: number };
export type AppData = { profile: { displayName: string; timezone: string; email: string }; balance: number; tasks: Task[]; activity: Activity | null; goals: Goal[]; today: string; earnedToday: number; completedToday: number; completionCount: number; latestRoll: Roll | null; serverTime: string };
export function activeMilliseconds(activity: Activity | null, serverNow = Date.now()): number {
 if (!activity) return 0;
 return activity.accumulatedMs + (activity.state === "running" && activity.activeSince ? Math.max(0, serverNow - Date.parse(activity.activeSince)) : 0);
}
export function formatDuration(ms: number): string { const seconds = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":"); }
