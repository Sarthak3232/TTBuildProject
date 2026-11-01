# Research decisions — Task Reward Locker

**Status**: Research/design decisions complete for task breakdown. User-selected behavior is distinguished from explicit implementation defaults below. No application code, models, migrations, or tests have been implemented.

## Confirmed Decisions

- React/Next.js mobile-friendly web frontend.
- Supabase for authentication and PostgreSQL data.
- FastAPI for ML models, including the selected MediaPipe-based Studbot pipeline.
- Four simulated compartments before real hardware.
- Per-session whole tokens, no remainder carryover; server-controlled two-stage rolls.

## Verified Browser Boundary

Browser camera/location tracking requires a visible active page with available observations. Pause observation-dependent study earning when hidden, on screen lock, or on missing/stale camera input; do not infer unobserved study time. Run/walk has no movement-based auto-pause: its server-timestamped manual timer continues while stationary or during a GPS outage, with location gaps shown separately. Custom/run/walk timer elapsed time can be recovered from server state after refresh/hidden intervals; this does not recover unobserved GPS distance. A PWA does not promise background sensor coverage. This boundary must be visible in the app.

Sources: [W3C Geolocation](https://www.w3.org/TR/geolocation/), [Chrome lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [Media Capture](https://www.w3.org/TR/mediacapture-streams/).

## Model Capability Boundary

MediaPipe FaceLandmarker produces face landmarks/presence and optional expressions/transforms, not a learned attention classifier. The user selected presence plus orientation toward the screen or study materials, allowing downward reading/writing, with calibration and brief-glance tolerance. Presence alone is insufficient; phone detection is deferred. Any extra classifier requires an identified model or labeled-data/training/evaluation plan.

Source: [Google FaceLandmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).

## Initial Framework and Maps Research

Next.js 16 App Router supports a full-stack web application on the installed Node 22.20 runtime; exact compatible versions are pinned when scaffolding. MapLibre GL JS with configurable OpenFreeMap Liberty style is a no-key prototype option, retaining attribution and segmented GPS routes. These are selected implementation defaults; retain attribution and keep map failures separate from timer state.

Sources: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [MapLibre attribution](https://maplibre.org/maplibre-gl-js/docs/API/classes/AttributionControl/), [OpenFreeMap](https://openfreemap.org/quick_start/).

## Supabase Accounts, Authorization, and Transactions

**Decision:** Use `@supabase/ssr` cookie-aware Next.js clients plus a separate browser client. Refresh auth through the supported Next proxy integration. Confirm identity with server-side `getUser()` for sensitive completion/roll mutations; do not trust `getSession()` as authorization. Enable account-scoped RLS on all exposed user tables. Browser roles must not edit wallets, award credits, set roll outcomes, or acknowledge unlocks.

Use one restricted Postgres RPC for completion and one for rolling, invoked only by a server-only privileged Supabase client. Revoke execution from PUBLIC/anon/authenticated roles. These functions check ownership explicitly, lock the wallet/session/drawer rows, enforce idempotency and request hashes, and commit ledger/outcome/outbox together. An RPC request is transactional; several sequential client writes are not an equivalent substitute. Prefer SECURITY INVOKER with the privileged role; a SECURITY DEFINER function requires empty search_path and fully qualified names. Never assume auth.uid() identifies the end user in a request made with only the privileged credential.

Next derives the user ID from verified auth and generates secure random values using Node crypto.randomInt; the restricted RPC applies the current probability policy after validating inputs and saves the outcome. Values are never accepted from the browser. A committed idempotency key returns its saved result before any new random choice. Delivery occurs after commit through an idempotent outbox worker and persistent simulator receipts; every roll, including losses, is delivered. Failed acknowledgement must not cause another charge or new outcome.

Publishable keys may be used in browser code. Keep secret/service credentials in server-only modules, never NEXT_PUBLIC variables or the ML service. Pin the Supabase CLI and use its local Docker-backed Auth/Postgres stack; no hosted account is required for local development. Commit migrations, config, seed, and generated database types when implementation begins.

Sources: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Node random integers](https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback).

## FastAPI Model Service

**Confirmed processing choice:** Sample bounded JPEG frames and send them through an authenticated Next endpoint to a private FastAPI service. Authenticate the user and active session before decoding; use an internal service credential between Next and FastAPI. Keep privileged Supabase credentials out of the model service. The service returns observation state/reason/confidence and model version, never tokens or roll decisions. The web service persists aggregate observations and applies the reward rules.

This selected approach transmits images off-device: describe that clearly before starting Studbot. Discard buffers after inference and do not retain frames, decoded landmarks, request bodies, or credentials in logs. Device-only image processing was not selected. Ended/manually paused sessions stop capture; observation-auto-paused sessions may sample for the selected two-second valid-position reacquisition. Never credit paused intervals.

Initial benchmark targets: 640×480 JPEG, at most 256 KiB per frame, one frame per second initially and at most one request in flight. Drop stale frames; timeout/overload produces unknown and no credited time. Use a bounded pool of preloaded IMAGE-mode MediaPipe face/body pipelines, serialized per pipeline to avoid shared tracking state across users. Initialize/close through FastAPI lifespan; blocking inference must use bounded worker execution rather than blocking the async event loop. Enforce streamed body-byte and decoded-pixel limits, not only MIME/Content-Length claims. A small bounded raw body avoids file-upload disk spooling. Throughput/latency promises require measurement.

Face landmarks can support orientation rules but not cognitive attention. Phone detection requires an additional object detector and cannot by itself prove phone use. Use the selected presence/orientation behavior to design model features, calibration, and representative evaluation cases. The initial sustained-away threshold is five seconds; automatic resume after two consecutive valid seconds is confirmed. Grace-window accounting is defined in the data model: hold candidate-away time pending, credit short allowed glances only on return before five seconds, otherwise exclude the whole away interval; exclude unknown and reacquisition time. Camera liveness and replay resistance are not guaranteed by this design.

Sources: [MediaPipe FaceLandmarker Python](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/python), [object detector Python](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/python), [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [FastAPI concurrency](https://fastapi.tiangolo.com/async/), [Starlette request streaming](https://starlette.dev/requests/), [FastAPI uploads](https://fastapi.tiangolo.com/tutorial/request-files/).

## Custom Task Time — Confirmed

The user selected a built-in start/stop timer, not manually reported duration. A minimum-duration target remains optional; measure active time even with no target, exclude paused intervals, and calculate whole tokens per completed session. This is a self-accountability timer, not camera verification of custom activities.

## Daily Goals — Confirmed

Daily goals are specific activity/time targets, such as Study for 60 minutes or Walk for 30 minutes, each with its own progress and automatic completion at the target. Sum matching activity within the day separately from token rounding: two completed 20-minute study sessions advance a goal by 40 minutes but earn zero tokens. Calendar-style recurrence is confirmed: today only, every day, or selected weekdays, with independent per-date progress. Separate aggregate weekly targets are explicitly excluded by the user. The user did not select aggregate task-count goals.

## Run/Walk Controls — Confirmed

The user selected manual pause/resume and stop with map, distance, and timer visible. No movement-based auto-pause. Stationary time counts while the timer is running. GPS fixes determine distance/route coverage, not timer eligibility; missing fixes must not invent distance. Paused movement and time do not count.

## Selected Planning Defaults

These are concrete defaults for implementation, not extra answers attributed to the user:

- Python 3.11, npm/uv lockfiles, model manifest with checksums. MediaPipe's setup guide supports Python 3.9+; verify wheel/package compatibility on the target platform during bootstrap. Use pytest/FastAPI TestClient for ML contracts. [MediaPipe setup](https://developers.google.com/edge/mediapipe/solutions/setup_python), [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/).
- FaceLandmarker plus coarse PoseLandmarker body presence distinguish a usable empty scene, visible study orientation, and unable-to-verify views. A calibrated rule classifier over pretrained ML landmarks is the first implementation; do not claim a pretrained attention model or unbuilt learned classifier. Five seconds/four usable samples per screen/book pose, median references, initial 25-degree yaw/pitch tolerances, 24-hour calibration lifetime. Tune against the declared balanced controlled test set; require at least 90% compatible/away accuracy there and deterministic exclusion of unknown/stale time. No general attention-accuracy claim. [Pose model](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).
- One unfinished earning session per account, including paused sessions. Server-clock custom/run/walk intervals are manually controlled and recoverable after refresh; no movement auto-pause. Offline control requests remain visibly unsaved until server acknowledgement and cannot submit backdated manual duration. Start requires a server acknowledgement.
- Studbot observations stale after three seconds; unknown/hidden/camera failure excludes study credit immediately. Five-second pending-away grace and two-second non-retroactive reacquisition are defined in data-model.md. Manual pause never auto-resumes. Persist observed aggregate windows to recover prior time without inventing hidden/offline study time.
- Goal progress includes completed activity plus provisional current-session intervals, clipped to the goal's local date; canceling removes provisional progress. Future schedule edits preserve past occurrences. Existing schedules keep their timezone until explicitly edited. Distinct sessions may earn again from new time.
- Initial GPS distance filters: valid coordinates, accuracy <= 50 m, age <= 15 seconds, increasing timestamps, gap <= 15 seconds, and jump speed <= 12 m/s. Reject invalid points and begin a new segment after a gap/pause. These are configurable prototype distance filters, not speed requirements for timer rewards or anti-cheat guarantees. Missing map tiles do not stop GPS collection or the manual timer.
- Use email/password Supabase auth for the local prototype; local inbox supports configured email confirmation. Hosted email delivery/OAuth/public deployment are later setup work. Serve authenticated pages/data without public caching and protect cookie mutations against cross-origin/CSRF requests.
- Quote expiry 60 seconds, safe allocation limits, one-million-unit probability quantization, bounded three-attempt database-conflict retry, and durable outbox leases/backoff are specified in contracts. No raw camera frames/landmarks persist; private saved route points do.

All plan-level choices have a defined path; model performance and browser behavior require actual tests during implementation. The design artifacts are [plan.md](plan.md), [data-model.md](data-model.md), [API](contracts/api.md), [ML](contracts/ml.md), [locker](contracts/locker.md), and [quickstart.md](quickstart.md). The next workflow is task breakdown, not another mandatory product questionnaire.
