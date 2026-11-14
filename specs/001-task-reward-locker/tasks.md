# Tasks: Task Reward Locker

**Input**: [plan](plan.md), [spec](spec.md), [research](research.md), [data model](data-model.md), [contracts](contracts/api.md), [quickstart](quickstart.md), and constitution v4.0.0 (2026-11-09 scope amendment).
**Planning branch**: `task-reward-spec` | **Initial implementation branch**: `SarthakInitialSetup` | **Created**: 2026-11-01
**Status**: Current non-ML source is implemented and passes isolated validation (T074–T079/T082). T073/T080/T081 await hosted Auth/configuration/migration acceptance; full-product ML/hardware/research tasks remain unchecked. Earlier foundation and frontend contributions are retained in [implementation evidence](implementation-evidence.md).

## Current Scope — Non-ML Application and Run/Walk Tracking

User-directed 2026-11-09 scope is tracked in [#9](https://github.com/Sarthak3232/TTBuildProject/issues/9) (tracking) and [#10](https://github.com/Sarthak3232/TTBuildProject/issues/10) (all other app logic). Real auth, tasks/timers/reflections, earning, goals/dashboard/history/profile, GPS tracking and virtual rolls/spending are current. Physical hardware, simulator delivery workers/acknowledgements and ML/FastAPI/Studbot integration remain deferred. The old issue #5 database-only milestone is complete as a scoped contribution; its broader tasks were deliberately not checked from schema evidence alone.

The user explicitly requested two parallel agents. They may author independent modules/tests against one shared auth/session/accounting API; integration still requires the foundation gate. Shared manifests/types/migrations remain serialized. This scheduling authorization does not permit duplicate wallets, client-authoritative time/credits, public test bypasses or false live-device validation claims.

**Virtual redemption override:** T025/T027/T028/T032/T033 apply to the current virtual quote/roll/result path, with T026 reduced to virtual slots/results/debit schema and pending entitlements. Hardware-online gating, physical provision/load/collect/acknowledgements, T029–T031, T034 and physical parts of T035 remain later work. Keep these mixed tasks unchecked until their full retained scope is complete; scoped current acceptance is tracked by T073–T082 below.

**ML exclusion:** T002 and T036–T046, plus ML portions of shared/cross-cutting tasks, are outside this assignment. The shared accounting layer must reject unverified study earning. Track real-GPS and five-person usability results honestly rather than inferring them from mocked tests.

Unimplemented migration filenames below are original design targets. New migrations receive fresh increasing versions after already-applied files, which must not be edited. Current endpoints use `/api` in place of the original `/api/v1` paths while retaining the same access/accounting guarantees.

## Initial Setup Scope — Issue #1

The user authorized a basic shared frontend before full feature implementation: five sidebar destinations and separate placeholder pages, plus `/tasks/studbot` and `/tasks/runTracker`. This intentionally brings the routing portion of T017 forward before T010. The pages are public placeholders without private data, sensors, rewards, or working account controls. Auth and the foundation gate remain required before those features ship.

| Task | Initial setup result | Still required |
| --- | --- | --- |
| T001 | Complete: npm workspace, pinned Next.js/React/TypeScript app, lockfile, root layout. | — |
| T005 | Partial: frontend dev/lint/typecheck/build/start/check scripts and CI. | Full validation runner, feature tests, isolated DB lifecycle, ML and delivery-worker scripts after their prerequisites. |
| T006 | Partial: neutral shared layout/typography variables, responsive CSS, focus visibility, and skip link. | Reusable labeled form and progress controls. |
| T017 | Partial: five-destination sidebar, mobile three-bar menu with open/close controls, active section including nested task routes, and honest placeholders. | Authenticated/protected navigation and functional auth controls after T010. |

T023, T033, T044, T051, T059, T060, and T064 remain unchecked: their actual features are not implemented by creating page files. This scope does not change task IDs, counts, feature requirements, or the dependency order for subsequent implementation.

**Organization**: Setup → shared foundation → one phase per spec user story in priority order → cross-cutting validation. Tests are included because the specification's acceptance scenarios/success criteria and project constitution require meaningful accounting, authorization, model/privacy and recovery checks.

## Format and Paths

`- [ ] T### [P?] [US#?] Action with exact file paths`.
`[P]` permits parallel work only after the task's explicit prerequisites are complete and only with tasks touching different files. It does not authorize spawning agents or relax prerequisite order. Story phases require their `[US#]` label; setup/foundation/polish do not.

All paths are repository-relative. The plan's `web/`, `ml/`, and `supabase/` trees are future source locations. Model constraints below are quoted verbatim from the data model to prevent silent implementation choices. SQL migrations run in numeric order; regenerate shared database types serially after schema changes. Shared lockfiles, package manifests, navigation and evidence documents are not parallel edit targets.

Tests listed first must fail for the missing behavior before implementation and then pass. Prefer fake time/RNG/model adapters in isolated tests; never expose them to public routes or mark manual tests passed automatically.

## Phase 1: Setup (Shared Infrastructure)

**Goal**: Create repeatable local runtimes and verification tools.

**Independent test**: A fresh checkout can install pinned dependencies and start the local web, Supabase and ML skeleton using documented scripts.

- [X] T001 Bootstrap the npm workspace and Next.js 16/React/TypeScript app in `package.json`, `package-lock.json`, `web/package.json`, and `web/src/app/layout.tsx`; pin compatible versions on Node 22.20+ and preserve existing Spec Kit files. Covers FR-001.

- [ ] T002 [P] Create the Python 3.11 FastAPI skeleton, locked dependencies and redacted environment examples in `ml/pyproject.toml`, `ml/uv.lock`, `ml/app/main.py`, and `ml/.env.example`; expose process liveness only until models load. After T001. Covers FR-006, FR-020.

- [ ] T003 [P] Pin the Supabase CLI, initialize local Auth/Postgres configuration and ignored secret templates in `supabase/config.toml` and `web/.env.example`; add local-only start/migrate wrappers in `scripts/supabase.mjs`. After T001. Covers FR-002.

- [ ] T004 Configure Vitest, Playwright, isolated Supabase DB test fixtures and pytest in `web/vitest.config.ts`, `web/playwright.config.ts`, `web/tests/support/fixtures.ts`, `supabase/tests/setup.sql`, and `ml/tests/conftest.py`; fake clock/RNG/model adapters must be test-only. After T002, T003. Covers FR-002, FR-008, FR-015, SC-002, SC-003.

- [ ] T005 Provide the exact setup/check scripts promised by quickstart in `package.json` and `scripts/validate.mjs`; include lint/typecheck/build, ML tests and isolated test DB lifecycle without resetting hosted data; delivery-worker entry configuration is deferred to T031. After T004. Covers FR-001.

- [ ] T006 [P] Define shared layout/typography CSS variables, readable text, reusable labeled controls and reduced-motion behavior in `web/src/app/globals.css`, `web/src/components/forms/Field.tsx`, and `web/src/components/progress/Progress.tsx` for responsive and accessible interaction. After T001. Covers FR-019.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 2: Foundational (Blocking Prerequisites)

**Goal**: Provide shared identity, ownership, idempotency and trusted activity accounting before feature work.

**Independent test**: Two isolated accounts cannot access each other; duplicate/concurrent session completion creates one credit and cannot overlap earning sessions.

**Blocking checkpoint**: No feature implementation begins until the foundation gate passes. Minimal auth/profile schema belongs here so US1–US5 do not depend on a later profile UI.

- [ ] T007 Write failing authorization/provisioning tests in `supabase/tests/schema_validation.sql` and `web/tests/integration/auth-boundary.test.ts`: two users, forged ownership, browser RPC access, zero initial `tokenBalance`, and signup without any locker/roll tables. After T005, T006. Covers FR-002, FR-012, FR-018.

- [ ] T008 Create profile/tokenBalance/task provisioning and owner FKs in `supabase/migrations/20261101234524_identity.sql`; provision the study and run/walk predefined families as study/run/walk kinds and a zero-balance record in `public."tokenBalance"`, without locker/compartment or roll-table dependencies; regenerate `web/src/server/supabase/database.types.ts`. Model constraint (Profile): “One per auth user; valid IANA timezone; ownership root”. Model constraint (TokenBalance): “One per user; balance >= 0; updates only by restricted transactional functions”. Model constraint (TaskDefinition): “kind study/run/walk/custom; predefined kinds seeded per account; one question maximum; custom minimum required and >= 1,800,000 ms (30 minutes)”. Locker provisioning is deferred to T026. After T007. Covers FR-002, FR-003, FR-018.

- [ ] T009 Implement Supabase browser/cookie-aware SSR clients, token refresh and fresh-user verification in `web/src/server/auth/session.ts`, `web/src/server/supabase/clients.ts`, and `web/src/proxy.ts`; isolate privileged keys in server-only modules and avoid authorizing from getSession alone. After T008. Covers FR-002.

- [ ] T010 Build working email/password signup/signin and protected route layout in `web/src/app/(auth)/sign-up/page.tsx`, `web/src/app/(auth)/sign-in/page.tsx`, and `web/src/app/(app)/layout.tsx`; configure local confirmation inbox and logout/session expiry. After T009. Covers FR-002.

- [ ] T011 Implement JSON error envelopes, validated schemas, same-origin/CSRF checks, redacted structured logs and reusable per-user limits in `web/src/server/api/http.ts`, `web/src/server/api/validation.ts`, and `web/src/server/api/limits.ts`; authenticate reads and mutations near data access. After T009. Covers FR-002, FR-020.

- [ ] T012 Write failing clock/reward/session concurrency tests in `web/tests/unit/activity-accounting.test.ts` and `web/tests/integration/session-accounting.test.ts`: reward arithmetic at 29:59/30:00/59:59/60:00 for eligible predefined activities, required custom minimum >=1,800,000 ms and below-target completion rejection, no cross-session carryover, repeated completion, paused intervals, stale revisions and simultaneous start. After T011. Covers FR-005, FR-008, FR-010, SC-002, SC-006.

- [ ] T013 Create shared activity intervals, immutable completions/ledger and idempotency storage in `supabase/migrations/20261101234526_activity.sql`; enforce ownership/unique references and one unfinished session with a DB constraint; regenerate database types. Model constraint (ActivitySession): “One unfinished earning session per user, including paused sessions; owner/task must match; state transitions versioned”. Model constraint (SessionInterval): “Unique sequence/session; no overlap within session; bounded server time; kind timer/study; canceled sessions excluded from summaries”. Model constraint (Completion): “One per session; immutable historical snapshot; required reflection nonblank; reward floor(eligible_ms/1,800,000)”. Model constraint (TokenEntry): “Immutable; current milestone has one unique completion reference, delta >= 0 and resulting_balance >= 0; add roll-linked debits only with deferred redemption”. Model constraint (IdempotencyRecord): “Unique user/operation/key; same key+payload returns original result; changed payload returns conflict”. After T012. Covers FR-005, FR-008, FR-010, SC-002.

- [ ] T014 Implement server-clock interval state transitions and whole-token arithmetic in `web/src/domain/time/session.ts` and `web/src/domain/rewards/earn.ts`; preserve manual timer state on refresh, reject backdated manual duration, and support study observations as a separate eligible-time source. After T013. Covers FR-005, FR-007, FR-008, SC-002, SC-006.

- [ ] T015 Implement restricted start/control/complete RPCs in `supabase/migrations/202611010003_activity_rpc.sql`; lock in user/wallet→session order, use revisions/key+request hash, validate required custom minimum >=1,800,000 ms and reflection against the captured session target; reject below-target completion without any completion/ledger/reward, persist one snapshot/ledger credit atomically, and revoke execution from PUBLIC/anon/authenticated. After T014. Covers FR-004, FR-005, FR-008, FR-010, SC-002.

- [ ] T016 Expose authenticated shared session start/current/controls/complete and wallet reads through `web/src/server/services/activity.ts`, `web/src/server/services/wallet.ts`, `web/src/app/api/v1/sessions/route.ts`, `web/src/app/api/v1/sessions/current/route.ts`, `web/src/app/api/v1/sessions/[id]/controls/route.ts`, `web/src/app/api/v1/sessions/[id]/complete/route.ts`, and `web/src/app/api/v1/wallet/route.ts`; retry only bounded transient DB conflicts. After T015. Covers FR-005, FR-008, FR-010, SC-002.

- [ ] T017 Implement protected five-destination responsive navigation with current-page indication and honest placeholder states in `web/src/components/navigation/AppNavigation.tsx` and `web/src/app/(app)/layout.tsx`; preserve functional auth controls. After T010, T006. Covers FR-001, FR-019.

- [ ] T018 Run and repair the foundation auth/RLS/session tests and record the local setup baseline in `specs/001-task-reward-locker/implementation-evidence.md`; ensure browser roles cannot directly mutate new protected tables and no public test grant/clock/RNG endpoints exist. After T016, T017. Covers FR-002, FR-008, SC-002.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 3: User Story 1 — Complete Custom Tasks and Earn Tokens (P1, MVP)

**Goal**: Create custom tasks and use measured timers to earn whole tokens.

**Independent test**: Create crochet with a required minimum of at least 30 minutes and an optional reflection; exercise pause/resume and 45/60-minute completion using test clocks; verify one saved completion/credit.

- [ ] T019 [P] [US1] Write failing custom-task API/browser tests in `web/tests/contract/custom-task.test.ts` and `web/tests/e2e/custom-timer.spec.ts` for required custom minimum >=30 minutes (inclusive), rejection of missing/null/disabled/below-30-minute minimums, exact-30-minute acceptance, completion blocked at 29:59 and allowed at 30:00 for a 30-minute target, one nonblank configured reflection, no manual duration, pause/refresh recovery and one completion receipt. After T018. Covers FR-003, FR-004, FR-005, SC-001, SC-002.

- [ ] T020 [US1] Implement owner-scoped task list/create/edit with immutable historical snapshots in `web/src/server/services/tasks.ts`, `web/src/app/api/v1/tasks/route.ts`, and `web/src/app/api/v1/tasks/[id]/route.ts`; user creation is custom type only and predefined family controls cannot be rewritten. After T019. Covers FR-003, FR-004.

- [ ] T021 [US1] Build Add Task name/required-minimum/one-optional-question UI with field validation in `web/src/features/tasks/CustomTaskForm.tsx`; require the minimum field with an inclusive lower bound of 30 minutes; validate blank/null/smaller input and prevent disabling or bypassing the minimum. After T020. Covers FR-004, FR-005, SC-001.

- [ ] T022 [US1] Build the timer/session client in `web/src/features/tasks/TaskTimer.tsx` and `web/src/features/tasks/useActivitySession.ts`; use serverTime/state for start/pause/resume/stop, display unsaved offline controls, and preserve one session across tabs/reloads. After T020. Covers FR-005, FR-008, SC-002.

- [ ] T023 [US1] Integrate predefined choices and custom tasks in `web/src/app/(app)/tasks/page.tsx` and completion/reflection receipt in `web/src/features/tasks/CompletionReceipt.tsx`; show awarded tokens/balance, allow minimum-not-met resume/cancel, never allow a below-minimum custom completion; zero-token short completions are only valid for eligible predefined study/run activities. After T021, T022. Covers FR-003, FR-004, FR-005, FR-010, SC-001, SC-002.

- [ ] T024 [US1] Run the independent custom-task slice and publish fixture-backed 45/60-minute and duplicate-completion evidence in `specs/001-task-reward-locker/implementation-evidence.md`; do not mark story done from a timer animation alone. After T023. Covers FR-003, FR-004, FR-005, FR-008, FR-010, SC-001, SC-002.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 4: User Story 2 — Roll to Unlock a Compartment (P1, deferred)

**Revised gate — 2026-11-09:** Virtual probability, spending, fixed results and hardware-pending entitlements are current scope. Physical unlock/provisioning/acknowledgement/simulator worker portions remain deferred. See current-scope overrides and T073–T082; do not mark a mixed physical task complete from virtual-only evidence.

**Goal**: Allocate tokens, persist one fixed roll, and deliver it once to a simulated drawer.

**Independent test**: Using seeded test balance and deterministic test randomness, prove win/loss, single debit, correct drawer, refresh recovery, lost acknowledgement and retry without reroll/payment.

- [ ] T025 [P] [US2] Write failing probability/idempotency/concurrent spend and simulator failure tests in `web/tests/unit/roll-policy.test.ts`, `web/tests/integration/roll-transaction.test.ts`, and `web/tests/integration/locker-delivery.test.ts`; use test fixtures rather than public force-win or grant-token controls. After T018. Covers FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, SC-003, SC-004, SC-005, SC-009, SC-010.

- [ ] T026 [US2] Create owner-linked locker/compartment tables and provision one four-slot locker for existing/new users when redemption is enabled; create quotes, immutable rolls, entitlements, durable events and processed receipts in `supabase/migrations/202611010004_roll_delivery.sql`; tie reservations/events to item revisions, extend the earning ledger with roll-linked debits, and regenerate database types. Model constraint (Locker): “One per user when redemption is enabled; exactly four compartment indexes”. Model constraint (Compartment): “Unique locker/slot; slot 1–4; state empty/locked/reserved/open/collected; user cannot allocate to empty/reserved/open/collected”. Model constraint (RollQuote): “Advisory, expires after 60 seconds; allocations integers >= 0, positive total, sufficient balance at acceptance”. Model constraint (Roll): “Immutable committed result; outcome loss/win; winning slot present iff win and funded; one debit per roll”. Model constraint (UnlockEntitlement): “One per winning roll; pending/acknowledged; tied to the exact reserved item revision”. Model constraint (DeliveryEvent): “One per roll, including losses; pending/inflight/retry/acknowledged; durable outbox”. Model constraint (SimulatorReceipt): “Unique event ID; repeated delivery returns original receipt without repeating effects”. After T025. Covers FR-012, FR-015, FR-016, FR-017, FR-018.

- [ ] T027 [US2] Implement pure curve/quantization/weighted-ticket math and secure server RNG boundaries in `web/src/domain/rolls/policy.ts` and `web/src/server/services/random.ts`; use roll-v1, 1,000,000 units, per-slot cap 1,000,000, total cap 4,000,000, and choose a funded drawer only after a win. After T026. Covers FR-013, FR-014, SC-009, SC-010.

- [ ] T028 [US2] Implement atomic restricted quote/acceptance RPCs in `supabase/migrations/202611010005_roll_rpc.sql`; validate owner/expiry/policy/drawer revisions/known-online/balance, debit once, reserve winner and store outcome/outbox under the same idempotency transaction with ordered locks. After T027. Covers FR-013, FR-014, FR-015, FR-016, FR-017, SC-003, SC-005, SC-009.

- [ ] T029 [US2] Implement owner-checked load/collect/simulator-setting and receipt application/acknowledgement RPCs in `supabase/migrations/202611010006_locker_rpc.sql`; enforce empty→locked→reserved→open→collected→locked and forbid unresolved reload or stale item revisions. After T028. Covers FR-012, FR-016, FR-017, FR-018, SC-004, SC-005.

- [ ] T030 [US2] Implement persistent simulator adapter and lease/retry coordinator in `web/src/server/delivery/simulator.ts`, `web/src/server/delivery/outbox.ts`, and `supabase/migrations/202611010007_delivery_leases.sql`; use 30-second leases, 1/2/4/8/30-second backoff, needs-attention after ten failures and original receipts for lost acknowledgement. After T029. Covers FR-016, FR-017, FR-018, SC-004, SC-005.

- [ ] T031 [US2] Implement restart-safe leased event processing in `web/src/worker/delivery.ts` and `web/package.json`; deliver all committed events including losses, recover expired leases, and never perform inference/network effects inside the roll transaction. After T030. Covers FR-016, FR-017, SC-004, SC-005.

- [ ] T032 [US2] Expose quote/roll/result/retry and locker/load/collect/settings contracts in `web/src/server/services/rolls.ts`, `web/src/server/services/locker.ts`, `web/src/app/api/v1/roll-quotes/route.ts`, `web/src/app/api/v1/rolls/route.ts`, `web/src/app/api/v1/rolls/[id]/route.ts`, `web/src/app/api/v1/rolls/[id]/retry-delivery/route.ts`, `web/src/app/api/v1/locker/route.ts`, `web/src/app/api/v1/locker/slots/[slot]/load/route.ts`, `web/src/app/api/v1/locker/slots/[slot]/collect/route.ts`, and `web/src/app/api/v1/simulator/settings/route.ts`. After T031. Covers FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018.

- [ ] T033 [US2] Build four-slot allocation, preview odds/cost, result and delivery-retry UI in `web/src/features/redeem/AllocationForm.tsx`, `web/src/features/redeem/RollResult.tsx`, and `web/src/app/(app)/redeem/page.tsx`; freeze accepted allocation, recover result on refresh and label simulator state clearly. After T032. Covers FR-012, FR-013, FR-014, FR-015, FR-017, FR-019, SC-003, SC-005.

- [ ] T034 [US2] Build item labeling/load/collect/reload and owner-only failure-mode controls in `web/src/features/redeem/LockerControls.tsx`; show empty/locked/reserved/open/collected and keep pending entitlement distinct from successful unlock. After T033. Covers FR-012, FR-016, FR-017, FR-018, SC-004, SC-005.

- [ ] T035 [US2] Exercise the custom-task→tokens→roll→unlock path and all offline/drop-ack/restart/stale-reload cases in `web/tests/e2e/redeem.spec.ts`; append reproducible evidence to `specs/001-task-reward-locker/implementation-evidence.md`. After T034, T024. Covers FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, SC-002, SC-003, SC-004, SC-005, SC-009, SC-010.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 5: User Story 3 — Earn Through Studbot (P2)

**Goal**: Classify calibrated study-compatible orientation using transient FastAPI inference and count only eligible time.

**Independent test**: Calibrate screen/book poses, read/write downward, turn away for five seconds, return for two seconds, test unknown input and manual pause, then finish once without saving frames.

- [ ] T036 [P] [US3] Write failing ML request/auth/size/privacy and orientation-fixture tests in `ml/tests/test_contract.py` and `ml/tests/test_orientation.py`, plus deterministic five-second grace/two-second resume tests in `web/tests/unit/study-accounting.test.ts`; include downward reading, unknown, multiple faces and late responses. After T018. Covers FR-006, FR-020, SC-006.

- [ ] T037 [US3] Create calibration/aggregate-observation tables and replay-safe observation/time-window RPCs in `supabase/migrations/202611010008_study.sql`; enforce active owner/session revision, sequence deduplication and bounded eligible windows; regenerate database types. Model constraint (FocusCalibration): “Stores aggregate calibration parameters, not frames or full landmarks; expires after 24 hours or camera-position/model change”. Model constraint (FocusObservation): “Unique sequence/session; state compatible/away/unknown; aggregate labels only; stale input cannot backfill study time”. After T036. Covers FR-006, FR-020, SC-006.

- [ ] T038 [US3] Implement pinned FaceLandmarker/PoseLandmarker asset manifest and checksum/license-verifying fetch command in `ml/app/models/manifest.json` and `ml/app/models/fetch.py`; document model runtime/package pins without collecting user study footage. After T037. Covers FR-006, FR-020.

- [ ] T039 [US3] Implement FastAPI lifespan-managed two-pipeline IMAGE-mode inference, private bearer auth, liveness/readiness and bounded worker execution in `ml/app/main.py`, `ml/app/auth.py`, and `ml/app/inference/runtime.py`; no wallet authority or privileged Supabase credential belongs here. After T038. Covers FR-006, FR-020.

- [ ] T040 [US3] Implement calibrated presence/orientation classification in `ml/app/inference/orientation.py`: five seconds/four usable samples per screen/book pose, median references, initial 25-degree yaw/pitch tolerances and 0.5 model thresholds; unknown for occluded/poor/ambiguous/multiple-person input, no phone/emotion/attention claims. After T039. Covers FR-006, SC-006.

- [ ] T041 [US3] Implement private classify/calibration-observation raw-JPEG endpoints in `ml/app/inference/routes.py`; enforce 256-KiB streamed/640×480 decoded limits, <=2-KiB versioned calibration header, finite angles, sequence ordering, one in-flight request/session and bounded global concurrency; discard buffers on every path and redact bodies. After T040. Covers FR-006, FR-020.

- [ ] T042 [US3] Implement pending-away grace and observation accounting in `web/src/domain/time/study.ts`: credit a permitted short glance only if compatible returns before five seconds, otherwise exclude the whole away interval; unknown/stale/hidden time and two-second reacquisition do not earn; manual pause never auto-resumes. After T041. Covers FR-005, FR-006, FR-008, SC-006.

- [ ] T043 [US3] Expose authenticated calibration start/frame and focus-frame proxy/service in `web/src/server/services/study.ts`, `web/src/app/api/v1/study/calibrations/route.ts`, `web/src/app/api/v1/study/calibrations/[id]/frames/route.ts`, and `web/src/app/api/v1/sessions/[id]/focus-frame/route.ts`; forward only trusted calibration headers and recheck revision before persisting delayed results. After T042. Covers FR-006, FR-020, SC-006.

- [ ] T044 [US3] Build permission/privacy explanation, camera calibration, one-FPS sampled upload and counted-time/state UI in `web/src/features/studbot/StudbotSession.tsx` and `web/src/features/studbot/Calibration.tsx`; stop capture on end/manual pause/hidden page, allow auto-pause reacquisition and never store recordings. After T043. Covers FR-006, FR-020, SC-006.

- [ ] T045 [US3] Run the balanced controlled model evaluation and live reading/writing/away/unknown scenarios in `ml/tests/evaluation/scenarios.json` and `specs/001-task-reward-locker/model-evaluation.md`; require >=90% compatible/away accuracy on the declared set and 100% unknown/stale exclusion in accounting tests, report limits and disable unavailable detection if criteria fail. After T044. Covers FR-006, FR-020, SC-006.

- [ ] T046 [US3] Complete study→one credit end-to-end checks, pause/refresh/permission/error recovery and no-frame-persistence inspection in `web/tests/e2e/studbot.spec.ts`; record model versions and evidence in `specs/001-task-reward-locker/implementation-evidence.md`. After T045. Covers FR-006, FR-008, FR-010, FR-020, SC-002, SC-006.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 6: User Story 4 — Track a Run or Walk (P2)

**Goal**: Show map, distance and a manually controlled timer; stationary time must not auto-pause.

**Independent test**: Follow a mocked then real route, stand still, pause/resume, lose GPS/map tiles, stop and verify distance segments, timer-based reward and one completion.

- [ ] T047 [P] [US4] Write failing distance/manual-timer contract tests in `web/tests/unit/route-distance.test.ts` and `web/tests/contract/tracking.test.ts`; stationary time must count, manual pause must exclude time/distance, and GPS/map failure must not create movement-based auto-pause. After T018. Covers FR-007, FR-008, FR-010, FR-020, SC-006.

- [ ] T048 [US4] Create private sequenced route points and distance aggregation/completion attachment in `supabase/migrations/202611010009_routes.sql`; revalidate owner/session state on late batches and regenerate database types. Model constraint (RoutePoint): “Owner via session; coordinate bounds; timestamps increasing; invalid fixes rejected; no points while manually paused”. After T047. Covers FR-007, FR-010, FR-020.

- [ ] T049 [US4] Implement segmented geodesic distance and fix validation in `web/src/domain/time/route.ts`: coordinate bounds, accuracy <=50 m, age/gap <=15 s, increasing timestamps and jump speed <=12 m/s; reject gaps/jumps without adding timer movement requirements. After T048. Covers FR-007, FR-008, SC-006.

- [ ] T050 [US4] Implement bounded sequenced GPS ingestion through `web/src/server/services/tracking.ts` and `web/src/app/api/v1/sessions/[id]/route/route.ts`; accept only running intervals, preserve route gaps and keep distance separate from server-clock rewards. After T049. Covers FR-007, FR-010, FR-020, SC-006.

- [ ] T051 [US4] Build run/walk selection, permission handling, manual start/pause/resume/stop, map/route/distance/timer UI in `web/src/features/tracking/RunWalkSession.tsx` and `web/src/features/tracking/RouteMap.tsx`; retain MapLibre/OpenFreeMap attribution and show tile/coverage failures independently. After T050. Covers FR-007, FR-019, FR-020, SC-006.

- [ ] T052 [US4] Verify mocked and real-device stationary/manual-pause/GPS-outage/refresh routes and saved summaries in `web/tests/e2e/run-walk.spec.ts` and `specs/001-task-reward-locker/implementation-evidence.md`; do not claim background location support. After T051. Covers FR-007, FR-008, FR-010, FR-020, SC-002, SC-006.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 7: User Story 5 — Set Goals and Review Progress (P2)

**Goal**: Create scheduled daily activity targets and show consistent dashboard/history progress.

**Independent test**: Study 35/60 minutes; verify matching-only activity, 20+20 minute goal progress without tokens, today/daily/weekday schedules, DST boundaries and history filters.

- [ ] T053 [P] [US5] Write failing schedule/date/history tests in `web/tests/unit/goal-calendar.test.ts` and `web/tests/integration/goals-history.test.ts`: today/daily/selected weekdays, empty weekday rejection, DST, future-only edits, canceled provisional time, and 20+20-minute progress without tokens. After T018. Covers FR-009, FR-010, FR-011, SC-007.

- [ ] T054 [US5] Create schedules and unique per-date occurrences in `supabase/migrations/20261101234528_goals.sql`; preserve historical target/timezone snapshots, enforce positive duration/nonempty weekdays and regenerate database types. Model constraint (GoalSchedule): “target > 0; repeat today/daily/weekdays; today requires one local date; weekdays requires nonempty unique values 1–7”. Model constraint (GoalOccurrence): “Unique schedule/date; derives from matching completed and current active session intervals on that date; no cross-date carryover”. After T053. Covers FR-009, SC-007.

- [ ] T055 [US5] Implement local-date/weekday expansion, clipped matching intervals and provisional progress in `web/src/domain/time/goals.ts`; no 24-hour DST arithmetic, cross-day carryover, past occurrence generation, duplicate intervals, aggregate weekly targets or bonus tokens. After T054. Covers FR-009, SC-007.

- [ ] T056 [US5] Expose owner-scoped goal list/create/update/delete and dashboard aggregation in `web/src/server/services/goals.ts`, `web/src/app/api/v1/goals/route.ts`, `web/src/app/api/v1/goals/[id]/route.ts`, and `web/src/app/api/v1/dashboard/route.ts`; use effective dates and keep existing schedule timezones unless edited. After T055. Covers FR-009, SC-007.

- [ ] T057 [P] [US5] Implement newest-first day-grouped completion snapshots and week/month/all-time 25-record cursor pagination in `web/src/server/services/history.ts` and `web/src/app/api/v1/history/route.ts`; include reflection/duration/reward and run route/distance when available. After T054. Covers FR-010, FR-011, SC-007.

- [ ] T058 [US5] Build named activity/duration and today-only/every-day/weekday schedule editor in `web/src/features/goals/GoalEditor.tsx` and individual progress cards in `web/src/features/goals/GoalProgress.tsx`; no full calendar page, notifications or separate weekly targets. After T056. Covers FR-009, FR-019, SC-007.

- [ ] T059 [US5] Build dashboard greeting/progress, per-goal minutes, completed tasks, token balance/earned-today and redeem shortcut in `web/src/app/(app)/dashboard/page.tsx`; show live account data with readable progress and labeled controls. After T058. Covers FR-001, FR-009, FR-019, SC-007.

- [ ] T060 [P] [US5] Build History period filters, summary, date-grouped completion rows/reflections/rewards and earlier-activity paging in `web/src/app/(app)/history/page.tsx` and `web/src/features/history/CompletionLog.tsx`; use readable completion rows and clear filter states. After T057. Covers FR-001, FR-010, FR-011, FR-019, SC-007.

- [ ] T061 [US5] Run schedule/dashboard/history reconciliation flows in `web/tests/e2e/goals-history.spec.ts`; record matching-task, date-boundary, earned-today, timezone and canceled-session evidence in `specs/001-task-reward-locker/implementation-evidence.md`. After T059, T060. Covers FR-009, FR-010, FR-011, SC-007.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 8: User Story 6 — Maintain a Personal Profile (P2)

**Goal**: Expose account/profile controls while retaining private per-user state.

**Independent test**: Sign in as two users, edit display name/timezone, revisit and verify persistence; cross-account profile/session/history/locker access is denied.

- [ ] T062 [P] [US6] Write failing profile persistence/owner isolation tests in `web/tests/contract/profile.test.ts` and `web/tests/e2e/profile.spec.ts`; cover display name, valid IANA timezone, session expiry/logout and another account's private resources. After T018. Covers FR-002.

- [ ] T063 [US6] Implement profile read/patch and timezone validation in `web/src/server/services/profile.ts` and `web/src/app/api/v1/profile/route.ts`; keep ownership immutable and apply timezone changes only to newly created schedules. After T062. Covers FR-002.

- [ ] T064 [US6] Build editable display name/timezone and account/logout controls in `web/src/app/(app)/profile/page.tsx` and `web/src/features/profile/ProfileForm.tsx`; show persisted server values and field/error states without exposing auth secrets. After T063. Covers FR-001, FR-002, FR-019.

- [ ] T065 [US6] Run profile persistence and cross-account checks against all available routes and direct Supabase APIs; record results in `specs/001-task-reward-locker/implementation-evidence.md`. After T064. Covers FR-002.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Phase 9: Polish and Cross-Cutting Validation

**Goal**: Prove required product, privacy, visual and recovery behavior with repeatable local evidence.

**Independent test**: Run the documented checks and capture real-device/model/UX results; do not claim completion from mocked tests alone.

- [ ] T066 [P] Audit every exposed table and privileged function with `supabase/tests/final_rls.test.sql` and `web/tests/integration/security-boundary.test.ts`; prove no browser writes to wallet/ledger/results/receipts, fresh auth on sensitive mutations, server-only secrets, CSRF rejection and deterministic-test adapters excluded from public runtime. After T024, T035, T046, T052, T061, T065. Covers FR-002, FR-008, FR-015, FR-020, SC-002, SC-003.

- [ ] T067 [P] Inspect camera success/error/timeout/cancel paths and logging/storage configuration in `ml/tests/test_privacy_paths.py` and `web/tests/integration/privacy.test.ts`; verify raw frames/landmarks/credentials never persist, route data stays private, and manual pause/end stops capture. After T024, T035, T046, T052, T061, T065. Covers FR-020.

- [ ] T068 [P] Validate responsive phone/desktop layouts, labels/contrast/keyboard/focus, reduced motion, permission/empty/loading/error states and accessible roll/pause announcements in `web/tests/e2e/accessibility.spec.ts` and `specs/001-task-reward-locker/ui-validation.md`. After T024, T035, T046, T052, T061, T065. Covers FR-001, FR-019, FR-020.

- [ ] T069 [P] Add a 10,000-completion isolated benchmark fixture and p95/inference/delivery measurement scripts in `web/tests/performance/local-benchmark.ts` and `ml/tests/evaluation/benchmark.py`; verify <1-second local list/roll p95, <=5-second normal delivery, and responsive bounded one-FPS inference. After T024, T035, T046, T052, T061, T065. Covers FR-009, FR-011, FR-016.

- [ ] T070 [P] Run the five-person first-use scenario and timed custom-task creation defined by SC-001/SC-008, collecting aggregate outcomes without camera recordings in `specs/001-task-reward-locker/usability-validation.md`; four of five must find balance, complete a task and explain displayed roll odds without help. After T024, T035, T046, T052, T061, T065. Covers FR-004, FR-014, FR-019, SC-001, SC-008.

- [ ] T071 Run the full quickstart lint/typecheck/domain/DB/pytest/E2E/build and real-device acceptance sequence; reconcile migration-generated `web/src/server/supabase/database.types.ts` and record commands/results/limitations in `specs/001-task-reward-locker/implementation-evidence.md`; never mark incomplete live-model/device checks as passed. After T066, T067, T068, T069, T070. Covers FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, SC-008, SC-009, SC-010.

- [ ] T072 Update executable setup instructions, dependency/model pins, browser/GPS limits and fixture/evaluation provenance in `README.md` and `specs/001-task-reward-locker/quickstart.md`; ensure actual scripts match the guide, keep real hardware deferred and update checked task states only from evidence. After T071. Covers FR-006, FR-007, FR-018, FR-020.


**Checkpoint**: Complete the phase's independent test and retain evidence before declaring this increment complete.

## Dependencies and Execution Order

```text
Setup → Auth/activity foundation → US1 (custom timers + earning)
                               ├→ US3 (Studbot)
                               ├→ US4 (run/walk)
                               ├→ US5 (daily goals/history)
                               └→ US6 (profile UI)
Foundation → virtual US2 (spending/fixed results now)
Hardware readiness → physical delivery/locker acknowledgement (deferred)
Current story gates → scoped validation; all story gates → full-product evidence
```

Virtual US2 is tested now after foundation using isolated balances; its effort-to-spend path also uses US1. Physical effort-to-unlock acceptance waits for hardware integration. Other stories use shared foundation services and isolated fixtures, not another story's unfinished UI. US5, US3, US4 and US6 proceed from their activity-foundation prerequisites without waiting for deferred US2; the numbered phase layout retains the spec's story order. Complete all story gates before final validation.

Within each phase: failing meaningful tests → storage/constraints → domain/service → endpoints → UI → evidence gate. Except for the explicitly scoped auth-first gate above, a task starts only after every listed `After T###` prerequisite. SQL migrations use increasing versions assigned when implemented; serialize migration/type generation across otherwise independent story work.

## Parallel Examples

These are optional scheduling opportunities, not instructions to spawn agents. Each example requires the common prerequisite barrier and separate files.


- **US1**: After T020, the form (T021) and timer (T022) use separate files; integrate them only in T023.

- **US2**: After T018, probability and delivery test files within T025 can be authored separately; SQL/worker/API steps remain ordered.

- **US3**: After T018, Python contract/orientation tests and TypeScript study-accounting tests within T036 are separate targets; model and trusted observation pipeline must integrate before UI validation.

- **US4**: After T018, route-distance and route-API test files within T047 are separate targets; GPS UI follows its server contract.

- **US5**: After T054, history service (T057) and goal calendar (T055) are separate targets; history UI (T060) does not edit dashboard UI.

- **US6**: After T018, profile contract and browser test files within T062 can be authored separately; profile API/UI remain sequential.


## Implementation Strategy

1. Establish the repeatable local stack and pass shared identity/accounting gates.
2. Deliver US1 first: create a custom task, measure time, finish once and inspect reward/receipt. This is the smallest useful MVP.
3. Add US5 daily scheduling/history, US3/US4 tracking and US6 profile enhancements from their stated prerequisites; validate current activity and earning scope.
4. Validate virtual US2 spending/fixed results now, including duplicate/concurrent spending; defer only physical delivery/acknowledgement recovery. Do not label deferred ML/hardware/research checks complete.
5. Commit logical verified increments. Keep runtime test/measurement evidence separate from this generated backlog. No public deployment, real hardware integration, phone detection, separate weekly targets or extra recurring schedule types are introduced.

## Requirement Coverage

Every FR and buildable SC has explicitly mapped work. The table is a planning coverage map, not proof that the work passes.

| Requirement | Task IDs |
| --- | --- |

| FR-001 | T001, T005, T017, T059, T060, T064, T068, T071 |

| FR-002 | T003, T004, T007, T008, T009, T010, T011, T018, T062, T063, T064, T065, T066, T071 |

| FR-003 | T008, T019, T020, T023, T024 |

| FR-004 | T015, T019, T020, T021, T023, T024, T070 |

| FR-005 | T012, T013, T014, T015, T016, T019, T021, T022, T023, T024, T042, T071 |

| FR-006 | T002, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T071, T072 |

| FR-007 | T014, T047, T048, T049, T050, T051, T052, T071, T072 |

| FR-008 | T004, T012, T013, T014, T015, T016, T018, T022, T024, T042, T046, T047, T049, T052, T066, T071 |

| FR-009 | T053, T054, T055, T056, T058, T059, T061, T069, T071 |

| FR-010 | T012, T013, T015, T016, T023, T024, T046, T047, T048, T050, T052, T053, T057, T060, T061, T071 |

| FR-011 | T053, T057, T060, T061, T069, T071 |

| FR-012 | T007, T008, T025, T026, T029, T032, T033, T034, T035, T071 |

| FR-013 | T025, T027, T028, T032, T033, T035, T071 |

| FR-014 | T025, T027, T028, T032, T033, T035, T070, T071 |

| FR-015 | T004, T025, T026, T028, T032, T033, T035, T066, T071 |

| FR-016 | T025, T026, T028, T029, T030, T031, T032, T034, T035, T069, T071 |

| FR-017 | T025, T026, T028, T029, T030, T031, T032, T033, T034, T035, T071 |

| FR-018 | T007, T008, T025, T026, T029, T030, T032, T034, T035, T071, T072 |

| FR-019 | T006, T017, T033, T051, T058, T059, T060, T064, T068, T070, T071 |

| FR-020 | T002, T011, T036, T037, T038, T039, T041, T043, T044, T045, T046, T047, T048, T050, T051, T052, T066, T067, T068, T071, T072 |

| SC-001 | T019, T021, T023, T024, T070, T071 |

| SC-002 | T004, T012, T013, T014, T015, T016, T018, T019, T022, T023, T024, T035, T046, T052, T066, T071 |

| SC-003 | T004, T025, T028, T033, T035, T066, T071 |

| SC-004 | T025, T029, T030, T031, T034, T035, T071 |

| SC-005 | T025, T028, T029, T030, T031, T033, T034, T035, T071 |

| SC-006 | T012, T014, T036, T037, T040, T042, T043, T044, T045, T046, T047, T049, T050, T051, T052, T071 |

| SC-007 | T053, T054, T055, T056, T057, T058, T059, T060, T061, T071 |

| SC-008 | T070, T071 |

| SC-009 | T025, T027, T028, T035, T071 |

| SC-010 | T025, T027, T035, T071 |


## Task Counts

| Phase/story | Tasks |
| --- | ---: |

| Setup (Shared Infrastructure) | 6 |

| Foundational (Blocking Prerequisites) | 12 |

| US1 | 6 |

| US2 | 11 |

| US3 | 11 |

| US4 | 6 |

| US5 | 9 |

| US6 | 4 |

| Polish and Cross-Cutting Validation | 7 |

| **Total** | **72** |

## Phase 10: User-Requested Non-ML Delivery — 2026-11-09

These scoped acceptance tasks complement the retained full-product backlog. They do not mark deferred ML/device/research work complete.

- [ ] T073 [US6] Deliver real Supabase signup/signin/confirmation/recovery/logout, refreshed verified sessions, protected pages/APIs and profile edits in `web/src/server/auth/`, `web/src/server/supabase/`, `web/src/proxy.ts`, auth routes and profile feature. Cover T009–T011/T017/T062–T065; prove two-account ownership and no preview bypass. Issue #10.
- [X] T074 [US1] Deliver persistent custom create/edit/archive/reuse/reflection UI and API with minimum >=30 minutes; replace task/Create previews and preserve predefined identities. Cover T019–T023. Issue #10.
- [X] T075 Deliver shared server-clock lifecycle and atomic restricted completion/ledger/wallet RPCs with ordered locks, idempotency/revisions, one unfinished session, paused exclusion and boundary/concurrency tests. Fresh SQL migration plus shared activity/domain/client code; cover T012–T018/T024. Issue #10.
- [X] T076 [US5] Deliver persisted schedules, captured-timezone/DST daily matching progress, dashboard, filtered/cursor history and profile calendar from the same records; cover T053–T061 and newest-first consistent totals. Issue #10.
- [X] T077 [US2] Deliver four virtual slots, secure quantized two-stage odds, atomic full-stake debit/fixed result/pending entitlement and result recovery. Implement zero/fraction/negative/overspend/replay/concurrent-spend rejection and deterministic isolated win/loss tests. No fake delivery; cover current portions of T025–T028/T032/T033/T035. Issue #10.
- [X] T078 [US4] Deliver private sequenced GPS storage/ingestion and validated segmented distance with running-interval ownership checks; cover T047–T050, duplicate/late batches and pauses/gaps. Issue #9.
- [X] T079 [US4] Deliver live run/walk controls/map/route/distance/pace/summary with shared session accounting, foreground permission handling and independent GPS/tile errors. Cover T051/T052; mocked-device evidence is separate from real-device acceptance. Issue #9.
- [ ] T080 Verify the combined non-ML domain/API/database/browser flows, auth/RLS/CSRF/bounded inputs, no unverified study credits and no public grant/clock/RNG controls; keep existing visual design usable at desktop/phone sizes. Cover current T066–T069/T071. Both issues.
- [ ] T081 Apply reviewed forward migrations to the intended database, regenerate schema types serially, verify migration source parity and record actual commands/results without secrets or hosted resets. Both issues.
- [X] T082 Update `README.md`, setup/environment guidance, API/contracts and `implementation-evidence.md`; reconcile only task boxes backed by evidence, document real-GPS/ML/hardware/usability limitations and verify optional extension hooks. Both issues.

### Current scoped evidence status

T074–T079 and T082 have source, domain/database or mocked-browser evidence in `implementation-evidence.md`. T073 remains unchecked because hosted account/email/recovery verification awaits configuration. T080 remains unchecked for the real-account combined gate despite the passing isolated automated suite. T081 remains unchecked because the intended hosted migration application/parity has not been performed. These unchecked gates do not imply the implementation uses preview data or client-authoritative tokens; they identify unperformed live acceptance. Original mixed full-product task boxes remain unchanged until their entire ML/device/research scope and prerequisites are satisfied.
