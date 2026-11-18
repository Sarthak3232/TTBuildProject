# Web API contract

Current non-ML implementation uses Next.js routes under `/api`. The earlier `/api/v1` layout was a planning default, not a second supported API. Shared public shapes are in `web/src/domain/activity.ts`; account state and the one shared activity clock are consumed through `web/src/features/app/AppProvider.tsx`.

## Access, requests and responses

Except for auth entry points, each handler verifies the Supabase cookie session with `getUser()` near data access. Owner identity comes from that verified user, never from a client-supplied owner ID. The same authenticated client makes owner-scoped database calls. Postgres RLS protects table reads. The database RPCs derive the owner from `auth.uid()` and validate inputs independently of the Next.js routes. Every JSON response has `Cache-Control: private, no-store`.

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

For total allocated stake n: `p = 0.60 - 0.40 * exp(-(n-1)/3)`. Store `threshold = round(p * 1_000_000)` and `policyVersion = roll-v1`. Cryptographic randomness in Postgres first chooses an integer in `[0,1_000_000)`; a win occurs below the threshold. Only a win samples a ticket in `[0,n)` to select one funded slot proportional to its allocation. The client displays both conditional and unconditional probabilities. Per-slot maximum is 1,000,000 and total maximum is 4,000,000. Zero/negative/fractional/overspend requests fail without a charge.

The fixed policy and allocations are validated atomically at acceptance; the current virtual interface does not require a separate quote resource. A retry may generate discarded server samples, but the committed key always returns its original stored outcome without another debit. No browser-supplied randomness is accepted. Both wins and losses spend the entire allocation exactly once. A win stores one slot and a `hardware_pending` entitlement; a loss has no slot and `not_applicable` delivery. The API commits independently of hardware. The rewards UI checks USB readiness before a new payment; USB completion is recorded locally and does not change the server entitlement or claim sensor-verified unlocking.

### Three-wheel output

Every saved roll also returns `wheels`, an array of exactly three symbols in left-to-right wheel order. Allowed values are `jacqueminot`, `garnet`, `tongs`, and `hammer`. A separate cryptographically generated ticket is persisted atomically with the roll. Reopening history, refreshing, or retrying a paid request returns the same three symbols.

- Win: all three symbols match; each of the four symbols is equally likely.
- Loss below 50% win probability: uniformly choose among all 60 combinations except three matching symbols.
- Loss at 50% or more: the first two symbols match and the third differs; all 12 such combinations are equally likely. Under the existing probability curve this starts at six allocated tokens.

The win/loss decision happens first; display styling never changes the actual probability or creates a reward. The winning drawer is still selected from funded slots by token weight, independently of the displayed winning symbol. Use `roll.slot`, not a symbol-to-drawer guess, for drawer control.

`wheelCommand(roll)` in `web/src/domain/rolls/wheels.ts` validates and prepares this transport-neutral payload for the USB ESP32 adapter:

```json
{
  "schemaVersion": 1,
  "eventId": "3fba37c1-1996-4216-803c-449202a445b5",
  "outcome": "win",
  "wheels": ["garnet", "garnet", "garnet"],
  "winningSlot": 3
}
```

For a loss, `outcome` is `loss` and `winningSlot` is null. Symbol-to-sector mapping depends on each physical wheel's artwork and calibration; this payload does not send motion or claim firmware compatibility. Apply `20261118173233_roll_wheel_outputs.sql` before running this version against a database. It adds wheel metadata to existing rolls and their retry snapshots without changing original outcomes or balances.

USB actuator transport is implemented as described in the [reel-engine integration contract](../../../integration/reels/USB-REEL-ENGINE.md). Physical locker loading/collection, a server delivery worker, shared device receipts and simulator delivery remain later work in the locker contract. Studbot endpoints are documented separately. There are no public clock overrides, token grants or force-win endpoints.

For explicitly enabled local development tests, server-only `SLOTTY_TEST_WINS=true`
routes authenticated new roll requests through the existing trusted accounting
RPC with a guaranteed winning sample. `GET /app` includes `testWins` for the
100% test banner. Production ignores this flag; POST bodies still accept only
the key and allocations, and saved idempotent outcomes are never rewritten.
