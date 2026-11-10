import { expect, test, type Page } from "@playwright/test";
import type { Activity, AppData, Completion, Task } from "../../src/domain/activity";
import type { RouteFix, RoutePoint, SavedRoute } from "../../src/domain/time/route";
const harness = "http://127.0.0.1:3101";
const sessionId = "b1000000-0000-4000-8000-000000000001";
const walk: Task = { id: "b2000000-0000-4000-8000-000000000001", kind: "walk", name: "Walk", description: "", minimumMs: null, reflectionQuestion: null, archivedAt: null };
const run: Task = { ...walk, id: "b2000000-0000-4000-8000-000000000002", kind: "run", name: "Run" };
const emptyRoute = (): SavedRoute => ({ points: [], distanceM: 0, nextSequence: 0, coverage: { pointCount: 0, segmentCount: 0, lastCapturedAt: null }, serverTime: new Date().toISOString() });
const running = (seconds = 0): Activity => ({ id: sessionId, taskId: walk.id, task: walk, state: "running", revision: 0, activeSince: new Date(Date.now() - seconds * 1000).toISOString(), accumulatedMs: 0, eligibleMs: 0, startedAt: new Date(Date.now() - seconds * 1000).toISOString(), serverTime: new Date().toISOString() });
const point = (sequence: number, lng = 0, segmentId = 0): RoutePoint => ({ sequence, lng, lat: 0, accuracyM: 5, capturedAt: new Date(Date.now() - 2000 + sequence).toISOString(), segmentId });
type Call = { path: string; method: string; body: Record<string, unknown> | null };
type BrowserWindow = Window & { __trackingGps: { active: number; starts: number; clears: number; emit: (value: { lat: number; lng: number; timestamp?: number }) => void } };

