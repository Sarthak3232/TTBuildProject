import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudbotBridge } from "../src/server/studbot-bridge.ts";

const TOKEN = "test-only-bridge-secret-0123456789";

function fixture(overrides = {}, persistence) {
  let clock = 0;
  let cookie = "";
  let userId = "user-a";
  const calls = [];
  const settings = { mode: "development", serviceUrl: "http://127.0.0.1:8000", token: TOKEN, ...overrides };
  let responder = (url, init) => {
    if (url.pathname === "/health/ready") return Response.json({ ready: true, modelVersion: "test-model", ruleVersion: "test-rule" });
    const headers = new Headers(init.headers);
    const common = { sessionId: headers.get("X-Study-Session"), sequence: Number(headers.get("X-Frame-Sequence")), modelVersion: "test-model", ruleVersion: "test-rule" };
    if (url.pathname.endsWith("calibration-observation")) return Response.json({ ...common, usable: true,
      phase: headers.get("X-Calibration-Phase"), yaw: 0, pitch: headers.get("X-Calibration-Phase") === "book" ? -45 : 0 });
    return Response.json({ ...common, state: "compatible", reason: "calibrated_book" });
  };
  const bridge = createStudbotBridge({ config: () => settings, authorize: async () => userId, persistence, now: () => clock,
    fetcher: async (url, init) => { calls.push({ url, init }); return responder(url, init); } });
  async function send(action, options = {}) {
    const { headers: extra, ...rest } = options;
    const request = new Request(`http://localhost:3000/api/studbot/${action}`, {
      method: "POST", headers: { origin: "http://localhost:3000", cookie, ...extra }, ...rest,
    });
    const response = await bridge(request, action);
    if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  }
  const image = () => ({ headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array([255, 216, 255, 217]) });
  async function calibrate() {
    assert.equal((await send("open")).status, 200);
    for (const phase of ["screen", "book"]) for (let i = 0; i < 6; i++) {
      clock += 1000;
      const response = await send(phase, image());
      assert.equal(response.status, 200, await response.clone().text());
    }
  }
  return { settings, bridge, send, calls, image, calibrate,
    get cookie() { return cookie; },
    signIn: id => { userId = id; },
    advance: ms => { clock += ms; }, respond: fn => { responder = fn; } };
}

test("server coordinates calibration, supplies secret/angles, and only returns labels", async () => {
  const f = fixture();
  await f.calibrate();
  f.advance(1000);
  const result = await f.send("classify", f.image());
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.state, "compatible");
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal("screen" in body || "yaw" in body, false);
  const headers = new Headers(f.calls.at(-1).init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
  const calibration = JSON.parse(Buffer.from(headers.get("X-Calibration"), "base64url"));
  assert.equal(calibration.book.pitch, -45);
});

test("production requires an HTTPS app origin and rejects cross-origin requests", async () => {
  const missing = fixture({ mode: "production" });
  assert.equal((await missing.send("open")).status, 503);
  assert.equal(missing.calls.length, 0);
  const f = fixture();
  assert.equal((await f.send("open", { headers: { origin: "https://another-site.example" } })).status, 403);
  assert.equal(f.calls.length, 0);
});

test("Next-normalized URL uses the actual local Host for the origin check", async () => {
  const f = fixture();
  const request = new Request("http://localhost:3000/api/studbot/open", { method: "POST",
    headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" } });
  assert.equal((await f.bridge(request, "open")).status, 200);
});

test("missing configuration and service authentication failures are actionable and sanitized", async () => {
  const f = fixture({ token: "" });
  assert.equal((await f.send("open")).status, 503);
  const mismatch = fixture();
  mismatch.respond(() => new Response("secret response", { status: 401 }));
  const result = await mismatch.send("open");
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /do not match/);
});

test("classification is blocked before calibration and after stop or expiry", async () => {
  const f = fixture();
  await f.send("open");
  assert.equal((await f.send("classify", f.image())).status, 409);
  await f.send("stop");
  assert.equal((await f.send("screen", f.image())).status, 409);
  await f.send("open");
  f.advance(24 * 60 * 60 * 1000);
  assert.equal((await f.send("screen", f.image())).status, 409);
});

test("oversized streamed body never reaches inference", async () => {
  const f = fixture();
  await f.send("open");
  const count = f.calls.length;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(150000)); c.enqueue(new Uint8Array(150000)); c.close(); } });
  const result = await f.send("screen", { headers: { "Content-Type": "image/jpeg" }, body: stream, duplex: "half" });
  assert.equal(result.status, 413);
  assert.equal(f.calls.length, count);
});

