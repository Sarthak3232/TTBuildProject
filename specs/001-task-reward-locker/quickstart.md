# Quickstart and acceptance guide

**Design target:** The app has not been implemented. Commands and files below are the interface the implementation tasks must provide; they are not runnable in the current docs-only checkout. Do not interpret this guide as passed validation.

## Prerequisites and local setup

Node 22.20+, npm, uv/Python 3.11, a Docker-compatible runtime for local Supabase, modern camera/location-capable browser, and model asset download access. The local setup needs no hosted Supabase project or paid map account. Mobile device access needs a reachable HTTPS development origin; localhost on a phone refers to that phone, not the laptop.

From the repository root after implementation:

```sh
npm ci
npm run supabase:start
npm run db:migrate
cp web/.env.example web/.env.local
cp ml/.env.example ml/.env
uv sync --project ml
uv run --project ml python -m app.models.fetch
npm run dev:web
```

In separate terminals:

```sh
uv run --project ml uvicorn app.main:app --host 127.0.0.1 --port 8000
npm run dev:delivery
```

The implementation must provide the scripts above. `supabase:start` wraps the pinned local CLI, and `db:migrate` applies project migrations to that local stack. Model fetching must verify pinned checksums and licenses. The web environment contains local Supabase URL/publishable key, server-only privileged key, ML service URL/internal credential, and map style URL. ML gets only its internal credential/model path, not privileged Supabase credentials. Never commit generated secrets. Record actual compatible package/model versions in lockfiles/manifests.

Sign up with local Supabase email/password. Provision four empty simulator drawers and a zero-balance wallet transactionally per account. The local Auth mail inbox can satisfy the selected confirmation flow; public mail deployment is outside this local guide. Test seeds may supply isolated accounts/balances; the public app must not expose grant-tokens or force-win endpoints.

## Automated validation scripts

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
uv run --project ml pytest
npm run test:e2e
npm run build
```

DB/E2E scripts must use isolated test project/database state and never reset a hosted/user dataset. Tests may inject fake clocks, deterministic RNG and model outputs through test-only adapters; do not wait 30 minutes or rely on lucky rolls to verify boundaries.

## Required acceptance evidence

1. **Identity:** Use two accounts. Cross-account history/routes/wallet/session/locker access fails, including direct authenticated Supabase access. Browser roles cannot call privileged RPCs or edit credits/outcomes.
2. **Custom activities:** Create a task with a required minimum of at least 30 minutes and optionally one reflection question. Reject missing/null/disabled minimums and values below 30 minutes at UI/API/database boundaries. Accept exactly 30 minutes. Confirm start/pause/resume/stop; no manual duration entry. At 29:59 on a 30-minute custom task, completion must fail without a completion/ledger/reward; at 30:00 it may complete and earns one token. A 45-minute target cannot complete at 30:00. Paused intervals do not count.
3. **Accounting:** For completed predefined study/run activities and reward-arithmetic checks: 29:59 → 0, 30:00 → 1, 59:59 → 1, 60:00 → 2 tokens. Separate completed predefined 20- and 10-minute sessions earn zero. Custom tasks below their required selected minimum cannot complete or earn at all. Repeated completion returns the same history/ledger result. Concurrent tabs cannot create overlapping unfinished sessions or double credit.
4. **Daily goals:** Study 60 minutes and Walk 30 minutes show independent progress. Two 20-minute study completions advance the goal by 40 minutes while earning zero tokens. Verify today-only, daily, Mon/Wed/Fri, DST/date boundaries and no duplicate occurrences. No separate weekly target UI.
5. **Run/walk:** With mocked and real GPS, show map, route, distance and timer. Standing still does not pause the timer. Only manual controls pause/resume. Paused movement adds no distance; gaps/jumps do not bridge route segments; missing tiles show a map error without inventing distance or stopping the manual timer.
6. **Studbot:** Calibrate screen and book positions. Reading/writing downward qualifies; sustained turn-away/absence auto-pauses after five seconds; two valid seconds auto-resume with prior time intact. Unknown/low-light/blocked/stale input earns no time. Short permitted glances and unresolved-away completion follow the exact grace rules. Manual pause stops capture and does not auto-resume. Hidden-page gaps receive no study credit.
7. **ML/privacy:** Verify model asset versions, readiness, frame size/rate/concurrency limits, timeout/unknown behavior and per-user ownership. Inspect files/logs/storage after success, error and cancellation: no raw study images/video or request-body tracing. Evaluate the declared balanced controlled set against the ML contract threshold; report limitations.
8. **Rolling:** Load four named simulated items. Quote 1 token = 20%, 10 = about 58%, 20 = about 59.9%. With allocations 3/1/0/0, conditional winner weights are 75%/25%/0/0. Reject zero, fractions, negative/overspend, stale/expired quotes and unavailable drawers without charge. Deterministic fixtures prove win/loss and secure random sampling maps to the stored policy; do not make flaky distribution tests the sole evidence.
9. **Concurrency/recovery:** Concurrent rolls cannot overspend. Identical keys return the same charge/result; changed payload under a key conflicts. Refresh recovers the roll. Known-offline simulator blocks new charges. Failure after commit retains result/entitlement; drop-ack retries produce one unlock and no additional payment. Restart worker mid-delivery and verify lease recovery. Old events cannot unlock reloaded items.
10. **UI:** Compare Dashboard/History against supplied references at phone and desktop sizes. Check keyboard navigation, labels, focus visibility, contrast, loading/empty/error states, token totals and simulation badge. Announce roll and pause outcomes accessibly; respect reduced-motion settings.

Performance targets: p95 local list/roll responses under one second over 10,000 completions, normal simulator acknowledgement within five seconds, and bounded one-FPS inference without UI blocking. Capture the environment and measured results. Real devices remain necessary for camera/GPS behavior; mocked tests alone do not prove it.

## Stop conditions

Do not call the feature complete if ownership/ledger/retry invariants fail, if Studbot fails its declared evaluation criteria, or if raw frames are persisted. Report unsupported browser/sensor/model behavior explicitly. Real hardware and background GPS require later scoped work.
