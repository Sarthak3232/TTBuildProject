# Non-ML application quickstart and acceptance

Current scope is issues #9/#10: real Supabase auth/profile, custom tasks and measured timers, foreground run/walk GPS, goals/dashboard/history, earning and virtual rolls. ML/camera integration and physical delivery remain excluded. Virtual wins retain a fixed slot and hardware-pending entitlement; no physical unlock is claimed.

## Configure and run

Use Node 22.20+/npm 10.9.3+. Run `npm ci`, copy `web/.env.example` to ignored `web/.env.local`, and set the project URL, publishable key and `APP_URL`. Data requests use the signed-in user’s session. Apply pending migrations in order, including `authenticated_app_sessions` for session-based database access. Configure Supabase Auth site URL, confirmation/recovery email and callback allowlist for the actual app origin.

Run `npm run dev` and open http://localhost:3000. Sign up, confirm email and sign in. Logout and password recovery use Supabase; account pages and APIs are protected. With no configuration the app gives a setup message, not a fixture-account bypass. The hosted project is `yruyulqwyalxmtseaoml`; production migration application and real Auth verification require its connection and are recorded separately from local evidence.

The optional Docker-backed local Supabase configuration/helpers remain available (`npm run supabase:start`, `npm run db:migrate`, `npm run db:check`). During this implementation, Docker downloads encountered disk exhaustion/corrupted images, so database evidence was produced with isolated native PostgreSQL 17 instead. Do not infer a passing complete local Supabase/Auth stack from those SQL tests.

## Checks

- `npm test`: accounting/probability, strict API/auth boundaries, retry client and GPS domain checks.
- `npm run check`: lint, TypeScript, production build. Authenticated pages must remain dynamic/private.
- `npm run test:e2e`: actual React/Next desktop/mobile UI with explicitly mocked test-only service/sensor contracts. The harness lives under tests, never production routes. Configure a compatible cached browser with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` or install the Playwright Chromium revision on a fresh machine.
- `python3 scripts/test-postgres.py postgresql://postgres@127.0.0.1:55432/slotty_test`: requires an empty isolated local PG17 database named `slotty_test*`, contrib extensions and psql. Refuses hosted/nonempty targets, applies migrations, runs rollback SQL fixtures and real concurrent start/complete/spend checks. Auth catalog/roles are a minimal fixture; real email/cookies need separate verification.
- `python3 scripts/generate-public-types.py DATABASE_URL`: read-only public catalog regeneration after schema application; keep hosted managed GraphQL metadata distinct.

CI supplies fresh Postgres for migration/RLS/concurrency checks. No public grant-token, forced-result or backdated-duration endpoint exists. Test fixtures use database-admin setup only on isolated datasets.

## Acceptance sequence

1. With two real accounts, verify signup/confirmation/signin/logout/recovery, refresh/expiry, private pages and cross-account API/direct-table isolation. Browser roles cannot call privileged RPCs or edit wallet, outcomes or future-only goal schedules.
2. Create a custom task with name, minimum >=30 minutes and optional reflection. Start/pause/resume, refresh and finish once. Selected minimum and nonblank configured reflection are enforced in the trusted transaction. Typing a target duration never awards tokens. Early stop can resume/cancel.
3. Isolated timer fixtures prove 29:59→0, 30:00→1, 59:59→1 and 60:00→2 for eligible predefined sessions; custom sessions cannot complete below their selected minimum. Separate sessions discard remainders. Repeated/concurrent completion yields one credit/history record; only one unfinished session may exist.
4. Verify today/daily/selected-weekday goals, captured timezone, 23/25-hour DST days, matching interval clipping, provisional running progress and no canceled contribution. Edits/deletes preserve today/past occurrences and apply future changes without bonus tokens.
5. Review newest-first filtered/paginated history and totals, profile calendar, notes/reflections and saved run route/distance. Reuse a historical definition to start new measured work; never recreate its reward.
6. In foreground run/walk, permit GPS contextually, observe map/distance/timer, stand still, pause/resume, simulate missing/poor/stale/jumping fixes, hide/reload and finish. Timer controls are manual; map/GPS failure does not invent distance or pause time. Saved route remains private. Real-device/browser permission behavior remains a separate manual check.
7. Earn tokens, allocate four slots and review total cost plus conditional/unconditional odds. One token shows20%, ten about58%, twenty about59.9%; redistribution changes funded slot weights, not total win probability. Invalid/overspend requests charge nothing. An accepted win or loss consumes the full stake once and saves an immutable result. Winning delivery stays hardware pending. Reload/retry original result must not charge or reroll.
8. Inspect phone/desktop layouts, labels/focus/keyboard, loading/error/offline and reduced-motion behavior. Record real-account, real-GPS and five-person usability outcomes only when actually performed.

Do not mark ML inference/study observation, physical delivery/acknowledgement recovery, real-device GPS or human usability passed from mocks. See `implementation-evidence.md` for actual commands, current access gaps and task completion scope.