test("brief detection gaps preserve valid samples without accepting unusable frames", async () => {
  const f = fixture();
  await f.send("open");
  await f.send("screen", f.image());
  f.advance(1000);
  f.respond((url, init) => { const h = new Headers(init.headers); return Response.json({
    sessionId: h.get("X-Study-Session"), sequence: Number(h.get("X-Frame-Sequence")),
    modelVersion: "test-model", ruleVersion: "test-rule", phase: "screen", usable: false,
    diagnostics: { faceCount: 1, bodyPresent: false, orientationAvailable: true, imageUsable: true,
      reasons: ["shoulders_unreliable", "private-arbitrary-detail"], landmarks: [1, 2, 3] },
  }); });
  const data = await (await f.send("screen", f.image())).json();
  assert.equal(data.samples, 1);
  assert.equal(data.seconds, 0);
  assert.equal(data.phase, "screen");
  assert.deepEqual(data.diagnostics.reasons, ["shoulders_unreliable"]);
  assert.equal(data.diagnostics.orientationAvailable, true);
  assert.equal("landmarks" in data.diagnostics, false);
  f.advance(3001);
  const expired = await (await f.send("screen", f.image())).json();
  assert.equal(expired.samples, 0);
  assert.equal(expired.seconds, 0);
  assert.equal(expired.phase, "screen");
});

test("book calibration tolerates a brief dropout but still needs four valid samples spanning five seconds", async () => {
  const f = fixture();
  await f.send("open");
  for (let i = 0; i < 6; i++) { f.advance(1000); await f.send("screen", f.image()); }
  for (const [offset, usable] of [[1000, true], [1000, true], [1000, false], [1000, true], [2000, true]]) {
    f.advance(offset);
    f.respond((url, init) => {
      const headers = new Headers(init.headers);
      return Response.json({ sessionId: headers.get("X-Study-Session"), sequence: Number(headers.get("X-Frame-Sequence")),
        modelVersion: "test-model", ruleVersion: "test-rule", phase: "book", usable,
        ...(usable ? { yaw: 0, pitch: -45 } : {}) });
    });
    const result = await (await f.send("book", f.image())).json();
    assert.equal(result.phase, offset === 2000 ? "ready" : "book");
    if (!usable) { assert.equal(result.samples, 2); assert.equal(result.seconds, 1); }
  }
});

test("a late frame cannot restore calibration after reset", async () => {
  const f = fixture();
  await f.send("open");
  let finish;
  f.respond((url, init) => new Promise(resolve => { const h = new Headers(init.headers); finish = () => resolve(Response.json({
    sessionId: h.get("X-Study-Session"), sequence: Number(h.get("X-Frame-Sequence")),
    modelVersion: "test-model", ruleVersion: "test-rule", phase: "screen", usable: true, yaw: 0, pitch: 0,
  })); }));
  const pending = f.send("screen", f.image());
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.send("screen", f.image())).status, 429);
  assert.equal((await f.send("reset")).status, 200);
  finish();
  assert.equal((await pending).status, 409);
});

test("version changes invalidate calibration", async () => {
  const f = fixture();
  await f.calibrate(); f.advance(1000);
  f.respond((url, init) => { const h = new Headers(init.headers); return Response.json({
    sessionId: h.get("X-Study-Session"), sequence: Number(h.get("X-Frame-Sequence")),
    modelVersion: "new-model", ruleVersion: "test-rule", state: "compatible", reason: "calibrated_screen",
  }); });
  assert.equal((await f.send("classify", f.image())).status, 409);
  f.advance(1000);
  assert.equal((await f.send("classify", f.image())).status, 409);
});

