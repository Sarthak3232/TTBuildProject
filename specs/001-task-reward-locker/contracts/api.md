# Web API contract

Planned JSON interface under `/api`, implemented by Next.js. Auth routes use Supabase Auth. Except auth/public health endpoints, require a valid cookie session verified server-side. Derive user ID from auth; never accept a request-body owner ID. Return 404 for another user's resource. Use same-origin/CSRF protection for cookie mutations, schema validation, and per-user rate limits.

## Current milestone — 2026-11-09

Auth/profile, custom tasks and server-clock sessions, foreground GPS runs/walks, atomic earning, goals/history/dashboard/wallet, virtual allocations and fixed-result rolls are current scope. Balances persist in `tokenBalance`; the ledger records both credits and roll debits. The accepted allocation is spent once even on loss. Exactly four virtual slots represent future compartments; winning entitlements remain hardware-pending. Hardware availability/acknowledgement must not gate virtual rolls. ML calibration/frame endpoints and all physical/simulator delivery, collect/load/retry/settings endpoints in the retained design below remain deferred.

The original versioned path design is implemented as `/api`; clients and handlers must agree on one path family. Shared activity/client types are defined in `web/src/domain/activity.ts` and shared state lives in `web/src/features/app/AppProvider.tsx`. Tracking consumes the same session and completion APIs. Endpoint/envelope details are reconciled to executable handlers during integration.

## Common envelopes

Success: `{data: ...}`. Error: `{error: {code, message, retryable, fieldErrors?}}`.

Mutations that create or transition resources require an `Idempotency-Key` UUID and expected `revision` where applicable. Identical committed requests return the saved resource; the same key with different content returns 409. The DB transaction owns this guarantee, not an in-memory cache. Timestamps are ISO UTC, durations integer milliseconds, token quantities integers. Do not put camera bytes in JSON or logs.

| Method and path | Input | Output/behavior |
| --- | --- | --- |
| GET/PATCH `/profile` | displayName/timezone for patch | Own profile; timezone change affects new schedules only |
| GET/POST `/tasks` | name, required minimumMs >= 1,800,000, optional reflectionQuestion | Own predefined/custom tasks; POST creates custom type only |
| PATCH `/tasks/{id}` | editable fields, revision | Update own task; reject null/below-30-minute custom minimum; omitted PATCH fields retain existing required values; existing completions remain snapshots |
| POST `/sessions` | taskId | Start one unfinished session; returns server clock/state/revision; may need calibration first |
| GET `/sessions/current` | none | Persisted current session plus serverTime; restore running timer or paused study state honestly |
| POST `/sessions/{id}/controls` | action pause/resume/cancel, revision | Apply timestamped state transition; a new request is needed for each deliberate action |
| POST `/sessions/{id}/complete` | reflection?, revision | Validate and finalize; return completion, awardedTokens, walletBalance |
| POST `/sessions/{id}/route` | bounded batch of sequenced fixes | Accept valid fixes into route segments; return accepted/rejected counts and distance; never pauses timer based on motion |
| POST `/study/calibrations` | camera setup metadata | Start five-second screen and five-second book-position calibration; return calibration ID |
| POST `/study/calibrations/{id}/frames` | bounded JPEG; X-Calibration-Phase screen/book and sequence headers | Forward to private calibration-observation inference; aggregate usable poses; return phase/progress/ready |
| POST `/sessions/{id}/focus-frame` | bounded JPEG plus sequence/calibration headers | Authenticate before streaming to FastAPI; persist aggregate observation, return state/count; private ML contract applies |
| GET `/goals?date=YYYY-MM-DD` | local date | Due goal occurrences with target, progress, provisional flag and completion |
| POST `/goals` | taskId, targetMs, repeatKind today/daily/weekdays, weekdays? | Create schedule in profile timezone; validate nonempty weekday selection |
| PATCH/DELETE `/goals/{id}` | changes, revision | Future occurrences only by default; preserve historical snapshots |
| GET `/dashboard?date=...` | optional date | Due goals, today's completed tasks, wallet, tokens earned that day |
| GET `/history?period=week|month|all&cursor=...` | optional cursor | Newest-first completion groups and period totals, 25 records per page |
| GET `/wallet` | cursor? | Balance and paginated immutable earning/spending entries |
| GET `/locker` | none | Four compartment labels/states/revisions, simulation badge, connectivity |
| POST `/locker/slots/{slot}/load` | itemLabel, expectedRevision | Load/relock own empty or collected drawer, or update locked item's label; reject reserved/unresolved drawer |
| POST `/locker/slots/{slot}/collect` | expectedRevision | Acknowledged open drawer becomes collected; does not reroll or grant tokens |
| POST `/roll-quotes` | allocations: four slot/token pairs | Validate numbers, return quoteId, expiry, total, overall and conditional/unconditional drawer chances, revisions, policy |
| POST `/rolls` | quoteId | Revalidate quote, debit, persist fixed win/loss and durable delivery event atomically |
| GET `/rolls/{id}` | none | Fixed outcome and separate delivery/entitlement status; refresh returns this result |
| POST `/rolls/{id}/retry-delivery` | none | Requeue existing unresolved event only; no new outcome or cost |
| POST `/simulator/settings` | online, failureMode | Own simulated locker only; visible simulation controls; no direct balance/outcome mutation |

