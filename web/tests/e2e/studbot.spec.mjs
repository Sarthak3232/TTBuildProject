import { test, expect } from "@playwright/test";

// Component-only browser checks. Real auth/calibration boundaries are tested
// separately; this fixture never adds a production auth bypass or opens a camera.
async function installStudyApi(page, initialMs = 0, rewardIntervalMs = 1800000) {
  const makeActivity = ms => ({
    id: "11111111-1111-4111-8111-111111111111", taskId: "22222222-2222-4222-8222-222222222222",
    task: { id: "22222222-2222-4222-8222-222222222222", kind: "study", name: "Study", description: "", minimumMs: null, reflectionQuestion: null, archivedAt: null },
    state: "paused", activeSince: null, studyCreditUntil: null, rewardIntervalMs,
    accumulatedMs: ms, eligibleMs: ms, revision: 0, startedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  });
  let activity = initialMs ? makeActivity(initialMs) : null;
  let balance = 0;
  let stamp = Date.now();
  await page.route("**/api/studbot/**", async route => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1);
    const now = Date.now();
    if (activity?.state === "running") activity.accumulatedMs += Math.min(5000, now - stamp);
    stamp = now;
    if (activity) { activity.eligibleMs = activity.accumulatedMs; activity.serverTime = new Date(now).toISOString(); }
    if (action === "start") {
      if (!activity || ["completed", "cancelled"].includes(activity.state)) activity = makeActivity(0);
      activity.state = "running";
    }
    if (["pause", "stop"].includes(action) && activity && !["completed", "cancelled"].includes(activity.state)) activity.state = "paused";
    let completion = null;
    if (action === "session" && route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      activity.state = input.action === "complete" ? "completed" : "cancelled";
      if (input.action === "complete") { completion = { tokenAward: Math.floor(activity.eligibleMs / activity.rewardIntervalMs) }; balance += completion.tokenAward; }
    }
    if (activity) {
      activity.activeSince = activity.state === "running" ? new Date(now).toISOString() : null;
      activity.studyCreditUntil = activity.state === "running" ? new Date(now + 5000).toISOString() : null;
    }
    const progress = { activity, balance, completion, serverTime: new Date(now).toISOString(), testRewards: rewardIntervalMs === 15000 };
    if (action === "session") return route.fulfill({ json: progress });
    const reply = action === "classify" ? { state: "compatible", reason: "calibrated_book" }
      : { phase: action === "screen" ? "book" : ["book", "finish"].includes(action) ? "ready" : "screen", samples: 6, seconds: 5 };
    return route.fulfill({ json: { ...reply, progress } });
  });
}
test.beforeEach(async ({ page }) => installStudyApi(page));

test("15-second test sessions show the captured reward rate and credit on finish", async ({ page }) => {
  await installStudyApi(page, 15000, 15000);
  await page.goto("http://127.0.0.1:3101/tasks/studbot");
  await expect(page.getByLabel("Study time")).toHaveText("00:00:15");
  await expect(page.getByRole("status").filter({ hasText: "Test rewards enabled" })).toBeVisible();
  await expect(page.getByText(/1 tokens on completion/)).toBeVisible();
  await page.getByRole("button", { name: "Finish & save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Study session saved. Earned 1 tokens." })).toBeVisible();
});

async function enter(page) {
  await page.goto("http://127.0.0.1:3101/tasks/studbot");
  const login = page.getByRole("button", { name: "Log in" });
  await expect(login.or(page.getByRole("button", { name: "Open focus mode" }))).toBeVisible();
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole("button", { name: "Open focus mode" })).toBeVisible();
}

test("saved progress resumes after closing and reload, then Finish saves the token award", async ({ page }) => {
  await installStudyApi(page, 1800000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      return canvas.captureStream(5);
    };
  });
  await enter(page);
  await expect(page.getByLabel("Study time")).toHaveText("00:30:00");
  await page.getByRole("button", { name: "Open focus mode" }).click();
  const dialog = page.getByRole("dialog", { name: "Focus mode" });
  await dialog.getByRole("button", { name: "Calibrate screen" }).click();
  await dialog.getByRole("button", { name: "Start studying" }).click();
  await expect(dialog.getByText("Timer running", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Focus session time")).not.toHaveText("00:30:00");
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/api/studbot/stop")),
    dialog.getByRole("button", { name: "Close focus mode" }).click(),
  ]);
  await expect(page.getByText("Timer paused", { exact: true }).first()).toBeVisible();
  const total = await page.getByLabel("Study time").textContent();
  await page.reload();
  await expect(page.getByLabel("Study time")).toHaveText(total);
  await page.getByRole("button", { name: "Finish & save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Study session saved. Earned 1 tokens." })).toBeVisible();
});

