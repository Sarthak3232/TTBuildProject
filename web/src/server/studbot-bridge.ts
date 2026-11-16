/** Authenticated, single-instance classifier bridge.
 * Calibration and identifiers stay server-side; request images are never stored.
 */
import { randomBytes, randomUUID } from "node:crypto";

const COOKIE = "slotty_studbot";
const MAX_BYTES = 256 * 1024;
const TTL = 24 * 60 * 60 * 1000;
type Angles = { yaw: number; pitch: number };
type Sample = Angles & { at: number };
type Session = {
  id: string; userId: string; calibrationId: string; createdAt: number; revision: number;
  model: string; rule: string; phase: "screen" | "book" | "ready";
  screen?: Angles; book?: Angles; samples: Sample[]; sequence: number;
  pending: boolean; lastFrame: number;
};
type Config = { mode: string; serviceUrl: string; token: string; appUrl?: string };
type Options = { config: () => Config; authorize: (request: Request) => Promise<string | null>; fetcher?: typeof fetch; now?: () => number };

function calibrationDiagnostics(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const allowed = new Set(["image_unusable", "image_too_small", "image_too_dark", "image_too_bright", "image_low_contrast",
    "face_not_detected", "multiple_faces", "multiple_bodies", "invalid_body_landmarks", "shoulders_unreliable",
    "incomplete_face_landmarks", "invalid_face_landmarks", "face_transform_missing", "face_orientation_unreliable", "ambiguous_observation"]);
  if (!Number.isInteger(data.faceCount) || Number(data.faceCount) < 0 || Number(data.faceCount) > 8
      || typeof data.bodyPresent !== "boolean" || typeof data.orientationAvailable !== "boolean"
      || typeof data.imageUsable !== "boolean" || !Array.isArray(data.reasons)) return undefined;
  return { faceCount: Number(data.faceCount), bodyPresent: data.bodyPresent,
    orientationAvailable: data.orientationAvailable, imageUsable: data.imageUsable,
    reasons: data.reasons.filter((reason): reason is string => typeof reason === "string" && allowed.has(reason)).slice(0, 8) };
}