Custom-task creation requires an integer `minimumMs >= 1_800_000`; reject missing, null, disabled, and smaller values with 422. Exactly `1_800_000` is valid. Partial edits may retain the existing minimum but cannot remove it. Completion below the selected required minimum returns 422 and creates no completion, ledger entry, or reward.

## Roll probabilities

For positive allocated total n: `p = 0.60 - 0.40 * exp(-(n-1)/3)`. Store applied `winUnits = round(p * 1_000_000)` and policy `roll-v1`. Draw a secure uniform stage-one integer in `[0, 1_000_000)`; win iff it is below winUnits. Only a win selects a secure uniform token ticket in `[0,n)` and maps it to slot allocation ranges. Zero-funded slots never win. The resulting slot probability is `(winUnits / 1_000_000) * allocation/n`. All four allocations are spent even on a loss.

Next generates random values exclusively with secure server randomness; the restricted RPC validates totals/policy and persists the result. Browser random values/outcome hints are ignored/rejected. Retrying a committed key returns the original result. Per-slot allocation limit 1,000,000 and total limit 4,000,000 are numeric validation bounds. Increasing stakes eventually changes displayed rounded odds by tiny or invisible amounts; there is never a guaranteed win.

Virtual-roll delivery is `hardware_pending` for wins and has no successful unlock acknowledgement. Absent hardware does not block new virtual quotes/rolls. Physical drawer revision/known-online checks and durable adapter event delivery below apply only to the later physical milestone.

Quote lifetime is 60 seconds. Expired/stale policy or drawer revisions require a new quote and cause no charge. Balance is checked at acceptance, not guaranteed by quoting. An accepted roll always charges once and creates one event, including losses; delivery can be pending after the result is known.

## Errors and failure behavior

401 unauthenticated; 404 missing/not-owned; 409 stale revision, active-session conflict, insufficient balance, expired quote, idempotency mismatch, reserved drawer; 422 invalid input/minimum/reflection; 413 frame too large; 429 rate/concurrency limit; 503 unavailable inference or retry-exhausted transient dependency. Inference failure returns unknown/no study credit, not a false compatible label. GPS/map failure never fabricates distance; a tile failure does not stop the manual timer.

Profile/auth/session and sensitive payloads are not cacheable as public content. Secrets stay in server-only modules; FastAPI receives only its internal credential and verified session identifiers, never privileged Supabase keys.

Late inference responses must recheck the active session revision before persisting observations; a completed, canceled, or manually paused session cannot receive delayed credit. Batch route requests likewise validate the running interval and do not turn paused movement into distance.
