# Research decisions — Task Reward Locker

**Status**: In progress. The user explicitly selected React/Next.js + Supabase + FastAPI for ML and requested further product clarification. Research must use that stack. The user has now selected presence plus orientation for Studbot; automatic resume after two valid seconds is also confirmed; other requested product questions still precede plan readiness.

## Confirmed Decisions

- React/Next.js mobile-friendly web frontend.
- Supabase for authentication and PostgreSQL data.
- FastAPI for ML models, including the selected MediaPipe-based Studbot pipeline.
- Four simulated compartments before real hardware.
- Per-session whole tokens, no remainder carryover; server-controlled two-stage rolls.

## Verified Browser Boundary

Browser camera/location tracking requires a visible active page with available observations. Pause when hidden, on screen lock, sensor loss or stale input; do not infer unobserved time. A PWA does not promise background sensor coverage. This boundary must be visible in the app.

Sources: [W3C Geolocation](https://www.w3.org/TR/geolocation/), [Chrome lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [Media Capture](https://www.w3.org/TR/mediacapture-streams/).

## Model Capability Boundary

MediaPipe FaceLandmarker produces face landmarks/presence and optional expressions/transforms, not a learned attention classifier. The user selected presence plus orientation toward the screen or study materials, allowing downward reading/writing, with calibration and brief-glance tolerance. Presence alone is insufficient; phone detection is deferred. Any extra classifier requires an identified model or labeled-data/training/evaluation plan.

Source: [Google FaceLandmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).

## Initial Framework and Maps Research

Next.js 16 App Router supports a full-stack web application on the installed Node 22.20 runtime; exact compatible versions are pinned when scaffolding. MapLibre GL JS with configurable OpenFreeMap Liberty style is a no-key prototype option, retaining attribution and segmented GPS routes. These map choices are provisional design defaults.

Sources: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [MapLibre attribution](https://maplibre.org/maplibre-gl-js/docs/API/classes/AttributionControl/), [OpenFreeMap](https://openfreemap.org/quick_start/).

## Supabase Accounts, Authorization, and Transactions

**Decision:** Use `@supabase/ssr` cookie-aware Next.js clients plus a separate browser client. Refresh auth through the supported Next proxy integration. Confirm identity with server-side `getUser()` for sensitive completion/roll mutations; do not trust `getSession()` as authorization. Enable account-scoped RLS on all exposed user tables. Browser roles must not edit wallets, award credits, set roll outcomes, or acknowledge unlocks.

Use one restricted Postgres RPC for completion and one for rolling, invoked only by a server-only privileged Supabase client. Revoke execution from PUBLIC/anon/authenticated roles. These functions check ownership explicitly, lock the wallet/session/drawer rows, enforce idempotency and request hashes, and commit ledger/outcome/outbox together. An RPC request is transactional; several sequential client writes are not an equivalent substitute. Prefer SECURITY INVOKER with the privileged role; a SECURITY DEFINER function requires empty search_path and fully qualified names. Never assume auth.uid() identifies the end user in a request made with only the privileged credential.

Next derives the user ID from verified auth and generates secure random values using Node crypto.randomInt; the restricted RPC applies the current probability policy after validating inputs and saves the outcome. Values are never accepted from the browser. A committed idempotency key returns its saved result before any new random choice. Delivery occurs after commit through an idempotent outbox worker and persistent simulator receipts; every roll, including losses, is delivered. Failed acknowledgement must not cause another charge or new outcome.

Publishable keys may be used in browser code. Keep secret/service credentials in server-only modules, never NEXT_PUBLIC variables or the ML service. Pin the Supabase CLI and use its local Docker-backed Auth/Postgres stack; no hosted account is required for local development. Commit migrations, config, seed, and generated database types when implementation begins.

Sources: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Node random integers](https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback).

## FastAPI Model Service

**Planning candidate:** Sample bounded JPEG frames and send them through an authenticated Next endpoint to a private FastAPI service. Authenticate the user and active session before decoding; use an internal service credential between Next and FastAPI. Keep privileged Supabase credentials out of the model service. The service returns observation state/reason/confidence and model version, never tokens or roll decisions. The web service persists aggregate observations and applies the reward rules.

This candidate transmits images off-device: describe that clearly before starting Studbot. Discard buffers after inference and do not retain frames, decoded landmarks, request bodies, or credentials in logs. Browser-only feature extraction is an alternative if the user requires images to remain local, but restricts the signals available to the Python classifier.

Initial benchmark targets: 640×480 JPEG, at most 256 KiB per frame, one frame per second initially and at most one request in flight. Drop stale frames; timeout/overload produces unknown and no credited time. Use a bounded pool of preloaded IMAGE-mode MediaPipe instances, serialized per instance to avoid shared tracking state across users. Initialize/close through FastAPI lifespan; blocking inference must use bounded worker execution rather than blocking the async event loop. Enforce streamed body-byte and decoded-pixel limits, not only MIME/Content-Length claims. A small bounded raw body avoids file-upload disk spooling. Throughput/latency promises require measurement.

Face landmarks can support orientation rules but not cognitive attention. Phone detection requires an additional object detector and cannot by itself prove phone use. Use the selected presence/orientation behavior to design model features, calibration, and representative evaluation cases. The initial sustained-away threshold is five seconds; automatic resume after two consecutive valid seconds is confirmed. Grace-window accounting remains a design detail. Camera liveness and replay resistance are not guaranteed by this design.

Sources: [MediaPipe FaceLandmarker Python](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/python), [object detector Python](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/python), [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [FastAPI concurrency](https://fastapi.tiangolo.com/async/), [Starlette request streaming](https://starlette.dev/requests/), [FastAPI uploads](https://fastapi.tiangolo.com/tutorial/request-files/).

## Custom Task Time — Confirmed

The user selected a built-in start/stop timer, not manually reported duration. A minimum-duration target remains optional; measure active time even with no target, exclude paused intervals, and calculate whole tokens per completed session. This is a self-accountability timer, not camera verification of custom activities.

## Daily Goals — Confirmed

Daily goals are specific activity/time targets, such as Study for 60 minutes or Walk for 30 minutes, each with its own progress and automatic completion at the target. Sum matching activity within the day separately from token rounding: two completed 20-minute study sessions advance a goal by 40 minutes but earn zero tokens. Calendar-style recurrence is confirmed: today only, every day, or selected weekdays, with independent per-date progress. Separate aggregate weekly targets are explicitly excluded by the user. The user did not select aggregate task-count goals.

## Pending Product Decisions

Studbot presence/orientation meaning and the initial five-second sustained-away threshold are confirmed. Automatic resume after two valid seconds preserves previous time. Grace accounting, camera-processing privacy preference, and task/session completion rules still need clarification or documented planning defaults. Goal scope and recurrence are resolved. Ask one consequential question at a time. No application implementation has been performed; final data model/contracts/validation guide follow the product answers.
