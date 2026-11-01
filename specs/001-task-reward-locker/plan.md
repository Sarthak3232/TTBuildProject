# Implementation Plan: Task Reward Locker

**Branch**: `task-reward-spec` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Status**: In progress — the user selected the stack and requested further specification questions. This is not an implementation-ready plan.

## Summary

Build a mobile-friendly React/Next.js web app with Supabase accounts/data and a FastAPI model service. Preserve the selected time-based rewards, two-stage rolls, and four simulated compartments. Studbot uses calibrated presence plus orientation, allowing reading/writing while looking down; sustained absence/looking away initially pauses after five seconds. Phone detection is deferred. After an automatic pause, resume after two consecutive seconds of valid study position while preserving counted time. Grace accounting remains to be documented. Do not equate mere face presence with attention without a recorded product choice and model validation.

Custom tasks use a built-in start/stop timer with pause/resume and an optional minimum-duration target. Rewards use measured active time; manually entered duration cannot grant tokens.

Daily goals link a specific activity/task to a duration target and show individual progress (for example Study: 35/60 minutes). Daily progress may accumulate across matching sessions independently of per-session token rounding. Goal schedules support today only, every day, and selected weekdays, with separate per-date occurrences in the profile timezone. Separate aggregate weekly targets are explicitly excluded by the user; recurrence schedules daily goals only.

Studbot camera frames are sampled and sent through the authenticated backend to FastAPI, processed transiently, and discarded without saving footage. Store aggregate observation/session results only. Finalize bounded input and inference contracts around this confirmed choice.

## Technical Context

**Language/Version**: TypeScript/Node for the web app; Python for FastAPI/ML. Use the installed Node 22.20+ runtime; Python/model package compatibility and exact pins must be established for the selected model pipeline.
**Primary Dependencies**: React, Next.js App Router, Supabase Auth/Postgres with @supabase/ssr, FastAPI, MediaPipe; map provider/renderer candidate documented in research.
**Storage**: Supabase PostgreSQL, authenticated per-user access, durable token ledger and roll delivery records.
**Testing**: Domain tests for time/probability; isolated Postgres authorization/concurrency tests; API/model contract tests; browser and real-device sensor checks.
**Target Platform**: Mobile-friendly foreground web application. A browser page cannot promise reliable screen-locked location/camera coverage.
**Project Type**: Full-stack Next.js web application plus FastAPI ML service and small durable-delivery worker.
**Performance Goals**: Keep pages responsive during model inference; final inference and API latency budgets follow the selected focus behavior and model benchmark.
**Constraints**: Four simulated drawers first; no double rewards/charges; private account data; raw study video not retained; no paid deployment assumed.
**Scale/Scope**: Local multi-account prototype, five main pages and authentication. Public deployment and real locks remain later work.

## Constitution Check

Constitution v1.0.1 is established. Final planning must demonstrate server-controlled accounting/outcomes, explicit sensor handling, account isolation, idempotent delivery, and verification of the chosen focus behavior. No exceptions proposed. Re-evaluate gates after the pending research and product clarification.

## Project Structure

### Documentation (this feature)

Existing: spec.md, clarification-review.md, research.md, plan.md, requirements checklist, and screenshots. Phase-one outputs still to produce after resolving the focus behavior: data-model.md, contracts/, and quickstart.md. Task breakdown follows as a separate workflow.

### Source Code (proposed, not generated)

```text
web/                 # Next.js React app, routes and trusted domain services
ml/                  # FastAPI, model assets and inference adapters
supabase/            # migrations, authorization policies and local config
workers/             # durable simulator delivery
shared/              # contracts/fixtures when shared across services
```

**Structure Decision**: Keep inference separate from trusted token/roll decisions. Prefer a small repository structure; finalize whether delivery runs from web/ or workers/ after backend research. No application files have been created.

## Pending Before Plan Completion

- Studbot presence/orientation behavior is selected. Automatic resume after two valid seconds is confirmed; resolve grace-window accounting and consequential task rules through the requested further questions.
- Supabase SSR/RLS and restricted transaction RPC decisions are researched; carry them into the final data model and API contract after remaining product answers.
- The user selected transient server-side image analysis with no saved footage; finalize the authenticated ML input contract and verify bounded in-memory handling and log redaction.
- Produce the data model, API/locker/ML contracts, and a realistic validation guide, then recheck constitution gates.

The earlier provisional Better Auth/Prisma and browser-only inference choices are superseded by the user's explicit stack. Do not implement from that earlier draft.
