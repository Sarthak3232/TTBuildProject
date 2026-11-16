# ML inference contract

Private FastAPI service; Next is the authenticated public entry point. Bind localhost/private network, require an internal bearer credential, and do not enable arbitrary public CORS. Next verifies the Supabase user/session and active study ownership before forwarding a frame. Service credentials are never exposed to the browser. The inference service has no authority to award tokens or modify wallets/rolls.

## Interface

- `GET /health/live`: process liveness, no secrets.
- `GET /health/ready`: ready only when the expected pinned model assets have loaded; return model/rule version.
- `POST /v1/focus/classify`: raw `image/jpeg`, headers `X-Study-Session`, `X-Frame-Sequence`, `X-Calibration-Id`, `X-Request-Id`; header `X-Calibration` carries base64url-encoded compact JSON, maximum 2 KiB, with `{v:1, screen:{yaw,pitch}, book:{yaw,pitch}, yawToleranceDeg:25, pitchToleranceDeg:25}`. Angles must be finite degrees and only Next supplies this header. Avoid unbounded multipart uploads or persisted temp files.

- `POST /v1/focus/calibration-observation`: same bounded JPEG/auth headers, with `X-Calibration-Phase: screen|book`; return only usable flag, normalized yaw/pitch and model version to the trusted Next calibration coordinator. It aggregates at least five seconds and four usable samples per pose before storing medians.

Response fields: `sessionId`, `sequence`, `observedAt`, `state` compatible/away/unknown, `reason`, `modelVersion`, `ruleVersion`, `processingMs`. Calibrating responses may additionally return aggregate orientation parameters for trusted calibration storage, without full landmarks. Do not return raw imagery. Classification scores, if included, are model confidence rather than probability of actually studying.

Calibration-observation responses also include aggregate `diagnostics`: `faceCount`, `bodyPresent`, `orientationAvailable`, `imageUsable`, and `reasons` (short rejection codes). These distinguish missing face detection, invalid/missing head orientation, unreliable shoulders/body landmarks, multiple people, and image-quality failures. No raw landmark coordinates or image content are included. This instrumentation does not change acceptance thresholds or make a rejected frame usable.

## Bounded processing defaults

One JPEG per second initially; one outstanding frame per session; maximum encoded body 256 KiB and decoded image 640×480 pixels. Reject corrupt, oversized, wrong-format, replayed/out-of-order frames. Enforce byte limits during streaming and before expensive decoding. Drop stale work instead of accumulating a queue. The service times out at three seconds; Next marks that interval unknown. Limit each user to two requests per second and cap global inference concurrency to two initially; return 429/503 instead of unbounded queuing.

Load a pool of two IMAGE-mode vision pipelines (FaceLandmarker plus PoseLandmarker for coarse body presence) through FastAPI lifespan. Serialize access per instance; execute blocking inference in bounded workers. Pin the MediaPipe package and downloaded task asset/checksum in a model manifest. No face recognition/identity matching, emotion scoring, phone detector, or cognitive-attention claim is included.

## Presence/orientation classifier

The current prototype uses `forward-down-v2`: calibrate facing the screen using four valid observations spanning five seconds. The website then supplies a default book reference for backward-compatible request metadata; looking-down calibration is no longer required. A selected person's yaw within 35 degrees of the screen reference, with pitch from -90 degrees through 25 degrees above the screen reference, is compatible. Face transforms are preferred. When a full face mesh is unavailable, reliable shoulder and ear landmarks (plus the nose when visible) provide a coarse forward/down posture estimate. Shoulders alone do not qualify. The geometry thresholds are prototype heuristics requiring real-camera evaluation, not an accuracy claim or proof of attention.

Do not infer cognitive attention or screen contents. Multiple people do not automatically invalidate observations. Select the prominent centered upper body and its associated face; other people are ignored. Models inspect up to four faces and three bodies. This position/size heuristic has no persistent identity tracking: another person occupying the same central position can be mistaken for the user. Missing, sideways, or unverifiable selected subjects pause the local timer. Calibration is invalidated by camera setup changes, model/rule version changes, or 24 hours. The user may recalibrate at any time while paused.

The current website has a local display timer: two-second valid acquisition/reacquisition, five-second away/unknown grace, immediate manual pause, and a three-second freshness cutoff. Grace seconds are included in that display. No study-time persistence, tokens, or production reward accounting is connected. The stricter accounting rules in [data-model.md](../data-model.md) remain future integration work.

## Privacy and evaluation

Frames exist only in bounded request/inference memory and are discarded in success, error, timeout and cancellation paths. Do not write image files, request bodies, base64 payloads, landmarks, or credentials to logs/traces/analytics. Persist only aggregate calibration and observation state needed for session accounting. Camera frames stop on manual pause/end; automatic observation pause can sample for reacquisition.

Before shipping, use labeled controlled scenarios: screen reading, book reading, writing, empty chair, sustained turn-away, short glance, low light/occlusion, glasses, and multiple people. Require at least 90% correct compatible/away classification on the declared balanced controlled evaluation set and 100% exclusion of unknown/stale intervals in deterministic accounting tests. Report the set and limits; do not generalize this result to attention accuracy. Prefer live testing with aggregate results or licensed test assets; do not enable live-user frame retention to create fixtures. If the criteria fail, tune calibration/camera guidance or report Studbot unavailable, rather than silently earning study credit from presence alone.
