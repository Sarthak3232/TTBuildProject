# Implementation Plan: Task Reward Locker

**Branch**: `task-reward-spec` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Status**: Design and task breakdown complete. The initial frontend shell is implemented; see [tasks.md](tasks.md) and [implementation evidence](implementation-evidence.md) for its limited scope. The core Supabase schema is applied to the hosted TTBuildProject project; application backend and feature implementation remain pending.

## Current milestone

The immediate assignment is [issue #5](https://github.com/Sarthak3232/TTBuildProject/issues/5): **Supabase schema setup only**. Create configuration, migrations, core tables, constraints/RLS, signup provisioning, generated schema types and SQL checks in the hosted TTBuildProject project (`yruyulqwyalxmtseaoml`). Local configuration supports optional reproduction only. Supabase clients, login pages, route protection, API services and runtime earning/progress logic are later application-integration work. The broader milestone below describes the subsequent product scope, not functionality delivered by the schema issue.

The user confirmed auth/profiles, tasks, activity/history, daily goals and **token earning** as the current delivery scope. Persist current balances in `tokenBalance`. Redeem/spending, locker/compartment provisioning, probability logic and delivery infrastructure wait until hardware readiness. The Redeem route stays a placeholder; none of its tables/services are prerequisites for signup or earning. Auth setup first creates profiles, zero balances and predefined task definitions; the activity tasks add measured earning afterward.

## Summary

Build a mobile-friendly React/Next.js application with Supabase Auth/Postgres and a private FastAPI MediaPipe service. Every custom task requires a selected minimum of at least 30 minutes (inclusive), with completion blocked until it is reached. Users earn whole tokens from timed custom activities, manually controlled runs/walks, and calibrated study-compatible camera observations. In the deferred redemption milestone, users allocate tokens among four drawers and roll with a total-stake win decision followed by weighted drawer selection. Dashboard goals are activity/time targets scheduled today only, daily, or on selected weekdays. Each local date has separate progress; no aggregate weekly targets.

The source-of-truth data is transactional: one completion credit, one roll debit/outcome, and an idempotent durable locker delivery. Study frames are analyzed transiently and discarded. Looking down to read/write is valid; the model does not prove cognitive attention or inspect screen content. See [research.md](research.md) for decisions, official sources, and explicit defaults.

## Technical Context

**Language/Version**: TypeScript with Node.js 22.20+; Python 3.11 for ML. Pin exact compatible package versions and model checksums during scaffold; use npm and uv lockfiles.

**Primary Dependencies**: React with Next.js 16 App Router; Supabase JS/SSR and pinned local Supabase CLI; FastAPI, Uvicorn, MediaPipe Tasks and bounded image decoding; MapLibre GL JS with configurable OpenFreeMap Liberty style. No ORM or separate hosted queue needed.

**Storage**: Supabase PostgreSQL with migrations, RLS, restricted transaction RPCs, immutable ledger/results, and, in the deferred redemption milestone, a durable outbox. Local Supabase runs with a Docker-compatible runtime. No object storage for camera footage.

**Confirmed table naming**: Store current user token balances in `public."tokenBalance"` (exact table name `tokenBalance`), as specified by the user. The logical record is TokenBalance; its fields are `user_id`, `balance`, and `version`.

**Testing**: Vitest domain/API tests; isolated local Postgres/RLS/concurrency tests; pytest/FastAPI TestClient model-contract tests; Playwright mocked sensor flows and manual real-device camera/GPS checks. Deterministic clock/RNG/model adapters exist only in tests.

**Target Platform**: Current mobile/desktop Chrome and Safari. Camera and GPS need localhost/HTTPS and foreground availability. No reliable screen-locked/background route promise; timer intervals can recover from server timestamps independently of route coverage.

**Project Type**: Next.js full-stack web app, private FastAPI inference process, with a lightweight Node delivery worker deferred alongside redemption.

**Performance Goals**: Local seeded dashboard/history/roll p95 under one second, excluding external model/map latency; one sampled study frame per second, bounded two-request inference concurrency, three-second timeout; normal simulator delivery within five seconds. Treat these as acceptance targets to measure, not current performance claims.

**Constraints**: Exactly four drawers and one unfinished earning session per user; account isolation; zero saved study footage; no manual reward-bearing duration entry; no movement-based run auto-pause; no paid local service accounts required. Public deployment, real hardware, phone detection and learned cognitive-attention classification are outside scope.

**Scale/Scope**: Local multi-account prototype with five main pages plus auth/calibration, two predefined activity families and custom tasks, schedules, histories, wallet, and persistent simulator recovery. Exercise 10,000 seeded completion records; no public production capacity promise.

## Constitution Check

| Principle | Before research | After design | Evidence |
| --- | --- | --- | --- |
| Traceable rules | Pass | Pass | User choices in spec; numeric/calibration/lifecycle defaults explicitly labeled |
| Consistent rewards/outcomes | Pass | Pass | Restricted atomic RPCs, ownership checks, locks, idempotency and immutable outcomes |
| Observation/privacy | Pass | Pass | Authenticated bounded inference, transient frames, aggregate results, private routes |
| Phased redemption | Pass | Pass | Earning is independent of hardware; redemption tables and adapters wait until hardware readiness |
| Accessible verification | Pass | Pass | Keyboard/labeled forms and status states; domain, RLS, concurrency, browser/device checks |

Constitution v3.0.0 applies. Its user-directed scope amendment removes the earlier simulator-first prerequisite while preserving secure earning now and recovery requirements for future redemption. Gates are design checks; implementation must still supply evidence. The user-authorized initial shell implements routing before T010 and the full foundation gate: it contains public placeholders only, with no accounts, private records, earning, rolling, sensors, or locker control. T017 stays unchecked until protected navigation is implemented. This scope adjustment does not relax the authorization or accounting requirements for future features.

## Project Structure

### Documentation (this feature)

```text
specs/001-task-reward-locker/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/{api,ml,locker}.md
├── checklists/requirements.md
└── clarification-review.md
```

`tasks.md` contains the 72-task backlog generated by `$speckit-tasks`.

### Source Code (target structure)

The starter provides the workspace, `web/src/app/layout.tsx`, five main pages, `/tasks/studbot`, `/tasks/runTracker`, and shared navigation/styles. The other modules in the target tree below remain planned.

```text
package.json                         # npm workspace and dev/validation scripts
web/
├── src/app/(auth)/{sign-in,sign-up}/
├── src/app/(app)/{dashboard,tasks,history,redeem,profile}/
├── src/app/api/v1/
├── src/components/{navigation,forms,progress,locker}/
├── src/features/{tasks,studbot,tracking,goals,history,redeem}/
├── src/domain/{time,rewards,rolls,locker}/
├── src/server/{auth,supabase,services,delivery}/
├── src/worker/delivery.ts
└── tests/{unit,contract,integration,e2e}/
ml/
├── pyproject.toml
├── uv.lock
├── app/{main,auth,inference,models}/
└── tests/
supabase/
├── config.toml
├── migrations/
├── seed.sql
└── tests/
```

**Structure Decision**: Next owns auth, trusted domain services and public APIs. FastAPI handles only model inference; a worker under web reuses the simulator adapter. Supabase migrations define transactions/access boundaries. Avoid another shared package until actual duplicated contracts justify it.

## Lifecycle and Model Decisions

- Every custom task has a required minimum >= 1,800,000 ms; enforce required/non-null/inclusive bounds in UI, API, database constraints and captured session snapshots. Exactly 30 minutes is accepted and 29:59 cannot complete a 30-minute task.
- Custom/run/walk timers are server-clock intervals with manual pause/resume; stationary time counts for runs. Keep GPS distance/coverage separate, segment on pause/gaps, and never invent missing fixes. Restoring a page recovers the same timer state; offline changes remain visibly unsaved until acknowledged.
- Studbot uses ML landmarks plus calibrated orientation rules, not a nonexistent pretrained attention classifier. Five-second screen/book calibration, two-second reacquisition, five-second pending-away grace and unknown-state exclusion are specified in the ML and data contracts.
- Keep one unfinished session per user to prevent simultaneous earning. Completion credits floor(milliseconds / 1,800,000); canceled sessions earn nothing. Distinct completed sessions may earn again from new time.
- Daily goals sum matching intervals per local date, separately from token rounding. Active progress is provisional; canceled activity is excluded. Schedule changes apply to future occurrences and preserve history.
- Generate secure roll random values only on the server, version/store the applied quantized curve, reject stale quotes without charge, and deliver each immutable outcome through a persistent event receipt.
- One own-locker simulator includes normal/offline/fail-before-apply/drop-ack modes. Collection/reload follows acknowledged unlock; new items receive new revisions.

## Delivery Sequence

1. Bootstrap workspace, Supabase auth/RLS/migrations, Next navigation/profile, accessible shared UI components and repeatable local setup.
2. Deliver custom timers, completion ledger, dashboard goals/schedules/history as a vertical slice.
3. Add FastAPI/MediaPipe calibration/classification and foreground run/walk maps with manual timer controls.
4. Validate the auth/activity/earning milestone, including privacy, concurrency, date boundaries and account isolation.
5. After hardware readiness, resume redemption: locker schema, quotes/rolls, delivery adapters and failure recovery. Revisit the retained simulator design against the hardware interface, then verify effort-to-unlock end to end.

This sequence describes full delivery. [tasks.md](tasks.md) tracks actual completion; [quickstart.md](quickstart.md) separates runnable starter commands from future full-system setup and acceptance evidence.
