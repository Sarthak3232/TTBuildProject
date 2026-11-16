import { activeMilliseconds, type Activity } from "@/domain/activity";

/** Display the server total plus its bounded grace lease; never submit time. */
export function savedStudyTiming(activity: Activity | null, sinceResponseMs: number) {
  if (!activity) return { elapsedMs: 0, running: false };
  const now = Date.parse(activity.serverTime) + Math.max(0, sinceResponseMs);
  return { elapsedMs: activeMilliseconds(activity, now), running: activity.state === "running"
    && Boolean(activity.studyCreditUntil) && now < Date.parse(activity.studyCreditUntil!) };
}

export function formatStudyTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