async function installGps(page: Page, denied = false) {
  await page.addInitScript(({ denied }) => {
    const watchers = new Map<number, { success: PositionCallback; error?: PositionErrorCallback | null }>();
    let sequence = 0;
    const control = {
      get active() { return watchers.size; }, starts: 0, clears: 0,
      emit(value: { lat: number; lng: number; timestamp?: number }) {
        for (const watcher of watchers.values()) watcher.success({ timestamp: value.timestamp ?? Date.now(), coords: { latitude: value.lat, longitude: value.lng, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, toJSON() { return {}; } } as GeolocationPosition);
      },
    };
    Object.defineProperty(window, "__trackingGps", { value: control });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition(success: PositionCallback, error?: PositionErrorCallback | null) {
        const id = ++sequence; control.starts++; watchers.set(id, { success, error });
        if (denied) queueMicrotask(() => error?.({ code: 1, message: "Permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
        return id;
      },
      clearWatch(id: number) { if (watchers.delete(id)) control.clears++; },
    } });
  }, { denied });
}

async function fixtures(page: Page, initial?: Activity, saved?: SavedRoute) {
  const state = { activity: initial ?? null as Activity | null, route: saved ?? emptyRoute(), completion: saved?.completion ?? null as Completion | null, calls: [] as Call[], balance: 0, lastRouteRevision: initial?.revision ?? 0 };
  await page.route("**/api/**", async request => {
    const path = new URL(request.request().url()).pathname;
    const method = request.request().method();
    const body = method === "GET" ? null : request.request().postDataJSON() as Record<string, unknown>;
    state.calls.push({ path, method, body });
    const reply = (value: unknown, status = 200) => request.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/api/app" && method === "GET") {
      const data: AppData = { profile: { displayName: "Isolated test", timezone: "UTC", email: "isolated@example.test" }, balance: state.balance, tasks: [walk, run], activity: state.activity, goals: [], today: "2026-11-09", earnedToday: 0, completedToday: 0, completionCount: state.completion ? 1 : 0, latestRoll: null, serverTime: new Date().toISOString() };
      return reply(data);
    }
    if (path === "/api/sessions" && method === "POST") {
      const task = body?.taskId === run.id ? run : walk;
      state.activity = { ...running(), taskId: task.id, task };
      return reply({ activity: state.activity });
    }
    if (path === `/api/sessions/${sessionId}/route` && method === "GET") return reply({ ...state.route, completion: state.completion, serverTime: new Date().toISOString() });
    if (path === `/api/sessions/${sessionId}/route` && method === "POST") {
      if (state.activity?.state !== "running" || body?.revision !== state.activity.revision) return reply({ error: { message: "Activity changed" } }, 409);
      const segment = state.route.points.length ? state.route.points.at(-1)!.segmentId + (body.gap || state.lastRouteRevision !== state.activity.revision ? 1 : 0) : 0;
      const accepted = (body.points as RouteFix[]).map(fix => ({ ...fix, segmentId: segment }));
      state.route.points.push(...accepted);
      state.route.nextSequence = (state.route.points.at(-1)?.sequence ?? -1) + 1;
      state.route.distanceM = state.route.points.length > 1 ? 125 : 0;
      state.route.coverage = { pointCount: state.route.points.length, segmentCount: segment + 1, lastCapturedAt: state.route.points.at(-1)?.capturedAt ?? null };
      state.lastRouteRevision = state.activity.revision;
      return reply({ ...state.route, points: accepted, accepted: accepted.length, rejected: 0, duplicates: 0, reasons: {} });
    }
    if (path === `/api/sessions/${sessionId}` && method === "PATCH") {
      const previous = state.activity;
      if (!previous || body?.revision !== previous.revision) return reply({ error: { message: "Activity changed" } }, 409);
      const elapsed = previous.accumulatedMs + (previous.state === "running" ? Math.max(0, Date.now() - Date.parse(previous.activeSince!)) : 0);
      const action = body.action;
      const next: Activity = { ...previous, revision: previous.revision + 1, accumulatedMs: elapsed, eligibleMs: elapsed, activeSince: action === "resume" ? new Date().toISOString() : null, state: action === "resume" ? "running" : action === "pause" ? "paused" : action === "complete" ? "completed" : "cancelled", serverTime: new Date().toISOString() };
      if (action === "complete") {
        state.completion = { id: "b3000000-0000-4000-8000-000000000001", sessionId, task: next.task, description: String(body.description ?? ""), reflection: null, completedAt: new Date().toISOString(), timezone: "UTC", eligibleMs: elapsed, distanceM: state.route.distanceM, tokenAward: Math.floor(elapsed / 1_800_000) };
        state.balance += state.completion.tokenAward;
      }
      state.activity = next.state === "completed" || next.state === "cancelled" ? null : next;
      return reply({ activity: next, completion: state.completion, balance: state.balance });
    }
    return reply({ error: { message: `Unexpected fixture request: ${method} ${path}` } }, 404);
  });
  return state;
}
const waitForGps = (page: Page, active = 1) => expect.poll(() => page.evaluate(() => (window as unknown as BrowserWindow).__trackingGps.active)).toBe(active);
const emit = (page: Page, value: { lat: number; lng: number; timestamp?: number }) => page.evaluate(value => (window as unknown as BrowserWindow).__trackingGps.emit(value), value);

