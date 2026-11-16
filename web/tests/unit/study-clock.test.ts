import { expect, it } from "vitest";
import { savedStudyTiming, formatStudyTime } from "../../src/features/studbot/study-clock";
import { activeMilliseconds, type Activity } from "../../src/domain/activity";

const activity: Activity = { id: "study", taskId: "task", task: { id: "task", name: "Study", kind: "study",
  description: "", minimumMs: null, reflectionQuestion: null, archivedAt: null }, state: "running", revision: 0,
  accumulatedMs: 1798000, eligibleMs: 1798000, activeSince: "2026-11-15T12:00:00Z",
  startedAt: "2026-11-15T11:30:00Z", serverTime: "2026-11-15T12:00:00Z", studyCreditUntil: "2026-11-15T12:00:05Z" };

it("includes every second of the five-second credited grace", () => {
  expect(savedStudyTiming(activity, 4000)).toEqual({ running: true, elapsedMs: 1802000 });
  expect(savedStudyTiming(activity, 5000)).toEqual({ running: false, elapsedMs: 1803000 });
});

it("cannot invent time after a connection gap or suspended tab", () => {
  expect(savedStudyTiming(activity, 600000)).toEqual({ running: false, elapsedMs: 1803000 });
});

it("restores saved paused progress without counting wall-clock time away", () => {
  expect(savedStudyTiming({ ...activity, state: "paused", activeSince: null }, 86400000))
    .toEqual({ running: false, elapsedMs: 1798000 });
});

it("never extrapolates unleased study time, while ordinary manual timers still run", () => {
  expect(savedStudyTiming({ ...activity, studyCreditUntil: null }, 5000).elapsedMs).toBe(1798000);
  expect(activeMilliseconds({ ...activity, task: { ...activity.task, kind: "run" } }, Date.parse(activity.serverTime) + 5000)).toBe(1803000);
  expect(formatStudyTime(3661000)).toBe("01:01:01");
});