test("camera, forward calibration, live timer, pause/resume, close", async ({ page }) => {
  await page.addInitScript(() => {
    window.syntheticTracks = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints.audio !== false) throw new Error("Microphone must not be requested");
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext("2d"); context.fillStyle = "#aaa"; context.fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(5);
      window.syntheticTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await enter(page);
  await page.getByRole("button", { name: "Open focus mode" }).click();
  const dialog = page.getByRole("dialog", { name: "Focus mode" });
  await dialog.getByRole("button", { name: "Calibrate screen" }).click();
  await dialog.getByRole("button", { name: "Start studying" }).click({ timeout: 15000 });
  await expect(dialog.getByText("compatible", { exact: true })).toBeVisible();
  await expect(dialog.getByText("calibrated book", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Timer running", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Focus session time")).not.toHaveText("00:00:00");
  await dialog.getByRole("button", { name: "Pause camera" }).click();
  await expect(dialog.getByText("Timer paused", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.syntheticTracks.every(track => track.readyState === "ended"))).toBe(true);
  await dialog.getByRole("button", { name: "Resume studying" }).click();
  await expect(dialog.getByText("compatible", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close focus mode" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => window.syntheticTracks.every(track => track.readyState === "ended"))).toBe(true);
  expect(await page.content()).not.toContain("isolated-browser-test-token");
});

test("missing classifier and denied camera access show actionable errors", async ({ page }) => {
  await enter(page);
  await page.route("**/api/studbot/open", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Start FastAPI on port 8000." }) }));
  await page.getByRole("button", { name: "Open focus mode" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Start FastAPI on port 8000." })).toBeVisible();
  await page.unroute("**/api/studbot/open");
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); }; });
  await page.getByRole("button", { name: "Open focus mode" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Camera permission was denied" })).toBeVisible();
});

test("phone layout and Escape close the focus dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      return canvas.captureStream(5);
    };
  });
  await enter(page);
  await page.getByRole("button", { name: "Open focus mode" }).click();
  const dialog = page.getByRole("dialog", { name: "Focus mode" });
  await expect(dialog.getByRole("button", { name: "Calibrate screen" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("focus-phone.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("background tabs keep desktop study running and stop mobile capture", async ({ page, isMobile }) => {
  let observations = 0;
  await page.route("**/api/studbot/classify", route => {
    observations++;
    return route.fallback();
  });
  await page.addInitScript(() => {
    window.syntheticTracks = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(5);
      window.syntheticTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await enter(page);
  await page.getByRole("button", { name: "Open focus mode" }).click();
  const dialog = page.getByRole("dialog", { name: "Focus mode" });
  await expect(dialog.getByRole("button", { name: "Calibrate screen" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Calibrate screen" }).click();
  await dialog.getByRole("button", { name: "Start studying" }).click();
  await expect(dialog.getByText("Timer running", { exact: true })).toBeVisible();
  const before = observations;
  const timeBefore = await dialog.getByLabel("Focus session time").textContent();
  await page.screenshot({ path: test.info().outputPath("focus-desktop.png") });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  if (isMobile) {
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => window.syntheticTracks.every(track => track.readyState === "ended"))).toBe(true);
    await expect(page.getByText("Timer paused", { exact: true }).first()).toBeVisible();
  } else {
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.syntheticTracks.every(track => track.readyState === "live"))).toBe(true);
    await expect.poll(() => observations).toBeGreaterThan(before);
    await expect(dialog.getByLabel("Focus session time")).not.toHaveText(timeBefore);
    await expect(dialog.getByText("Timer running", { exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => window.syntheticTracks.every(track => track.readyState === "ended"))).toBe(true);
  }
});

test("calibration diagnostics show camera dimensions and specific rejection causes", async ({ page }) => {
  // This diagnostic-display test needs no live ML session; requests are mocked.
  await page.route("**/api/studbot/open", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ phase: "screen", samples: 0, seconds: 0 }) }));
  await page.route("**/api/studbot/stop", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ stopped: true }) }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      return canvas.captureStream(5);
    };
  });
  let cause = "face";
  await page.route("**/api/studbot/screen", route => {
    const diagnostics = cause === "face"
      ? { faceCount: 0, bodyPresent: true, orientationAvailable: false, imageUsable: true, reasons: ["face_not_detected"] }
      : cause === "shoulders"
        ? { faceCount: 1, bodyPresent: false, orientationAvailable: true, imageUsable: true, reasons: ["shoulders_unreliable"] }
        : { faceCount: 0, bodyPresent: false, orientationAvailable: false, imageUsable: false, reasons: ["image_too_dark"] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ phase: "screen", usable: false, samples: 0, seconds: 0, diagnostics }) });
  });
  await enter(page);
  await page.getByRole("button", { name: "Open focus mode" }).click();
  const dialog = page.getByRole("dialog", { name: "Focus mode" });
  await expect(dialog.getByText(/Camera capture: 320 × 240/)).toBeVisible();
  await dialog.getByRole("button", { name: "Calibrate screen" }).click();
  await expect(dialog.getByText(/No face was detected/)).toBeVisible();
  await expect(dialog.getByText(/Sent JPEG: 320 × 240/)).toBeVisible();
  cause = "shoulders";
  await expect(dialog.getByText(/could not verify both shoulders/)).toBeVisible();
  await expect(dialog.getByText(/Head angle: available/)).toBeVisible();
  cause = "dark";
  await expect(dialog.getByText(/image is too dark/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("calibration-diagnostics.png") });
  await dialog.getByRole("button", { name: "Close focus mode" }).click();
});