test("start, GPS, pause, resume and finish use the shared control contract", async ({ page }) => {
  await installGps(page);
  const state = await fixtures(page);
  await page.goto(harness);
  await page.getByLabel("Activity type").selectOption("run");
  await page.getByRole("button", { name: "Start run", exact: true }).click();
  await waitForGps(page);
  await expect(page.getByLabel("Activity type")).toBeDisabled();
  await emit(page, { lat: 0, lng: 0 });
  await page.getByRole("button", { name: "Pause activity", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume activity" })).toBeEnabled();
  await waitForGps(page, 0);
  expect(state.route.points).toHaveLength(1);
  const pausedTimer = await page.getByTestId("activity-timer").textContent();
  await emit(page, { lat: 20, lng: 20 });
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("activity-timer")).toHaveText(pausedTimer!);
  expect(state.route.points).toHaveLength(1);
  await page.getByRole("button", { name: "Resume activity" }).click();
  await waitForGps(page);
  await emit(page, { lat: 0, lng: 0.00005 });
  await page.getByLabel("Activity notes (optional)").fill("Morning walk");
  await page.getByRole("button", { name: "Finish and save" }).click();
  await expect(page.getByRole("heading", { name: "Run saved" })).toBeVisible();
  await waitForGps(page, 0);
  expect(state.completion?.description).toBe("Morning walk");
  expect(state.completion?.task.kind).toBe("run");
  expect(state.calls.find(call => call.path === "/api/sessions" && call.method === "POST")?.body?.taskId).toBe(run.id);
  const controls = state.calls.filter(call => call.path === `/api/sessions/${sessionId}` && call.method === "PATCH");
  expect(controls.map(call => call.body?.action)).toEqual(["pause", "resume", "complete"]);
  expect(controls.map(call => call.body?.revision)).toEqual([0, 1, 2]);
  for (const call of controls) expect(call.body?.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(state.calls.findIndex(call => call.path.endsWith("/route") && call.method === "POST")).toBeLessThan(state.calls.findIndex(call => call.method === "PATCH"));
  expect(state.route.points.map(point => point.segmentId)).toEqual([0, 1]);
});

test("refresh restores running timer and route cursor without a second session", async ({ page }) => {
  await installGps(page);
  const activity = running(65);
  activity.accumulatedMs = 120_000;
  const route = { ...emptyRoute(), points: [point(54), point(55, 0.0001)], nextSequence: 56, distanceM: 125, coverage: { pointCount: 2, segmentCount: 1, lastCapturedAt: new Date().toISOString() } };
  const state = await fixtures(page, activity, route);
  await page.goto(harness);
  await waitForGps(page);
  const seconds = (value: string) => value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const before = seconds((await page.getByTestId("activity-timer").textContent())!);
  expect(before).toBeGreaterThanOrEqual(185);
  expect(Math.abs(before - (120 + (Date.now() - Date.parse(activity.activeSince!)) / 1000))).toBeLessThan(3);
  await expect(page.getByText("Distance", { exact: true }).locator("..").locator("dd")).toContainText("0.13");
  await page.reload();
  await waitForGps(page);
  const after = seconds((await page.getByTestId("activity-timer").textContent())!);
  expect(after).toBeGreaterThanOrEqual(before);
  expect(Math.abs(after - (120 + (Date.now() - Date.parse(activity.activeSince!)) / 1000))).toBeLessThan(3);
  await emit(page, { lat: 0, lng: 0.00015 });
  await page.getByRole("button", { name: "Pause activity", exact: true }).click();
  expect(state.route.points.at(-1)?.sequence).toBe(56);
  expect(state.calls.filter(call => call.path === "/api/sessions" && call.method === "POST")).toHaveLength(0);
  expect(state.calls.filter(call => call.path.endsWith("/route") && call.method === "GET").length).toBeGreaterThanOrEqual(2);
});

test("denied GPS stops collection while the server-backed timer advances", async ({ page }) => {
  await installGps(page, true);
  const state = await fixtures(page, running(59));
  await page.goto(harness);
  await expect(page.getByText(/Location permission denied/)).toBeVisible();
  await waitForGps(page, 0);
  const initial = await page.getByTestId("activity-timer").textContent();
  await expect(page.getByTestId("activity-timer")).not.toHaveText(initial!);
  await expect(page.getByRole("button", { name: "Pause activity", exact: true })).toBeEnabled();
  expect(state.activity?.state).toBe("running");
  expect(state.calls.some(call => call.method === "PATCH")).toBe(false);
  expect(state.calls.some(call => call.path.endsWith("/route") && call.method === "POST")).toBe(false);
});

test("saved route keeps summary through map failure without mutation controls", async ({ page }) => {
  await installGps(page);
  const completion: Completion = { id: "b3000000-0000-4000-8000-000000000001", sessionId, task: walk, description: "Park loop", reflection: null, completedAt: new Date().toISOString(), timezone: "UTC", eligibleMs: 3_600_000, distanceM: 1250, tokenAward: 2 };
  const route: SavedRoute = { ...emptyRoute(), points: [point(0), point(1, 0.001), point(2, 0.002, 1)], distanceM: 1250, nextSequence: 3, coverage: { pointCount: 3, segmentCount: 2, lastCapturedAt: new Date().toISOString() }, completion };
  const state = await fixtures(page, undefined, route);
  await page.goto(`${harness}/?session=${sessionId}`);
  await expect(page.getByRole("region", { name: "Saved activity summary" })).toContainText("2 tokens earned");
  await expect(page.getByText("Park loop", { exact: true })).toBeVisible();
  await expect(page.getByText(/This browser cannot display the map/)).toBeVisible();
  await expect(page.getByText(/3 GPS fixes · 2 route segments/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Start|Pause|Resume|Finish|Confirm discard/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to history" })).toHaveAttribute("href", "/history");
  await waitForGps(page, 0);
  expect(state.calls.every(call => call.method === "GET")).toBe(true);
});