class BridgeError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function json(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(data, { status, headers });
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function reference(samples: Sample[]): Angles {
  const anchor = samples[0].yaw;
  const yaw = median(samples.map(s => anchor + ((s.yaw - anchor + 540) % 360 - 180)));
  return { yaw: (yaw + 540) % 360 - 180, pitch: median(samples.map(s => s.pitch)) };
}

function validAngles(data: Record<string, unknown>): data is Record<string, unknown> & Angles {
  return typeof data.yaw === "number" && Number.isFinite(data.yaw) && Math.abs(data.yaw) <= 180
    && typeof data.pitch === "number" && Number.isFinite(data.pitch) && Math.abs(data.pitch) <= 90;
}

async function readImage(request: Request): Promise<Uint8Array> {
  if (request.headers.get("content-type") !== "image/jpeg") throw new BridgeError(415, "Send a JPEG frame.");
  if (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity") {
    throw new BridgeError(415, "Compressed request bodies are not supported.");
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new BridgeError(413, "Frame exceeds 256 KiB.");
  if (!request.body) throw new BridgeError(422, "An image is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let interrupted = false;
  const cancel = () => { interrupted = true; void reader.cancel().catch(() => {}); };
  const deadline = setTimeout(cancel, 3000);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (interrupted || request.signal.aborted) throw new BridgeError(503, "Frame upload stopped or timed out.");
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new BridgeError(413, "Frame exceeds 256 KiB.");
      chunks.push(value);
    }
    if (!total) throw new BridgeError(422, "An image is required.");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    chunks.length = 0;
  }
}

export function createStudbotBridge({ config, authorize, fetcher = fetch, now = Date.now }: Options) {
  const sessions = new Map<string, Session>();

  return async function handle(request: Request, action: string): Promise<Response> {
    try {
      const settings = config();
      const url = new URL(request.url);
      const local = ["localhost", "127.0.0.1", "[::1]"];
      // A configured origin supports TLS termination without trusting forwarded headers.
      const browserOrigin = new URL(settings.appUrl || `${url.protocol}//${request.headers.get("host") ?? url.host}`);
      if (settings.mode === "production" && (!settings.appUrl || browserOrigin.protocol !== "https:")) {
        throw new BridgeError(503, "Configure APP_URL with this website's HTTPS origin.");
      }
      if (!settings.appUrl && (!local.includes(url.hostname) || !local.includes(browserOrigin.hostname))) {
        throw new BridgeError(503, "Configure APP_URL with this website's origin.");
      }
      if (request.headers.get("sec-fetch-site") === "cross-site"
          || (request.method !== "GET" && request.headers.get("origin") !== browserOrigin.origin)) {
        throw new BridgeError(403, "Open focus mode from this website.");
      }
      const userId = await authorize(request);
      if (!userId) throw new BridgeError(401, "Your session has expired. Sign in again.");
      if (!/^[\x21-\x7e]{32,}$/.test(settings.token) || settings.token === "replace-with-a-generated-secret") {
        throw new BridgeError(503, "Set the same ML_INTERNAL_TOKEN for Next.js and FastAPI, then restart both servers.");
      }
      const serviceUrl = new URL(settings.serviceUrl);
      if (!(serviceUrl.protocol === "https:" || (serviceUrl.protocol === "http:" && local.includes(serviceUrl.hostname)))
          || serviceUrl.username || serviceUrl.password || serviceUrl.pathname !== "/" || serviceUrl.search || serviceUrl.hash) {
        throw new BridgeError(503, "ML_SERVICE_URL must use HTTPS, or HTTP on loopback for a classifier on the same server.");
      }
      for (const [key, session] of sessions) {
        if (now() - session.createdAt >= TTL) sessions.delete(key);
      }
      const call = async (path: string, init: RequestInit = {}) => {
        const response = await fetcher(new URL(path, serviceUrl), {
          ...init, cache: "no-store", redirect: "error",
          headers: { Authorization: `Bearer ${settings.token}`, ...init.headers },
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(4000)]),
        });
        if (!response.ok) {
          if (response.status === 401) throw new BridgeError(503, "The Next.js and FastAPI ML_INTERNAL_TOKEN values do not match.");
          throw new BridgeError([413, 415, 422, 429].includes(response.status) ? response.status : 503,
            response.status === 429 ? "Classifier busy. Waiting for a fresh frame." : "Classifier could not process this frame. Check the FastAPI terminal.");
        }
        const data = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new BridgeError(503, "Invalid classifier response.");
        return data as Record<string, unknown>;
      };
      const versions = (data: Record<string, unknown>) => {
        if (typeof data.modelVersion !== "string" || typeof data.ruleVersion !== "string") {
          throw new BridgeError(503, "Restart FastAPI with the current classifier code.");
        }
        return { model: data.modelVersion, rule: data.ruleVersion };
      };
      if (action === "health" && request.method === "GET") {
        const data = await call("/health/ready");
        if (data.ready !== true) throw new BridgeError(503, "The classifier is not ready.");
        return json({ ready: true, ...versions(data) });
      }
      if (request.method !== "POST") throw new BridgeError(405, "Use POST for focus controls.");
      const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      const cookieText = (value: string, age: number) => `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/studbot; Max-Age=${age}${browserOrigin.protocol === "https:" ? "; Secure" : ""}`;

      if (action === "stop") {
        if (cookie && sessions.get(cookie)?.userId === userId) sessions.delete(cookie);
        return json({ stopped: true }, 200, cookieText("", 0));
      }
      if (action === "open") {
        const data = await call("/health/ready");
        if (data.ready !== true) throw new BridgeError(503, "The classifier is not ready.");
        if (cookie && sessions.get(cookie)?.userId === userId) sessions.delete(cookie);
        for (const [key, previous] of sessions) if (previous.userId === userId) sessions.delete(key);
        if (sessions.size >= 16) throw new BridgeError(503, "Focus mode is busy. Please try again later.");
        const key = randomBytes(32).toString("hex");
        sessions.set(key, { id: randomUUID(), userId, calibrationId: randomUUID(), createdAt: now(), revision: 0,
          ...versions(data), phase: "screen", samples: [], sequence: 0, pending: false, lastFrame: -Infinity });
        return json({ phase: "screen", samples: 0, seconds: 0 }, 200, cookieText(key, 86400));
      }
      const session = cookie ? sessions.get(cookie) : undefined;
      if (!session || session.userId !== userId) throw new BridgeError(409, "Focus mode expired. Close and reopen it to recalibrate.");
      if (action === "reset") {
        session.revision++;
        session.calibrationId = randomUUID();
        session.phase = "screen"; session.samples = []; session.screen = undefined; session.book = undefined;
        return json({ phase: "screen", samples: 0, seconds: 0 });
      }
      if (action === "finish") {
        if (session.phase !== "book" || !session.screen) throw new BridgeError(409, "Calibrate facing the screen first.");
        session.book = { yaw: session.screen.yaw, pitch: Math.max(-90, session.screen.pitch - 45) };
        session.phase = "ready";
        return json({ phase: "ready" });
      }
      if (!["screen", "book", "classify"].includes(action)) throw new BridgeError(404, "Unknown focus action.");
      if ((action === "classify" && session.phase !== "ready") || (action !== "classify" && action !== session.phase)) {
        throw new BridgeError(409, "Complete screen and book calibration in order.");
      }
      if (session.pending || now() - session.lastFrame < 500) throw new BridgeError(429, "Wait for the previous frame.");
      session.pending = true;
      session.lastFrame = now();
      const revision = session.revision;
      const sequence = ++session.sequence;
      try {
        const bytes = await readImage(request);
        const headers: Record<string, string> = {
          "Authorization": `Bearer ${settings.token}`, "Content-Type": "image/jpeg",
          "X-Study-Session": session.id, "X-Frame-Sequence": String(sequence),
          "X-Calibration-Id": session.calibrationId, "X-Request-Id": randomUUID(),
        };
        const calibrating = action !== "classify";
        if (calibrating) headers["X-Calibration-Phase"] = action;
        else headers["X-Calibration"] = Buffer.from(JSON.stringify({ v: 1, screen: session.screen, book: session.book,
          yawToleranceDeg: 25, pitchToleranceDeg: 25 })).toString("base64url");
        const data = await call(`/v1/focus/${calibrating ? "calibration-observation" : "classify"}`,
          { method: "POST", headers, body: bytes as BodyInit });
        if (session.revision !== revision || sessions.get(cookie!) !== session || request.signal.aborted) {
          throw new BridgeError(409, "Focus session changed; the old result was discarded.");
        }
        if (data.sessionId !== session.id || data.sequence !== sequence) throw new BridgeError(503, "Mismatched classifier response.");
        if (data.modelVersion !== session.model || data.ruleVersion !== session.rule) {
          sessions.delete(cookie!);
          throw new BridgeError(409, "Classifier version changed. Close and reopen focus mode to recalibrate.");
        }
        if (!calibrating) {
          if (!["compatible", "away", "unknown"].includes(String(data.state)) || typeof data.reason !== "string"
              || !/^[a-z_]{1,80}$/.test(data.reason)) throw new BridgeError(503, "Invalid classification response.");
          return json({ state: data.state, reason: data.reason, modelVersion: session.model, ruleVersion: session.rule });
        }
        if (data.phase !== action) throw new BridgeError(503, "Mismatched calibration phase.");
        const diagnostics = calibrationDiagnostics(data.diagnostics);
        if (data.usable !== true || !validAngles(data)) {
          // A brief face-detection dropout is common while looking down. Keep
          // recent verified samples, but never add an unusable frame or advance
          // calibration on it. Longer gaps still require a fresh stable pose.
          if (session.samples.length && now() - session.samples.at(-1)!.at > 3000) session.samples = [];
          const seconds = session.samples.length > 1
            ? (session.samples.at(-1)!.at - session.samples[0].at) / 1000 : 0;
          return json({ phase: action, usable: false, samples: session.samples.length,
            seconds: Math.min(5, seconds), diagnostics });
        }
        const at = now();
        if (session.samples.length && at - session.samples.at(-1)!.at > 3000) session.samples = [];
        session.samples.push({ yaw: data.yaw, pitch: data.pitch, at });
        const seconds = (at - session.samples[0].at) / 1000;
        const count = session.samples.length;
        if (count >= 4 && seconds >= 5) {
          const angles = reference(session.samples);
          if (action === "screen") { session.screen = angles; session.phase = "book"; }
          else { session.book = angles; session.phase = "ready"; }
          session.samples = [];
        }
        return json({ phase: session.phase, usable: true, samples: count, seconds: Math.min(5, seconds), diagnostics });
      } finally { session.pending = false; }
    } catch (error) {
      if (error instanceof BridgeError) return json({ error: error.message }, error.status);
      return json({ error: "The classifier is unavailable. Please try again later." }, 503);
    }
  };
}
