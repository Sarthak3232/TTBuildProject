# Web API contract

Current non-ML implementation uses Next.js routes under `/api`. The earlier `/api/v1` layout was a planning default, not a second supported API. Shared public shapes are in `web/src/domain/activity.ts`; account state and the one shared activity clock are consumed through `web/src/features/app/AppProvider.tsx`.

## Access, requests and responses

Except for auth entry points, each handler verifies the Supabase cookie session with `getUser()` near data access. Owner identity comes from that verified user, never from a client-supplied owner ID. Service credentials and database mutation RPCs stay server-only. Every JSON response has `Cache-Control: private, no-store`.

Cookie mutations require matching `Origin`, reject cross-site requests, validate strict JSON input and stop reading after 64 KiB. Successful responses are the typed JSON object directly. Errors use `{error: {code, message}}`; expected classes include 401, 403, 404, 409, 413, 415, 422, 429 and dependency failures as 503. Malformed JSON is 400. A resource owned by another user is not returned.

Activity/task/profile/goal/roll mutations carry a UUID `key` in their JSON body. The shared client retains a key for retries of the same logical input, including uncertain replies; deliberate successful actions receive new keys. The database scopes keys to owner + operation, hashes input, locks the owner wallet before other mutable rows, and saves the committed response atomically. Same key/content returns the original result; changed content conflicts. Session controls also require the current `revision`.

## Implemented routes

All paths below are relative to `/api`.

| Method/path | Input | Result |
| --- | --- | --- |
| POST `/auth` | `action`: login/signup/reset/password/logout, corresponding validated fields | Supabase auth/cookies, confirmation/recovery messages; no preview authentication bypass |
| GET `/app` | None | Own profile/email, balance, nonarchived tasks, current activity, due goals, daily counts/earnings, latest fixed roll and server time |
| POST/PATCH `/tasks` | key, optional id, name, description, minimumMs, optional reflectionQuestion | Create or save a complete custom-task definition; predefined kinds cannot be rewritten |
| DELETE `/tasks` | key, id | Archive own custom task; captured completion/session snapshots survive |
| POST `/sessions` | key, taskId | Start one unfinished server-timed custom/run/walk session; study is rejected pending ML integration |
| GET `/sessions/{id}` | Own session id | Persisted shared activity, revision and server clock |
| PATCH `/sessions/{id}` | key, revision, action pause/resume/complete/cancel, optional reflection/description | Acknowledged state and optional completion/balance; no client duration accepted |
| GET `/sessions/{id}/route` | Own run/walk id | Private saved sequenced route, distance/coverage, next cursor and completion summary when completed |
| POST `/sessions/{id}/route` | revision, bounded points array, optional gap flag | Accepted/rejected fixes and reasons, distance, segments and next cursor; duplicate sequences are replay-safe |
| POST `/goals` | key, optional id, taskId, targetMs, repeatKind, optional weekdays/timezone | Persisted today/daily/weekday schedule; editing creates a future replacement while preserving today/past snapshots |
| DELETE `/goals` | key, id | Stop future recurrence; today's occurrence and history remain |
| PATCH `/profile` | key, displayName, timezone | Own persisted preferences; existing schedules keep their captured timezone |
| GET `/history` | period week/month/all, paired before/beforeId cursor, optional limit (default 25) | Newest-first completions, matching period totals and hasMore |
| GET `/history?month=YYYY-MM-DD` | Month date | Private per-day completion counts for the profile calendar |
| GET `/wallet` | Optional paired before/beforeId cursor | 25 immutable earning/spending entries with resulting balances and roll references |
| POST `/rolls` | key, exactly four whole-number allocations | Atomic full-stake debit and one immutable virtual result/entitlement |
| GET `/rolls` | Optional paired cursor | Own saved roll history, 25 per page |
| GET `/rolls?id={uuid}` | Own roll id | Original accepted result; no new debit or random outcome |

Auth confirmation/recovery is handled by `/auth/callback` (outside `/api`) using supported code exchange or token-hash verification and an allowlisted internal redirect. Account updates require a verified session. Configure the Supabase Auth site URL and callback allowlist for the actual app origin.

## Activity and GPS rules

Custom definitions require integer `minimumMs >= 1_800_000`; exactly 30 minutes is valid. Completion below the selected minimum or without the configured nonblank reflection fails without a history record/credit. Active time comes from server-clock intervals, excludes pauses, survives refresh and is rounded separately per completed session: `floor(eligibleMs / 1_800_000)`. Canceling earns nothing. Only one unfinished earning session may exist per account. Study earning is unavailable until authenticated observation integration is implemented.

GPS points use sequence, capturedAt, latitude/longitude and accuracy. The trusted ingestion RPC rechecks owner, running state/revision and running interval; timestamps increase, accuracy is <=50m, age/gap <=15s and jump speed <=12m/s. Duplicate uploads do not duplicate distance. Pauses, hidden/offline gaps, invalid fixes and missing coverage never bridge segments. Stationary time/GPS/map failure do not pause the server timer. Storage/batch/rate limits and a private cursor bound collection. No background GPS promise is made.

## Virtual roll policy and hardware boundary

For total allocated stake n: `p = 0.60 - 0.40 * exp(-(n-1)/3)`. Store `threshold = round(p * 1_000_000)` and `policyVersion = roll-v1`. Secure server randomness first chooses an integer in `[0,1_000_000)`; a win occurs below the threshold. Only a win samples a ticket in `[0,n)` to select one funded slot proportional to its allocation. The client displays both conditional and unconditional probabilities. Per-slot maximum is 1,000,000 and total maximum is 4,000,000. Zero/negative/fractional/overspend requests fail without a charge.

The fixed policy and allocations are validated atomically at acceptance; the current virtual interface does not require a separate quote resource. A retry may generate discarded server samples, but the committed key always returns its original stored outcome without another debit. No browser-supplied randomness is accepted. Both wins and losses spend the entire allocation exactly once. A win stores one slot and a `hardware_pending` entitlement; a loss has no slot and `not_applicable` delivery. Hardware absence must not block virtual rolls, and no result claims a physical unlock.

ML calibration/frame APIs, physical locker loading/collection, delivery retry/settings, simulator receipts and actuator transport remain later work, documented in the separate ML/locker contracts. There are no public clock overrides, token grants or force-win endpoints.
