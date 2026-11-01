# ML inference contract

Private FastAPI service; Next is the authenticated public entry point. Bind localhost/private network, require an internal bearer credential, and do not enable arbitrary public CORS. Next verifies the Supabase user/session and active study ownership before forwarding a frame. Service credentials are never exposed to the browser. The inference service has no authority to award tokens or modify wallets/rolls.

## Interface

- `GET /health/live`: process liveness, no secrets.
- `GET /health/ready`: ready only when the expected pinned model assets have loaded; return model/rule version.
- `POST /v1/focus/classify`: raw `image/jpeg`, headers `X-Study-Session`, `X-Frame-Sequence`, `X-Calibration-Id`, `X-Request-Id`; header `X-Calibration` carries base64url-encoded compact JSON, maximum 2 KiB, with `{v:1, screen:{yaw,pitch}, book:{yaw,pitch}, yawToleranceDeg:25, pitchToleranceDeg:25}`. Angles must be finite degrees and only Next supplies this header. Avoid unbounded multipart uploads or persisted temp files.

- `POST /v1/focus/calibration-observation`: same bounded JPEG/auth headers, with `X-Calibration-Phase: screen|book`; return only usable flag, normalized yaw/pitch and model version to the trusted Next calibration coordinator. It aggregates at least five seconds and four usable samples per pose before storing medians.

Response fields: `sessionId`, `sequence`, `observedAt`, `state` compatible/away/unknown, `reason`, `modelVersion`, `ruleVersion`, `processingMs`. Calibrating responses may additionally return aggregate orientation parameters for trusted calibration storage, without full landmarks. Do not return raw imagery. Classification scores, if included, are model confidence rather than probability of actually studying.

## Bounded processing defaults

One JPEG per second initially; one outstanding frame per session; maximum encoded body 256 KiB and decoded image 640×480 pixels. Reject corrupt, oversized, wrong-format, replayed/out-of-order frames. Enforce byte limits during streaming and before expensive decoding. Drop stale work instead of accumulating a queue. The service times out at three seconds; Next marks that interval unknown. Limit each user to two requests per second and cap global inference concurrency to two initially; return 429/503 instead of unbounded queuing.

Load a pool of two IMAGE-mode vision pipelines (FaceLandmarker plus PoseLandmarker for coarse body presence) through FastAPI lifespan. Serialize access per instance; execute blocking inference in bounded workers. Pin the MediaPipe package and downloaded task asset/checksum in a model manifest. No face recognition/identity matching, emotion scoring, phone detector, or cognitive-attention claim is included.

## Presence/orientation classifier

Use ML-derived face landmarks/transformation to estimate orientation, then a calibrated classification layer. First version uses explicit orientation rules over those features, not a claimed pretrained or custom-trained attention model. Collect five seconds of valid screen-facing samples and five seconds in the normal book/writing position; at least four usable observations per position are required. Aggregate medians form the two reference orientations. Initial compatibility threshold: yaw and pitch each within 25 degrees of either reference, plus valid detected face at configured 0.5 detection/presence thresholds. Treat face-occluded body presence, ambiguous views, blocked/poor-quality imagery, and missing/stale input as unknown. A usable scene with neither detected face nor upper body is away. Coarse body presence separates an empty-chair prediction from a person whose face cannot be verified, without claiming perfect occlusion detection. These numeric tolerances are implementation defaults to calibrate against the evaluation set, not user-supplied thresholds.

Do not infer cognitive attention or screen contents. Looking down is compatible when it matches calibrated reading/writing orientation. Multiple visible faces are unknown until a single-person camera view is restored. Calibration is invalidated by camera setup changes, model/rule version changes, or 24 hours. The user may recalibrate at any time while paused.

The web session service applies time windows, not the ML process: two-second valid reacquisition; five-second away grace; unknown/stale observations receive no time; manual pause never auto-resumes. See [data-model.md](../data-model.md) for exact pending-grace accounting.

## Privacy and evaluation

Frames exist only in bounded request/inference memory and are discarded in success, error, timeout and cancellation paths. Do not write image files, request bodies, base64 payloads, landmarks, or credentials to logs/traces/analytics. Persist only aggregate calibration and observation state needed for session accounting. Camera frames stop on manual pause/end; automatic observation pause can sample for reacquisition.

Before shipping, use labeled controlled scenarios: screen reading, book reading, writing, empty chair, sustained turn-away, short glance, low light/occlusion, glasses, and multiple people. Require at least 90% correct compatible/away classification on the declared balanced controlled evaluation set and 100% exclusion of unknown/stale intervals in deterministic accounting tests. Report the set and limits; do not generalize this result to attention accuracy. Prefer live testing with aggregate results or licensed test assets; do not enable live-user frame retention to create fixtures. If the criteria fail, tune calibration/camera guidance or report Studbot unavailable, rather than silently earning study credit from presence alone.