test("authentication is required before classifier calls", async () => {
  const f = fixture();
  f.signIn(null);
  assert.equal((await f.send("open")).status, 401);
  assert.equal((await f.send("health", { method: "GET" })).status, 401);
  assert.equal(f.calls.length, 0);
});

test("a different account cannot use or stop another user's calibration", async () => {
  const f = fixture();
  await f.calibrate();
  const originalCookie = f.cookie;
  f.signIn("user-b");
  assert.equal((await f.send("classify", f.image())).status, 409);
  await f.send("stop");
  f.signIn("user-a");
  f.advance(1000);
  const response = await f.send("classify", { ...f.image(),
    headers: { ...f.image().headers, cookie: originalCookie } });
  assert.equal(response.status, 200);
});

test("production accepts a hosted HTTPS classifier and sets a secure cookie behind TLS termination", async () => {
  const f = fixture({ mode: "production", appUrl: "https://slotty.example", serviceUrl: "https://ml.example" });
  const response = await f.send("open", { headers: { origin: "https://slotty.example" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
  assert.equal(f.calls[0].url.origin, "https://ml.example");
  assert.equal(new Headers(f.calls[0].init.headers).get("authorization"), `Bearer ${TOKEN}`);
});

test("remote plaintext and credential-bearing classifier URLs are rejected", async () => {
  for (const serviceUrl of ["http://ml.example", "https://user:password@ml.example", "https://ml.example/?token=private"]) {
    const f = fixture({ serviceUrl });
    assert.equal((await f.send("open")).status, 503);
    assert.equal(f.calls.length, 0);
  }
});

test("opening another window invalidates the same account's previous calibration", async () => {
  const f = fixture();
  await f.calibrate();
  await f.send("open");
  assert.equal((await f.send("classify", f.image())).status, 409);
});

test("forward calibration alone can enable forward/down study mode", async () => {
  const f = fixture();
  await f.send("open");
  assert.equal((await f.send("finish")).status, 409);
  for (let i = 0; i < 6; i++) { f.advance(1000); await f.send("screen", f.image()); }
  assert.equal((await f.send("finish")).status, 200);
  f.advance(1000);
  assert.equal((await f.send("classify", f.image())).status, 200);
});

test("only validated ML responses are persisted, never client time or labels", async () => {
  const writes = [];
  const progress = { activity: { id: "persisted-study-id" }, balance: 0 };
  const store = { start: async (...args) => { writes.push(["start", ...args]); return progress; },
    observe: async (...args) => { writes.push(["observe", ...args]); return progress; },
    pause: async (...args) => { writes.push(["pause", ...args]); return progress; } };
  const f = fixture({}, store);
  await f.calibrate(); f.advance(1000);
  assert.equal((await f.send("classify", f.image())).status, 409);
  assert.equal((await f.send("start", { body: JSON.stringify({ elapsedMs: 999999999 }) })).status, 200);
  assert.equal((await f.send("classify", f.image())).status, 200);
  const observation = writes.find(write => write[0] === "observe");
  assert.equal(observation[1], "user-a");
  assert.equal(observation[2], "persisted-study-id");
  assert.equal(observation.at(-1), "compatible");
  assert.equal(observation.includes(999999999), false);
  // Pause still persists when the classifier's environment is broken.
  f.settings.token = "";
  assert.equal((await f.send("stop")).status, 200);
  assert.equal(writes.at(-1)[0], "pause");
});

test("saving failures do not return success or invent study progress", async () => {
  const f = fixture({}, { start: async () => { throw Object.assign(new Error("Study saving unavailable"), { status: 503 }); } });
  await f.calibrate();
  const response = await f.send("start");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "Study saving unavailable");
});
