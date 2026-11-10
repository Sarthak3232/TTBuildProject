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
