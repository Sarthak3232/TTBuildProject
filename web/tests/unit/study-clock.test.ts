import { expect, it } from "vitest";
import { StudyClock, formatStudyTime } from "../../src/features/studbot/study-clock";

function started() {
  const clock = new StudyClock();
  for (const now of [0, 1000, 2000]) clock.observe("compatible", now);
  return clock;
}

it("starts after two seconds of compatible posture and counts actual elapsed time", () => {
  const clock = started();
  expect(clock.snapshot(2500)).toEqual({ running: true, elapsedMs: 500 });
  expect(clock.observe("compatible", 3000)).toEqual({ running: true, elapsedMs: 1000 });
});

it("pauses after five seconds away and resumes without clearing the total", () => {
  const clock = started();
  for (let now = 3000; now <= 8000; now += 1000) clock.observe("away", now);
  expect(clock.snapshot(8500)).toEqual({ running: false, elapsedMs: 6000 });
  clock.observe("compatible", 9000);
  clock.observe("compatible", 10000);
  expect(clock.observe("compatible", 11000).running).toBe(true);
  expect(clock.snapshot(11500).elapsedMs).toBe(6500);
});

it("short glances do not pause, but unknown views pause after the grace period", () => {
  const clock = started();
  clock.observe("away", 3000);
  clock.observe("compatible", 4000);
  expect(clock.running).toBe(true);
  for (let now = 5000; now <= 10000; now += 1000) clock.observe("unknown", now);
  expect(clock.running).toBe(false);
});

it("stale results and tab suspension cannot accrue unbounded time", () => {
  const clock = started();
  expect(clock.snapshot(60000)).toEqual({ running: false, elapsedMs: 3000 });
  expect(clock.observe("compatible", 60000).running).toBe(false);
  clock.observe("compatible", 61000);
  expect(clock.observe("compatible", 62000).running).toBe(true);
});

it("manual pause stops counting immediately and requires reacquisition", () => {
  const clock = started();
  clock.pause(2500);
  expect(clock.snapshot(5000)).toEqual({ running: false, elapsedMs: 500 });
  expect(clock.observe("compatible", 6000).running).toBe(false);
  expect(formatStudyTime(3661000)).toBe("01:01:01");
});
