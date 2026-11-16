# Studbot website integration

The signed-in `/tasks/studbot` page captures small JPEG samples, calibrates once
facing forward, and displays live `compatible`, `away`, or `unknown` feedback.
The browser sends frames to same-origin Next.js routes. Next.js verifies the
Supabase user on every request and forwards frames to the private Python service.
The internal service token and calibration angles stay on the server. Frames are
processed transiently and are never saved by the bridge.

Study progress is saved to the signed-in account. **Finish & save** writes a
completion to History and awards one token per full 30 minutes of credited time.
Rounding applies per completed session; unused minutes do not carry over. Close,
manual pause, navigation, and mobile backgrounding preserve the unfinished session
for resumption after recalibration. Discarding awards nothing. Posture feedback
does not establish attention or learning.

## Development

Keep the existing Supabase settings in `web/.env.local`. Add:

```dotenv
APP_URL=http://localhost:3000
ML_SERVICE_URL=http://127.0.0.1:8000
ML_INTERNAL_TOKEN=<random ASCII secret of at least 32 characters>
SUPABASE_SECRET_KEY=<server-only Supabase secret key>
```

Put the same `ML_INTERNAL_TOKEN` in the ignored `ml/.env.local`. Generate a token
with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Never put it in a `NEXT_PUBLIC_` variable or commit it.

Apply the pending migration `supabase/migrations/20261115000100_studbot_rewards.sql`
to the intended Supabase project after confirming its migration history. Keep the
Supabase secret key only in `web/.env.local` or server environment settings. It is
used solely by the website server after verifying the signed-in user. The browser
cannot call the privileged `studbot_command` RPC or submit duration or token awards.
Without this migration/key, the UI reports that progress cannot be saved; it does
not silently fall back to an unsaved timer or award pretend tokens.

From the repository root:

```powershell
npm.cmd ci
uv sync --project ml
uv run --directory ml python -m app.models.fetch
uv run --directory ml --env-file .env.local uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal, run `npm.cmd run dev`. Sign in, open `/tasks/studbot`, select
**Open focus mode**, allow camera access, and calibrate while facing the screen.
Calibration needs at least four usable samples spanning five seconds.
Keep your head and shoulders near the center. Pause, close, and navigation stop
camera capture. No microphone access is requested.

On desktop, switching tabs leaves the camera, sampling, and session timer active.
On mobile (including iPadOS), hiding the page pauses the saved session and stops capture.
Device detection uses the browser's mobile user agent, with a touch-capable Mac
user-agent check for iPadOS; unusual or overridden user agents may be misclassified.
Desktop background operation still depends on browser camera access and timer
scheduling. If the browser suspends the tab, the five-second credited grace
expires and counting stops; fresh observations resume the same saved session.

No book calibration is required. Forward and downward head positions count;
sideways/upward positions pause. A visible-ear/shoulder posture heuristic can
recognize looking down without a full face mesh. Shoulders alone cannot qualify.
These heuristics need real-camera evaluation; they cannot prove attention or
distinguish books from phones.

Extra faces/bodies do not cause rejection. The prominent centered person is
selected by location and size (up to four faces/three poses). Keep the main user
near the center; there is no identity recognition or persistent person tracking.
Another person occupying the same central position can be mistaken for the user.

The database starts/resumes counting after two seconds of compatible observations.
Away or uncertain observations receive five seconds of credited grace, and only
then pause. Missing results likewise receive at most five seconds after the last
saved observation. Each observation settles progress using database time; the
browser only displays that total plus the bounded lease. Manual pause and close
settle immediately. If an abrupt exit prevents the pause request from arriving,
the lease expires without continuing to accrue unattended time. Reopening
recovers the saved session; the camera must be recalibrated, but time is retained.
Brief calibration dropouts retain valid samples for up to three seconds.

Completions, wallet credits, and token-ledger entries are written together in a
single transaction under the same owner lock as other activities. Retry keys and
the unique completion constraint prevent duplicate awards. Late observations or
close requests from an older focus window cannot credit or pause its replacement.

## Deployment

Use a persistent Node.js server running `npm run build` then `npm run start`, with
exactly one Next.js process. Calibration, per-user session ownership, and request
ordering are kept in bounded process memory. Restarts require recalibration.
Credited time, observation sequencing, grace limits, and unfinished sessions are
stored in Supabase and survive website/ML restarts.
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
- `SUPABASE_SECRET_KEY`: a server-only Supabase key for verified study writes.

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
origin checks, bounded uploads, stale results, version changes, route auth,
saved progress, token rounding, and idempotent completion. The repository's
PostgreSQL test runner also executes `supabase/tests/studbot_validation.sql` and
real concurrent duplicate study completions against an isolated local database.
They do not establish real-camera accuracy or hosted infrastructure readiness.
Browser checks use synthetic camera streams and mocked replies in a test-only
component host, on desktop and phone viewports. Install Playwright Chromium first,
or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed compatible browser.
