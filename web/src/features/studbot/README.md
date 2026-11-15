# Studbot website integration

The signed-in `/tasks/studbot` page captures small JPEG samples, calibrates screen
and book positions, and displays live `compatible`, `away`, or `unknown` feedback.
The browser sends frames to same-origin Next.js routes. Next.js verifies the
Supabase user on every request and forwards frames to the private Python service.
The internal service token and calibration angles stay on the server. Frames are
processed transiently and are never saved by the bridge.

This version does not save study time, history, or award tokens. Feedback describes
observable head position, not proof of attention or learning.

## Development

Keep the existing Supabase settings in `web/.env.local`. Add:

```dotenv
APP_URL=http://localhost:3000
ML_SERVICE_URL=http://127.0.0.1:8000
ML_INTERNAL_TOKEN=<random ASCII secret of at least 32 characters>
```

Put the same `ML_INTERNAL_TOKEN` in the ignored `ml/.env.local`. Generate a token
with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Never put it in a `NEXT_PUBLIC_` variable or commit it.

From the repository root:

```powershell
npm.cmd ci
uv sync --project ml
uv run --directory ml python -m app.models.fetch
uv run --directory ml --env-file .env.local uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal, run `npm.cmd run dev`. Sign in, open `/tasks/studbot`, select
**Open focus mode**, allow camera access, and calibrate your screen and reading
positions. Each position needs at least four usable samples spanning five seconds.
Keep one face and your shoulders visible. Pause, close, navigation, and hidden-tab
events stop camera capture. No microphone access is requested.

For book calibration, raise or tilt the book toward the screen so your face stays
visible while reading. If you lower or move the camera, restart both calibration
positions. A brief detection gap preserves recent valid samples for up to three
seconds. Missing-face frames never contribute samples or finish calibration;
longer gaps reset progress. Calibration still requires four valid observations
spanning five seconds. A fully hidden face remains unverifiable during live study.

## Deployment

Use a persistent Node.js server running `npm run build` then `npm run start`, with
exactly one Next.js process. Calibration, per-user session ownership, and request
ordering are kept in bounded process memory. Restarts require recalibration.
There are at most 16 active focus windows, with one per account and a 24-hour TTL.
Multiple replicas, autoscaling, and serverless hosting such as Vercel need a shared
session store with atomic request coordination before this bridge can be deployed
there reliably. This branch deliberately does not bypass authentication to work
around those constraints.

Set these variables on the website server:

- Existing Supabase URL and publishable key, with all main-branch migrations applied.
- `APP_URL`: the exact public HTTPS website origin, e.g. `https://slotty.example`.
- `ML_SERVICE_URL`: the private classifier's HTTPS origin, e.g. `https://ml.example`.
  Loopback HTTP is supported if Python runs on the same server.
- `ML_INTERNAL_TOKEN`: the same secret configured on the Python service.

Configure Supabase's site URL and callback allowlist for the website origin.
HTTPS is needed for camera access outside localhost. The browser never connects
directly to Python, so the classifier does not need browser CORS access. Restrict
classifier network access to the website server where the host supports it.

On the Python host, install the locked environment and fetch the pinned models
using the commands above. Run Uvicorn with the token in its runtime environment
and models available at `ML_MODEL_DIR` (default `ml/models` when run inside `ml`).
Use loopback behind a TLS reverse proxy, or the host's required bind interface
behind its HTTPS ingress. Do not log image request bodies. `/health/ready` must
report ready before enabling focus mode; missing models or mismatched tokens
produce an unavailable message. No hosted deployment is created by this branch.

## Verification

```powershell
npm.cmd run test:studbot --workspace @slotty/web
npm.cmd run test:studbot:browser --workspace @slotty/web
npm.cmd test
npm.cmd run check
uv run --directory ml pytest
```

Tests cover calibrated forwarding, account isolation, production HTTPS settings,
origin checks, bounded uploads, stale results, version changes, and route auth.
They do not establish real-camera accuracy or hosted infrastructure readiness.
Browser checks use synthetic camera streams and mocked replies in a test-only
component host, on desktop and phone viewports. Install Playwright Chromium first,
or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed compatible browser.
