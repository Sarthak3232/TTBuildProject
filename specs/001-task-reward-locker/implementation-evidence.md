# Initial frontend setup evidence

Date: 2026-11-01. Branch: `SarthakInitialSetup`. [Issue #1](https://github.com/Sarthak3232/TTBuildProject/issues/1).

## Scope and task status

The user requested a minimal shared frontend so teammates can build pages independently, with five sidebar destinations and nested Studbot/run-tracker routes. The issue-linked branch starts from `main` and carries the existing Spec Kit files from `task-reward-spec`, preserving the main README's SLOTTY branding.

T001 is complete. T005 (frontend scripts), T006 (shared layout/styles), and T017 (routing/navigation) are partial and remain unchecked. Other tasks remain pending. The user explicitly authorized the routing shell ahead of T010 and the full foundation gate. Only public placeholders exist; no real user data, session earning, rolling, sensors, ML, backend, or hardware behavior is implemented. Auth requirements still apply before private feature work ships.

## Implemented routes

| Route | Current behavior |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/dashboard` | Dashboard placeholder. |
| `/tasks` | Tasks placeholder with links to the two activity pages. |
| `/tasks/studbot` | Studbot placeholder with a back-to-Tasks link. |
| `/tasks/runTracker` | Run/walk placeholder with a back-to-Tasks link. Capitalization preserved. |
| `/history` | History placeholder. |
| `/redeem` | Redeem placeholder. |
| `/profile` | Profile placeholder. |

The sidebar has exactly five links. Tasks remains active on both nested routes. Each page has its own file under `web/src/app/(app)/`; navigation and layout are shared. Page ownership and branch instructions are in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Validation

Environment: macOS, Node 22.20.0, npm 10.9.3, Next.js 16.4.3, React 19.3.1, TypeScript 5.9.3.

| Check | Result |
| --- | --- |
| Spec Kit prerequisites and requirements checklist | PASS; feature resolved, 15/15 checklist items already checked. Reviewer checklist markers were not edited. |
| `npm ci` and `npm run dev` | PASS; clean lockfile install and development server start without credentials; nested run-tracker route returns 200. |
| `npm run lint` | PASS; zero warnings. |
| `npm run typecheck` | PASS; generated route types and strict TypeScript check. |
| `npm run build` | PASS; all seven page routes prerendered. |
| Production HTTP smoke checks | PASS; seven pages return 200, root returns 307 to Dashboard, unknown path returns 404, exactly five sidebar links and correct active section per page. |
| Browser navigation | PASS; all sidebar destinations and both activity links, back-to-Tasks links, nested-route refresh, browser back/forward, current-page indicators, and visible keyboard focus. |
| Visual checks | PASS; neutral sidebar and readable placeholders at desktop and narrow phone viewport sizes, with no horizontal overflow on Tasks. |
| `npm audit --omit=dev` | PASS; zero production dependency advisories. |

The full dependency audit reports 16 moderate development-tool findings propagated from the single minimatch advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). These are in ESLint's dependency tree; no production dependencies are affected. ESLint 9 is pinned to match the current React/JSX accessibility plugins' peer ranges. Do not use `npm audit fix --force`, which proposes incompatible package downgrades; adopt compatible upstream fixes when available.

The full-system acceptance checks in [quickstart.md](quickstart.md) have not been run and are not claimed. Phase 1 and the foundation gate remain incomplete. There are no before/after implementation hooks configured.

## Mobile navigation follow-up

The user requested a three-bar mobile menu. At widths up to 600px, navigation starts collapsed beneath a full-width header. The labeled button opens/closes the five links, selecting a destination closes the menu, and Escape closes it and restores button focus. The button exposes `aria-expanded` and `aria-controls`; closed links are hidden from keyboard and accessibility navigation. Desktop keeps the visible left sidebar.

Validation: lint, typecheck, and build passed. Browser checks confirmed open/close by pointer, Space to open, Escape to close with restored focus, auto-close after selecting History, and the visible sidebar/hidden toggle at desktop width. T017 remains partial because authentication is still pending.

## Hosted Supabase schema — issue #5

Date: 2026-11-01. Branch: `supabase-auth-setup`. [Issue #5](https://github.com/Sarthak3232/TTBuildProject/issues/5). Target: hosted **TTBuildProject**, project `yruyulqwyalxmtseaoml`, PostgreSQL 17.11. The user explicitly chose hosted Supabase. The local CLI configuration is optional reproduction tooling; no local Supabase containers were started.

### Delivered database scope

Ten application tables: `profiles`, `tokenBalance`, `task_definitions`, `activity_sessions`, `session_intervals`, `completions`, `token_entries`, `idempotency_records`, `goal_schedules`, `goal_occurrences`. All have RLS and explicit grants. Signup provisions a profile, zero balance and study/run/walk definitions; no redemption tables are needed. Custom minimums are required and at least 1,800,000 ms (30 minutes inclusive). Owner-consistent FKs, unfinished-session uniqueness, non-overlapping intervals, immutable completion/earning updates and schedule/date uniqueness protect stored records.

Applied through the signed-in Supabase SQL Editor in transactions; migration history records the exact local source contents:

| Version | Migration | Source MD5 (integrity comparison) |
| --- | --- | --- |
| `20261101234524` | identity | `431ab49ee5379c102571115a2d36cd46` |
| `20261101234526` | activity | `59b301be5b1651136ffeb522c6c9dc03` |
| `20261101234528` | goals | `4ebc4cb9be0f06c6def0d568e965e11e` |
| `20261101234839` | harden_auto_rls | `d47c35b5c76f89d3175036508820de18` |

The fourth migration revokes browser execution of the dashboard-created `public.rls_auto_enable()` event-trigger helper. Its conditional guard also supports databases where automatic RLS was not enabled. Privileged app provisioning stays in the unexposed `private` schema with an empty search path and no browser execute privilege.

### Validation

- Baseline: zero application tables and zero Auth users. An identity-schema assertion failed as expected before applying the migrations.
- The three schema migrations first executed inside a rollback-only transaction; all ten RLS tables were created successfully. The two-account validation also passed inside a rollback-only schema trial before persistence.
- After saving the schema, `supabase/tests/schema_validation.sql` passed. It verifies RLS on all ten tables; zero balance/default task provisioning; metadata cannot set a balance; timezone fallback; required/exact-30-minute/below-30-minute custom minimums; cross-owner links; snapshot kind integrity; one unfinished session; interval overlap rejection; below-minimum completion rejection; unique completions/earning entries; immutable history; valid weekday schedules/unique dates; account-isolated reads across nine readable tables; rejected balance writes, history deletion, idempotency reads and forged task owners; allowed own profile changes; protected predefined tasks; and historical goal targets preserved on schedule edits.
- After hardening the automatic-RLS helper, the validation additionally checks that neither `anon` nor `authenticated` can execute any SECURITY DEFINER helper in `public`/`private`; the complete SQL validation passed again.
- Every validation transaction rolls back fixture accounts and activity/goal records. These checks simulate database roles; they do not validate Auth HTTP signup, mail delivery, browser sessions or application integration.
- `npm run check` passed (lint, TypeScript and production build) after the pinned Supabase CLI dependency and helper scripts were added. The seven page routes remain placeholders.
- The local CLI parsed `supabase/config.toml`; `supabase status` then reported the expected absent local container. Local start/migrate/check helpers have not been exercised against a running Docker stack and are not claimed as runtime-verified.
- Security Advisor after hardening reports zero errors and zero warnings. Its single informational suggestion is RLS-without-policy on server-only `idempotency_records`; this is intentional default-deny behavior, and both browser table grants are revoked.
- Hosted database types were generated and downloaded from Data API docs into `web/src/server/supabase/database.types.ts`, including the configured public/managed GraphQL schemas. No app client imports them.
- No Spec Kit before/after implementation hooks are configured. Reviewer checklist markers were not edited.

### Spec Kit completion boundaries

T003 has configuration, pinned CLI, redacted environment template and local helper implementation, but the fresh local runtime acceptance remains unverified. T004/T005 have only supporting SQL fixture/tooling contributions. T007 has database ownership/provisioning validation; web auth-boundary tests remain pending. T008 has identity schema/provisioning and generated schema types; its prerequisite gate is not complete. T013 and T054 have their shared storage portions; runtime accounting, goal expansion/progress and prerequisite tests remain pending. These broader task boxes remain unchecked. T009–T011, T014–T016, T020, T055–T057 and T063 application integration is not delivered here. Study/GPS-specific schemas remain T037/T048. T025–T035 stay hardware-gated and unimplemented.

The database can store earned tokens, but there is no runtime crediting RPC or application API yet. No rewards, spending, drawers or delivery tables were created, and no populated credentials are committed. See [database setup](../../supabase/README.md) for reproduction and verification.


## 2026-11-09 — Parallel non-ML application integration (#9/#10)

The user explicitly requested two agents: run/walk tracking in issue #9 and all other non-ML application logic in #10. Supabase database foundation and the styled frontend were already merged into main. Work is integrated on `codex/full-app-integration`; this is code/test evidence, not evidence of a deployed hosted application.

### Scope delivered in source

- Real Supabase email/password signup/signin, confirmation callback, recovery/update/logout; verified cookie auth near every data boundary. Protected app routes are explicitly dynamic; the production build lists account pages as dynamic rather than freezing a setup fallback. Blank preview entry and simulated private records were removed.
- Persistent custom task create/edit/archive/reuse, selected >=30-minute minimum, optional nonblank completion reflection, one shared server-clock session, pause/resume/cancel/complete, refresh recovery and one unfinished session per account. Studbot is explicitly unavailable pending ML integration and cannot start reward-bearing study activity.
- New restricted transactional `app_mutate` RPC validates owner, serializes wallet before session/other rows, persists UUID-key/payload idempotency and commits immutable completion/ledger credits or virtual-roll debits/results together. API clients never supply owner, elapsed time or authoritative random outcome. Default mutation keys survive uncertain replies/reload; accepted roll recovery returns the original result.
- Goals/calendar/dashboard/history/profile derive from persisted records. Goal effective dates preserve today/past occurrences, capture IANA timezones and split intervals at local DST boundaries. Browser goal writes were revoked so direct requests cannot bypass future-only edits. History/ledger/results paginate with stable timestamp/id cursors.
- Four virtual allocation slots, exact quantized two-stage server RNG, displayed conditional/unconditional odds, full-stake charge for win/loss, immutable roll history and a fixed winning slot with hardware-pending entitlement. No physical unlock, simulator delivery receipt or hardware command is claimed.
- Real foreground run/walk geolocation, MapLibre/OpenFreeMap with attribution, private sequenced points, segmented distance/coverage, manual controls, saved route/summary and errors independent of timer rewards. Invalid/stale/jumping/paused points never fabricate distance. GPS capture stops on pause/end/hidden/offline; no background or screen-locked GPS promise.

### Reproducible validation

On the final integrated source:

| Check | Result |
| --- | --- |
| `npm run check` | PASS: ESLint zero warnings, generated route types/TypeScript and production build. Protected account pages are dynamic. |
| `npm test` | PASS: 47 tests across accounting/probabilities, GPS domain, trusted API input/auth/origin/RNG ordering/bounded streams, and client retry keys. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=... npm run test:e2e` | PASS: 20 cases across desktop and Pixel 7 Chromium. Used an existing local Chromium binary; no browser download. |
| `python3 scripts/test-postgres.py postgresql://postgres@127.0.0.1:55432/slotty_test_final` | PASS: fresh complete migration chain, base schema validation, application validation, tracking validation and actual concurrent transactions. Runner refuses hosted/nonempty databases. |
| Fixture cleanup | Zero Auth fixture users remain after rollback/concurrency cleanup. |
| Public type regeneration | 13 public tables and 6 public RPC signatures regenerated serially from the final migrated PG catalog; separately exported managed GraphQL metadata preserved. |

PostgreSQL 17 was installed and an isolated native test cluster used. `bootstrap-local.sql` supplies minimal Supabase-style Auth roles/catalog/uid only; these are database fixtures, not an Auth HTTP implementation. The SQL suite proves 29:59/30:00/59:59/60:00 rounding, custom minimum/reflection, paused/canceled/stale/idempotency behavior, immutable ledger/results, exact win/loss/funded slot/pending entitlement, insufficient balance, goal/date/DST snapshots, pagination and RLS/privileged function boundaries. Real concurrent connections prove one accepted start, one completion credit and no overspending under simultaneous rolls.

The browser suite runs the actual Next auth/protected surfaces and production React task/goal/roll/tracking components. Its test-only Vite host, network fixtures and synthetic GPS are under `web/tests/`; there is no production auth bypass or public fake clock/token/result route. Browser mocks validate client integration, not actual Supabase email/session issuance or real-device geolocation. GPS tests cover start/flush/pause/resume/finish, cursor/timer refresh, denied location and saved summaries under map failure. Task/roll cases cover reflected completion/wallet refresh, definition/schedule saves and fixed virtual results/debits at desktop/phone widths.

GitHub Actions now runs unit/API tests, fresh PostgreSQL migration/RLS/concurrency checks, lint/typecheck/build and the browser suite. CI uses its own disposable service/database and synthetic test credentials, never the hosted project.

### Access and remaining acceptance

At the time of these checks, `web/.env.local` was absent and no Supabase management/CLI connection was verified. The user is preparing project URL/publishable/server secret values. The Supabase plugin was suggested, but attempted tools returned unknown-tool errors, and the CLI had no access token. No new migrations were applied to the hosted project, no real Auth account/email/recovery was exercised and hosted schema/type parity is not claimed. Configure keys, connect migration access, apply the three new forward migrations after verifying the four existing versions, configure Auth callback/site URLs, then verify the real account→activity→credit→roll flow.

Docker-backed local Supabase startup encountered disk exhaustion and incomplete image files; task-created duplicate dependencies/build files and task-downloaded broken images were cleaned up without removing existing user files/images. The complete Docker/Auth stack did not pass startup. Native PostgreSQL tests are separate evidence. Do not assume local Supabase authentication is available from the SQL pass.

Deferred: ML/FastAPI/calibration/camera integration; physical hardware/unlock/acknowledgement/retry/collection; real phone/GPS permission and background limits; five-person usability and full-product performance acceptance. Reviewer checklist markers were left unchanged. No `.specify/extensions.yml` or before/after implementation hooks exist. Constitution/spec/plan/contracts were reconciled to the user's virtual-roll-now amendment; mixed original tasks stay unchecked when their ML/device/live acceptance remains incomplete.
