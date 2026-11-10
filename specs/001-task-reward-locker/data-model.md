# Data model — Task Reward Locker

Design artifact, not an implemented database schema. All instants are UTC; calendar dates/weekday schedules use the captured IANA timezone. Durations are integer milliseconds and tokens are whole integers. User identity comes from Supabase Auth.

The TokenBalance record maps to the database table `public."tokenBalance"`, using the exact user-selected name `tokenBalance`. Quote the mixed-case identifier in SQL. It stores each user's current whole-token balance; TokenEntry records store the earning/spending history separately.

## Current and deferred schema

The current milestone covers accounts/profiles, `tokenBalance`, task definitions, activity sessions/intervals/completions, earning entries, daily goals and the study/route records needed by their features. Signup creates a profile, zero token balance and predefined tasks. Feature-specific activity/goal/model tables arrive with their respective tasks.

Locker, Compartment, RollQuote, Roll, UnlockEntitlement, DeliveryEvent and SimulatorReceipt are deferred until hardware readiness. Do not create or provision these during auth setup. Their rows below describe future design only.

TokenEntry initially references a unique completion, records a nonnegative credit (including zero), and has no roll column or foreign key. Add roll-linked debits only with the deferred redemption migration. Shared IdempotencyRecord protection for session controls/completion remains relevant now, so retries cannot credit a completion twice; roll operations are added later.

## Records and constraints

| Record | Important fields | Constraints and relationships |
| --- | --- | --- |
| Profile | user_id, display_name, timezone, created_at | One per auth user; valid IANA timezone; ownership root |
| TokenBalance (`tokenBalance` table) | user_id, balance, version | One per user; balance >= 0; updates only by restricted transactional functions |
| TaskDefinition | id, user_id, kind, name, description, minimum_ms (required for custom), reflection_question?, archived_at? | kind study/run/walk/custom; predefined kinds seeded per account; one question maximum; custom minimum required and >= 1,800,000 ms (30 minutes) |
| ActivitySession | id, user_id, task_id, task_snapshot, state, pause_reason?, started_at, active_since?, accumulated_ms, eligible_ms, revision, policy_version, calibration_id? | One unfinished earning session per user, including paused sessions; owner/task must match; state transitions versioned |
| SessionInterval | id, session_id, kind, start_at, end_at, eligibility, sequence | Unique sequence/session; no overlap within session; bounded server time; kind timer/study; canceled sessions excluded from summaries |
| FocusCalibration | id, user_id, screen_orientation, book_orientation, thresholds, model_version, expires_at | Stores aggregate calibration parameters, not frames or full landmarks; expires after 24 hours or camera-position/model change |
| FocusObservation | session_id, sequence, received_at, state, reason, model_version, rule_version | Unique sequence/session; state compatible/away/unknown; aggregate labels only; stale input cannot backfill study time |
| RoutePoint | session_id, sequence, segment_id, captured_at, received_at, lat, lng, accuracy_m | Owner via session; coordinate bounds; timestamps increasing; invalid fixes rejected; no points while manually paused |
| Completion | id, user_id, session_id, task_snapshot, description/reflection, completed_at, timezone, eligible_ms, distance_m?, token_award | One per session; immutable historical snapshot; required reflection nonblank; reward floor(eligible_ms/1,800,000) |
| TokenEntry | id, user_id, delta, resulting_balance, completion_id, created_at; roll_id deferred | Immutable; current milestone has one unique completion reference, delta >= 0 and resulting_balance >= 0; add roll-linked debits only with deferred redemption |
| GoalSchedule | id, user_id, task_id, target_ms, repeat_kind, date_once?, weekdays?, timezone, effective_from, archived_at? | target > 0; repeat today/daily/weekdays; today requires one local date; weekdays requires nonempty unique values 1–7 |
| GoalOccurrence | schedule_id, local_date, target_snapshot, progress_ms, completed_at?, timezone | Unique schedule/date; derives from matching completed and current active session intervals on that date; no cross-date carryover |
| Locker | id, user_id, mode, simulator_state, revision | One per user when redemption is enabled; exactly four compartment indexes |
| Compartment | id, locker_id, slot, item_label?, state, item_revision, reserved_roll_id? | Unique locker/slot; slot 1–4; state empty/locked/reserved/open/collected; user cannot allocate to empty/reserved/open/collected |
| RollQuote | id, user_id, allocations, drawer_revisions, total, policy_version, win_units, expires_at | Advisory, expires after 60 seconds; allocations integers >= 0, positive total, sufficient balance at acceptance |
| Roll | id, user_id, quote_id, total, allocations_snapshot, win_units, policy_version, outcome, winning_slot?, created_at | Immutable committed result; outcome loss/win; winning slot present iff win and funded; one debit per roll |
| UnlockEntitlement | roll_id, compartment_id, item_revision, state | One per winning roll; pending/acknowledged; tied to the exact reserved item revision |
| DeliveryEvent | id, roll_id, payload_version, payload, state, attempts, next_attempt_at, lease_until?, last_error? | One per roll, including losses; pending/inflight/retry/acknowledged; durable outbox |
| SimulatorReceipt | event_id, applied_at, result, compartment_revision? | Unique event ID; repeated delivery returns original receipt without repeating effects |
| IdempotencyRecord | user_id, operation, key, request_hash, resource_id, response_snapshot | Unique user/operation/key; same key+payload returns original result; changed payload returns conflict |

Use database foreign keys and checks for ownership-consistent references, nonnegative balances/durations, valid slot indexes, and immutable snapshots. Enforce one unfinished session with a partial unique index or user activity-slot row, not an application-only read-before-write check.

## Session states

`created → running ↔ paused → completed | cancelled`.

- Start, pause, resume, finish, and cancel require the session revision plus idempotency key. Completed/cancelled sessions cannot resume.
- Custom/run/walk clocks are server-timestamped intervals controlled by manual buttons. Stationary/GPS loss does not pause a run clock. Refresh returns the persisted state; elapsed running timer time can be recovered from the server clock even while the browser was hidden. GPS gaps stay gaps; no background route promise.
- Offline control changes are not silently accepted: show unsaved/offline state, retry using the same key, and apply the action when the server acknowledges it. Do not accept user-entered backdated duration.
- Studbot requires fresh authenticated inference observations. Hidden page, unavailable camera, unknown classification, or inference older than three seconds stops study credit immediately. Auto-paused study reacquires after two consecutive valid seconds. Manual pause needs manual Resume and stops capture.
- Planning default for the five-second away grace: hold candidate-away time pending. If compatible behavior returns before five seconds, treat the short glance as allowed; if away reaches five seconds, discard the whole away interval and auto-pause. Completing during unresolved away time excludes it. Reacquisition time itself is not retroactively credited.
- Time is preserved across automatic pauses and refresh; unobserved study gaps are not credited. One unfinished session excludes simultaneous earning from another tab/type.
- Completion atomically locks session/wallet, validates minimum and reflection, closes intervals, creates the snapshot and ledger entry, credits whole tokens, and releases the active-session slot. A custom-task user below the required selected minimum can resume or cancel, not complete. The database must reject a custom definition or captured custom-session minimum that is missing, null, or below 1,800,000 ms; predefined activities may use a nullable minimum. Cancellation creates no completion/reward and removes provisional goal progress.

## Daily goal behavior

Progress sums matching qualifying intervals clipped to the occurrence's local day. It may span multiple sessions; token rounding remains per completed session. Active-session progress is provisional until completion; canceled activity is excluded. Do not double-count overlapping intervals or duplicate observations.

Today-only schedules use creation's local date. Daily/weekday schedules take effect from their creation date, without generating past goals. Editing/deleting a recurring schedule defaults to future occurrences; preserve past occurrence snapshots. Changing the profile timezone affects new schedules; existing schedules keep their timezone until explicitly edited. Handle DST with local date boundaries, not fixed 24-hour arithmetic. No separate weekly targets, notifications, or full calendar page are included.

## Transactions and access boundary

The auth/activity milestone enforces only the tables and operations implemented for that milestone. Roll/locker transaction and worker behavior below is deferred design and must not create dependencies for signup or activity credits.

Enable RLS on every exposed user table. Users may read their own data; use explicit policies for harmless profile/task/goal edits. Revoke browser-role writes to sessions, observations, completions, ledger/wallet, rolls, quotes, deliveries, and simulator receipts; route those through authenticated Next services and restricted RPC functions. Privileged RPC execution is revoked from PUBLIC/anon/authenticated and granted only to the trusted server role. Because that role bypasses RLS, each function checks every relevant row's owner against the server-verified user ID.

Use short transactions with fixed lock order: user/wallet, active session if involved, locker, compartments in slot order. Roll acceptance checks idempotency, quote expiry/policy, current drawer revisions, simulator known-online status, and balance before debiting and persisting the fixed result/outbox. No inference/network delivery inside database transactions. Bound retry on serialization/deadlock conflicts to three attempts with jitter; exhausted retries return a retryable error without partial writes.

The worker leases outbox events and retries with backoff. Simulator receipt creation and state change are atomic. Acknowledge loss after an applied unlock is safe: retry returns the original receipt. A drawer remains reserved/open until entitlement acknowledgement, collection, and explicit item reload/relock; stale events cannot unlock a new item revision. Changing simulator connectivity does not alter a committed roll or spend.
