# Feature Specification: Task Reward Locker

**Feature Branch**: `task-reward-spec`; feature discovery uses `.specify/feature.json`.
**Repository**: https://github.com/Sarthak3232/TTBuildProject
**Created**: 2026-11-01
**Status**: Implementation started with a basic frontend route shell; the full feature backlog remains pending. User decisions and implementation defaults are recorded in this specification and its linked plan/contracts.
**Input**: A task and goal app connected to a physical four-compartment locker. Users earn tokens through focused study, runs/walks, and custom tasks, then allocate tokens among locked items and roll for a chance to unlock them. Includes dashboard, tasks, history, redeem, and profiles.

## Clarifications

### Current delivery scope — 2026-11-01

The user deferred redemption, spending, locker/drawer databases, roll probabilities and unlock delivery until the hardware is ready. Accounts, profiles, task/activity records, history, daily goals and earning tokens remain in the current plan. The current balance table is named `tokenBalance`, with one whole token per full 30 qualifying minutes in a completed session. This supersedes the earlier simulator-first delivery order; the redemption scenarios and requirements below are retained as deferred design, not prerequisites for auth or activity earning. The Redeem route remains a placeholder until that later milestone.

### Session 2026-11-01

- Q: How should tasks earn tokens? → A: Time-based tokens, using one token per 30 minutes as the starting rate. Per-session rounding was resolved in the follow-up below; unmeasured tasks do not earn time-based tokens.
- Q: How many items can one roll unlock, and how is the result chosen? → A: At most one drawer per roll. First determine whether anything is won; if so, select one of the four drawers using the token allocations. One token uses the baseline win chance; adding tokens increases the overall win chance and the chance of receiving the drawer receiving those tokens. The percentage anchors are resolved in the final clarification below.
- Q: What is the initial hardware scope? → A: Originally simulate all four compartments first. Superseded by the current delivery scope: redemption and locker database work wait until hardware readiness; earning tokens remains in scope.
- Q: Should leftover minutes carry over between completed tasks? → A: No. Calculate whole tokens separately for each completed session and discard its leftover minutes.
- Q: What should the overall win probability be? → A: One token gives 20%; ten or more tokens should be around 60%; more tokens should improve the probability, and it should never be zero. The selected interpolation below approaches 60% with diminishing increases, giving approximately 58% at ten tokens.

- Q: Should the first version be a website or a phone app? → A: Web app using React/Next.js, Supabase, and FastAPI for ML models. Continue asking product-specification questions. This explicit stack replaces the provisional self-hosted-auth/Prisma planning choice.

- Q: What should Studbot recognize as qualifying study behavior? → A: Presence plus orientation toward the screen or study materials, allowing reading and writing while looking down. Use a short calibration for normal screen/book positions and tolerate brief glances, with an initial roughly five-second sustained-away pause threshold. Treat poor camera visibility as unable to verify rather than distraction. Phone detection is deferred; camera posture cannot prove cognitive attention or distinguish productive screen content from entertainment.

- Q: How should Studbot resume after an automatic pause? → A: Resume automatically after two consecutive seconds in a valid calibrated study position, preserving previously counted study time.

- Q: How should custom tasks record time for earning tokens? → A: Use a built-in start/stop timer while doing the task. Every custom task requires a minimum duration of at least 30 minutes; exactly 30 minutes is allowed, and the timer measures qualifying time toward that required minimum. Do not award tokens from manually entered duration.

- Q: What do daily goals mean? → A: Specific activities with individual duration targets, such as study for one hour, walk for thirty minutes, or crochet for forty-five minutes. Show each goal and its own tracked progress (for example Study: 35/60 minutes), and mark it complete when its target is reached. The earlier aggregate task-count/time-goal choices were not selected.

- Q: How should daily goals repeat? → A: Use calendar-style scheduling with today only, every day, or selected weekdays (for example Monday/Wednesday/Friday). Each scheduled date has its own progress and completion.

- Q: Should there be separate aggregate weekly targets? → A: No. Use scheduled daily activity goals only, with today-only, every-day, or selected-weekday recurrence.

- Q: Where should Studbot camera images be processed? → A: Send occasional sampled frames to FastAPI for live analysis, then discard them without saving footage. This selects server-side image inference rather than device-only image processing.

- Q: Should runs/walks automatically pause when stationary? → A: No. Use manual start, pause/resume, and stop controls with map, distance, and timer visible. The timer continues while stationary unless the user pauses or ends it; reward time follows that running timer, not detected movement.

- Q: Is the minimum duration optional for custom tasks? → A: No. Every custom task always requires a minimum of 30 minutes or more, inclusive. A shorter, missing, null, or disabled minimum is invalid, and completion is blocked until the selected minimum is reached. This corrects the earlier documentation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete custom tasks and earn tokens (Priority: P1)

A user creates a named task with a required minimum-duration target of at least 30 minutes and one optional reflection question, uses its built-in start/stop timer, completes the task, and earns tokens from measured active time.

**Why this priority**: Establishes the effort-to-reward loop without camera or location dependencies.
**Independent Test**: Create and complete a crochet task, then verify its history record and one reward credit under the selected policy.

**Acceptance Scenarios**:

1. **Given** Tasks, **When** the user selects Add task, **Then** they must enter a name and a minimum-duration target of at least 30 minutes, and may add one optional completion question such as “What did you make?”.
2. **Given** a timed task, **When** counted time is below its configured minimum, **Then** completion and rewards remain unavailable.
3. **Given** satisfied timing and a nonblank answer to the configured question, **When** completion is confirmed, **Then** one completion and its token credit are saved, including after repeated submissions.
4. **Given** custom-task creation or editing, **When** the minimum is missing, null, or below 30 minutes, **Then** validation rejects it. Exactly 30 minutes is accepted.
5. **Given** a custom task with a 30-minute minimum, **When** counted active time is 29 minutes 59 seconds, **Then** completion is blocked with no completion record or token credit; at 30 minutes it can complete and earns one token.
6. **Given** a completed eligible 45-minute session, **When** rewards are calculated, **Then** it earns one token and the extra 15 minutes are discarded. A separate completed 15-minute predefined study/run activity earns zero tokens; a custom task cannot complete below its required minimum.
7. **Given** a completed eligible 60-minute session, **When** rewards are calculated, **Then** it earns two tokens. The required custom-task minimum must also be met.
8. **Given** a custom task, **When** the user views its controls, **Then** they can start, pause/resume, and stop its timer, but cannot enter or edit duration to award tokens. Paused intervals do not count.

### User Story 2 - Roll to unlock a compartment (Priority: P1)

A user allocates tokens among items in four simulated compartments, reviews the total cost and chances, then rolls to unlock at most one compartment. These represent the later physical locker.

**Delivery status**: Deferred until hardware readiness. The recorded P1 label reflects the original full-product priority, not the current execution order. Auth, tracking and token earning do not wait for this story.
**Independent Test**: With a controlled balance and simulated locker, make an allocation and force known winning/losing outcomes; verify spending, recorded results, and exactly zero or one matching simulated unlock.

**Acceptance Scenarios**:

1. **Given** four slots, **When** Redeem opens, **Then** each shows its item and availability or indicates that it is empty.
2. **Given** sufficient tokens and other allocations held fixed, **When** more tokens are added to a drawer, **Then** total cost and the overall win chance increase, and that drawer receives more selection weight. With only one funded drawer its conditional selection chance is already 100%.
3. **Given** negative/fractional tokens, zero total allocation, unavailable items, or spending above balance, **When** rolling is attempted, **Then** it is blocked with an explanation.
4. **Given** a valid roll, **When** the outcome is determined, **Then** one charge and one recoverable result are recorded, and at most one winning compartment is authorized to unlock.
5. **Given** no win, **When** the result appears, **Then** spent tokens remain deducted and no compartment unlock is requested.
6. **Given** a win without locker acknowledgement, **When** the result is viewed, **Then** delivery shows pending/failed and the winning entitlement survives for retry without another charge or reroll.
7. **Given** a one-token allocation, **When** a roll is accepted, **Then** stage one uses a 20% win chance and a stage-two win selects the funded drawer.
8. **Given** allocations totaling the same number of tokens, **When** those tokens are redistributed among available drawers, **Then** the overall win chance stays the same and drawer selection weights change.
9. **Given** a losing stage-one result, **When** the roll finishes, **Then** no stage-two drawer is selected.
10. **Given** ten allocated tokens, **When** the chance is shown, **Then** it is approximately 58.0%; twenty tokens show approximately 59.9%. Redistribution of the same total must not change this probability.

### User Story 3 - Earn through Studbot (Priority: P2)

A user starts a study timer that counts qualifying focus time using camera-observed presence and focus classification.

**Why this priority**: Adds an observed predefined activity.
**Independent Test**: Alternate qualifying and non-qualifying observations and verify that only qualifying intervals count.

**Acceptance Scenarios**:

1. **Given** camera permission, **When** Studbot starts, **Then** the user sees counted time and the current focus classification.
2. **Given** a calibrated session, **When** the user reads or writes facing their book/notebook area, **Then** looking down alone does not classify them as away.
3. **Given** a running session, **When** the user is absent or faces away continuously for five seconds, **Then** the session auto-pauses with a visible reason; brief glances do not reset the session.
4. **Given** unavailable or unverifiable camera observations, **When** the session is viewed, **Then** show unable to verify and exclude that interval from qualifying time.
5. **Given** the qualifying duration is met, **When** the user completes the session, **Then** one completion and applicable token credit are recorded.
6. **Given** an automatically paused session with saved qualifying time, **When** a valid calibrated study position is detected continuously for two seconds, **Then** it resumes automatically with the saved time intact.
7. **Given** reacquisition lasting less than two seconds, **When** an invalid or unknown observation appears, **Then** the session stays auto-paused and the reacquisition interval restarts.
8. **Given** the user starts Studbot, **When** camera sampling begins, **Then** the app explains that sampled frames are analyzed by the backend and discarded; after processing, only aggregate classification/session results persist.
9. **Given** an ended or manually paused session, **When** the camera pipeline is inspected, **Then** no frames are being captured or transmitted. An automatic observation pause may sample fresh frames to support the selected automatic resume behavior.

### User Story 4 - Track a run or walk (Priority: P2)

A user tracks a run or walk with a map, distance, active time, and start/pause/resume/stop controls, then saves the activity.

**Why this priority**: Provides the second predefined task and an outdoor activity option.
**Independent Test**: Track a known route, pause/resume, and stop; verify saved route, distance, active time, and applicable reward.

**Acceptance Scenarios**:

1. **Given** location permission, **When** a run/walk starts, **Then** route, map, distance, active elapsed time, and controls are visible.
2. **Given** a paused session, **When** time passes or movement occurs, **Then** paused time and movement do not count toward qualifying totals.
3. **Given** location becomes unavailable, **When** tracking continues, **Then** missing coverage is shown and unavailable movement is not invented.
4. **Given** a finished qualifying activity, **When** it is saved, **Then** one completion, activity summary, and token credit are recorded.
5. **Given** a running activity, **When** the user stands still without pressing Pause, **Then** the timer continues and that running time counts toward tokens, without fabricating distance.
6. **Given** a manually paused activity, **When** movement resumes, **Then** it remains paused until the user presses Resume.

### User Story 5 - Set goals and review progress (Priority: P2)

A user sets specific daily activity goals with duration targets, sees each goal's progress and today's completed tasks on Dashboard, and reviews all completed tasks on History. Separate aggregate weekly targets are outside scope; recurring daily goals cover the requested scheduling.

**Why this priority**: Makes progress and rewards understandable over time.
**Independent Test**: Record activities across date boundaries and compare goals, dashboard, history, and earned totals.

**Acceptance Scenarios**:

1. **Given** Dashboard, **When** the user sets daily goals such as Study for 60 minutes and Walk for 30 minutes, **Then** each has its own activity label, duration target, progress display, and schedule selector for today only, every day, or selected weekdays.
2. **Given** a daily Study goal of 60 minutes and 35 qualifying study minutes today, **When** Dashboard is viewed, **Then** that goal shows 35/60 minutes and remains incomplete. At 60 minutes it is marked complete; walking does not advance the Study goal.
3. **Given** two completed 20-minute study sessions on the same day, **When** daily goal progress and tokens are calculated, **Then** the Study goal receives 40 minutes of progress while those sessions earn zero tokens under the independent per-session reward rule.
4. **Given** today's activity, **When** Dashboard opens, **Then** current tokens, tokens earned today, and today's completed tasks are shown.
5. **Given** saved completions, **When** History opens, **Then** task names, descriptions/reflections, dates/times, and rewards appear newest first, grouped by day.
6. **Given** History, **When** this-week, this-month, or all-time is selected, **Then** entries and summary totals match that period.
7. **Given** a today-only goal, **When** tomorrow is viewed, **Then** it does not appear as a newly scheduled goal; today's saved progress remains available.
8. **Given** a goal scheduled every day, **When** a new local date begins, **Then** its new daily occurrence starts with separate progress and the previous occurrence is preserved.
9. **Given** a goal scheduled Monday/Wednesday/Friday, **When** a date is viewed, **Then** the goal is due only on those weekdays; an empty selected-weekday set is rejected.

### User Story 6 - Maintain a personal profile (Priority: P2)

A user signs in to their own profile, tasks, goals, history, balance, and associated locker.

**Why this priority**: Connects progress and physical rewards to the correct person.
**Independent Test**: Use two accounts and verify that each sees and controls only its own private data and authorized locker.

**Acceptance Scenarios**:

1. **Given** a profile, **When** the display name is edited, **Then** the change persists on a later visit.
2. **Given** another user's private activity or locker, **When** access/control is attempted without authorization, **Then** access is denied.

### Edge Cases

- Repeated completion, roll, or unlock requests must not duplicate credits, charges, outcomes, or locker unlock operations.
- Concurrent spending cannot produce a negative balance; refresh after a roll recovers the existing outcome.
- A simulated offline locker blocks new rolls. Disconnect after acceptance preserves the result and any pending entitlement.
- Empty, unlocked, or pending-unlock compartments cannot receive allocations. If availability changes before acceptance, reject without charging.
- Unused minutes are discarded per completed session: separate completed 20-minute and 10-minute predefined study/run sessions earn zero tokens, while one eligible 30-minute session earns one.
- Camera/location denial leaves other task types usable. Canceled or ineligible sessions earn no tokens.
- Profile timezone governs dates and selected-weekday recurrence; weeks begin Monday by default. A daily goal occurrence uses a local calendar date rather than a fixed 24-hour interval, including daylight-saving transitions. Repeated page loads must not duplicate scheduled goals or rewards.
- Win chance is positive for every valid allocation and bounded above by 60%; an unfunded drawer still has zero selection chance. Higher token counts may look equal after display rounding or finite random-sampling precision; the roll uses the stored applied policy threshold, not a percentage rounded for display.
- Camera classification estimates observable focus; it cannot establish learning or understanding.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide Dashboard, Tasks, History, Redeem, and Profile with consistent navigation and a visible current destination.
- **FR-002**: Provide user accounts, editable display names, private progress, and authorization for locker control.
- **FR-003**: Include Studbot and run/walk as the two predefined task types; allow additional custom tasks.
- **FR-004**: Custom tasks must require a name and a minimum-duration target of at least 30 minutes (>= 1,800,000 milliseconds). Exactly 30 minutes is valid. The minimum cannot be missing, null, disabled, or set below 30 minutes. They may include at most one optional completion question. A configured question requires a nonblank answer to complete.
- **FR-005**: Every custom task must offer a built-in start/stop timer with pause/resume and enforce its required minimum of at least 30 minutes. Exclude paused intervals and do not permit manual duration entry to award tokens. Block completion and token credit until the selected minimum has been reached; a user who stops early can resume or cancel. Count qualifying Studbot time using its selected classification rules.
- **FR-006**: Studbot must classify observable study-compatible behavior using presence plus orientation toward the calibrated screen or book/notebook area. Reading and writing while looking down are valid. Provide a short calibration for both positions, tolerate brief glances, and use an initial five-second sustained-away threshold before auto-pause. Camera failure, poor lighting, or blocked view must produce an unable-to-verify state rather than a distraction judgment; unverifiable intervals do not earn qualifying time. Show the state and counted time. Phone detection is outside the first version. Validate representative reading, writing, screen-facing, absent, and sustained-away cases before implementation; the classifier must not claim cognitive attention or knowledge of screen content. After an automatic pause, resume automatically only after two consecutive seconds in a valid calibrated study position, preserving all previously counted qualifying time. Invalid or unknown observations reset the two-second reacquisition interval. Exact grace-window accounting is specified in the planning defaults and data model.
- **FR-007**: Run/walk tracking must show a map/route, distance, running timer, manual start, pause/resume, stop, and a saved summary. Do not auto-pause based on movement or stationary detection. While the manual timer is running, stationary time counts toward timer-based tokens until the user pauses or stops. Paused time and paused movement do not count. GPS loss must show a route-coverage gap without inventing distance or automatically treating stationary/missing distance as a user pause; server-clock timer measurements remain separate from valid location coverage.
- **FR-008**: Rewards must depend on qualifying active time across custom tasks, Studbot, and runs/walks, using one whole token per 30 minutes as the starting rate. For run/walk sessions, qualifying time is the measured running timer excluding manual pauses; movement is not an eligibility condition. Credit accepted activity once and preserve earning/spending history. Calculate each completed session separately: tokens = floor(qualifying seconds / 1800). Discard the remainder; do not carry it into other sessions. Custom-task rewards must use the built-in timer's measured active time and are awarded only after the task reaches its required minimum of at least 30 minutes. Manually reported duration cannot earn tokens. Default policy: separate repeated sessions can earn through new non-overlapping qualifying time. One unfinished earning session per user prevents overlaps; this is a documented default rather than an extra user answer.
- **FR-009**: Daily goals must name a specific activity or custom task and a positive duration target. Show each goal's individual tracked qualifying-time progress, such as Study: 35/60 minutes, and mark it complete when the target is reached. Only matching activity contributes. Goal progress can accumulate across sessions within the day; this does not change per-session token rounding. Goal creation must support calendar-style schedule choices: today only, every day, or one or more selected weekdays. Use the profile timezone to decide scheduled dates, and keep progress/completion separate per date without carrying it into the next occurrence. Scheduling itself does not award tokens. Dashboard must also show today's completed tasks, balance, and tokens earned today. Do not provide separate aggregate weekly targets; do not retain the earlier unconfirmed completion-count-goal assumption.
- **FR-010**: Preserve completion-time task name, type, description/reflection, applicable duration, date/time, and reward; retain route/distance for runs/walks.
- **FR-011**: History must show completed tasks newest first by day with this-week, this-month, and all-time filters and matching totals.
- **FR-012**: Represent exactly four simulated compartments with assigned items and confirmed or unknown availability, corresponding to the later physical slots.
- **FR-013**: Accept whole-token per-item allocations only, with total cost from one token up to the available balance.
- **FR-014**: Use two random stages. First determine win/no-win from the total tokens allocated; one token uses a baseline win chance and additional total tokens increase that chance. Only after a win, choose exactly one funded drawer using the allocation weights. An unfunded drawer cannot win. Before commitment, display cost, overall win chance, and clearly labeled drawer probabilities. Increasing one drawer's allocation while keeping the others fixed raises total win chance and increases that drawer's selection weight; its conditional selection probability can remain 100% when it is the only funded drawer. For a positive total n, use P(win) = 0.60 - 0.40 × exp(-(n - 1) / 3). This selected interpolation starts at 20%, gives about 58% at ten tokens, increases toward a 60% upper limit, and leaves both a positive win chance and a positive no-win chance. The user supplied the anchors and increasing/nonzero behavior; the exact interpolation is a documented product default, not a formula supplied by the user. Zero total tokens is invalid and does not trigger a roll. Default assumption for stage two: weights are proportional to tokens, so the conditional drawer chance is its allocation divided by total allocation. The unconditional chance of opening it is overall win chance multiplied by that conditional chance.
- **FR-015**: Charge the entire accepted allocation once for wins or losses and preserve a fixed recoverable outcome that cannot be manipulated or rerolled.
- **FR-016**: Send each roll result, including no-win, to the associated locker simulator; only a winning result authorizes its matching compartment unlock. Keep the outcome separate from acknowledgement. The simulator must support successful delivery, offline state, and acknowledgement failure so retries can be verified before physical integration.
- **FR-017**: Preserve winning entitlements through delivery failures and permit retry without rerolling, another charge, or duplicate unlocks.
- **FR-018**: Redemption and locker provisioning are deferred until hardware readiness and must not block signup, activity completion or token earning. In that later milestone, support a personal four-compartment locker, item labels/loading, lock state, collection and reload/reset. Preserve fixed roll results and retry-safe acknowledgements across device adapters; a simulator may support recovery tests. Hardware transport and controller details require the later hardware interface.
- **FR-019**: Provide responsive layouts, readable progress summaries and completion logs, clear control labels, keyboard navigation, visible focus, sufficient contrast, and reduced-motion support.
- **FR-020**: Request camera/location for the relevant activities and explain denied/unavailable access. During an active Studbot session, send occasional sampled camera frames through an authenticated backend to FastAPI for live analysis, then discard frame buffers after the request. Explain this processing before starting the camera. Do not save study images/video to files, database/object storage, application logs, analytics, or backups. Persist only the aggregate observation/session results needed for counted time and history. Stop capture/transmission when the session ends or is manually paused. An automatic observation pause may continue sampling to detect the valid study position required for automatic resume, while no paused time is credited. Saved run/walk routes remain private to the account.

### Key Entities

- **User/Profile**: Identity, display name, timezone, and authorized locker association.
- **Task Definition**: Type, name, description, minimum duration, optional question, and reward rule.
- **Activity Session**: Task instance, time, qualification, and optional route/distance.
- **Completion**: Historical task snapshot, reflection, completion date/time, activity totals, and reward.
- **Goal Schedule**: User, specific activity/task, duration target, timezone, and recurrence choice: today only (one local date), every day, or selected weekdays (a nonempty weekday set).
- **Goal Occurrence**: One goal schedule on one local date, with matching qualifying-time progress and completion status independent of other dates. Repeated visits must not create duplicate occurrences. There is no separate aggregate weekly-target entity.
- **Token Entry**: Earn/spend quantity, linked completion/roll, and resulting balance.
- **Locker/Compartment**: Device availability, one of four slot identities, assigned item, and simulated state and future physical identity.
- **Roll**: User, allocations, cost, stage-one win probability and win/no-win outcome, stage-two drawer weights and selected drawer when won, applied probability policy, fixed combined outcome, and delivery state.
- **Unlock Entitlement**: Winning roll/compartment, attempts, acknowledgement, and collection/reload state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A test user can create a custom task with timer and question in under one minute, excluding time deciding what to enter.
- **SC-002**: Every tested eligible completion creates one history entry and exactly floor(qualifying seconds / 1800) tokens for that session, with no carryover, including repeated submissions; no qualifying time is credited twice.
- **SC-003**: Every accepted test roll has exactly one charge and recoverable outcome; concurrent roll tests never produce a negative balance.
- **SC-004**: On the simulated locker, every winning outcome unlocks exactly its assigned compartment; no losing outcome authorizes an unlock, and no roll unlocks more than one compartment.
- **SC-005**: Every tested unlock timeout preserves a visible result and retryable winning entitlement without another payment.
- **SC-006**: In controlled sessions, credited study time excludes all finally non-qualifying intervals after the documented short-glance grace policy; paused run/walk time is excluded from activity totals.
- **SC-007**: Dashboard, History, and balance agree with recorded activity across tested day/week boundaries.
- **SC-009**: Every tested roll performs the win/no-win decision before any drawer selection; losses select no drawer and wins select exactly one funded drawer.
- **SC-010**: The documented win curve matches 20% at one token and approximately 58.0% at ten tokens; it increases toward 60% and never makes a valid roll impossible or guaranteed.
- **SC-008**: At least four of five first-time testers can find their balance, complete a custom task, and explain the displayed roll cost/chances without help.

## Assumptions

- Users lock their own discretionary items. Tokens are earned only; purchase, transfer, and cash-out are outside this scope.
- When redemption is enabled after hardware readiness, provision one personal four-compartment locker per user; shared lockers/admin roles remain outside scope. Signup in the current milestone provisions no locker or compartments.
- Confirmed platform/stack: mobile-friendly React/Next.js web app, Supabase for account/data services, and FastAPI for ML models. Live camera/GPS observations require foreground browser availability; reliable screen-locked/background route tracking is outside the web capability. This does not require movement-based auto-pause or prevent custom/run/walk timer recovery from server timestamps.
- Camera-processing choice is confirmed: sampled frames reach FastAPI for transient analysis and are discarded, with no saved footage. The authenticated input contract and bounded in-memory handling must implement this decision.
- Daily goals are specific activities with individual time targets and calendar-style today-only, daily, or selected-weekday scheduling. A full calendar page, notifications, end dates, and arbitrary interval/monthly recurrence are not implied by this choice. Separate aggregate weekly targets are explicitly excluded. Distance-based goals are not selected.
- Users label their items; automated item recognition is outside scope.
- The user requested MediaPipe plus an ML classifier for Studbot. Preserve this implementation preference for technical planning.
- Study/run rewards use FR-008's per-session time rule; there is no additional configured minimum for those predefined activities by default. Every custom task requires a selected minimum of at least 30 minutes, including exactly 30 minutes, and must meet that minimum before completion. This requirement is a confirmed user rule, not an optional/default setting.
- Default lifecycle behavior is defined in [data-model.md](data-model.md) and the [ML contract](contracts/ml.md): preserve server-clock manual timers across refresh, exclude unobserved study time, reacquire study after two valid seconds, and keep goal progress provisional until completion. Physical emergency/manual-access design is deferred with real hardware; simulated collection/reload is in the locker contract.
- Current activity features depend on their required camera/location/map access, not a locker simulator. Physical locks/controller readiness gates the later redemption milestone.
- Simulated locker behavior is for validating the app; physical unlock acceptance is outside initial delivery.
- Stage one interprets “10+ tokens like 60%” as a smooth approach to a 60% upper limit, rather than a hard plateau at ten tokens, preserving increasing odds. This interpolation is adjustable after product testing.
- Stage-two proportional weighting is an explicit default interpretation, not a user-specified formula. Example: three tokens on drawer A and one on B gives A 75% and B 25% conditional on winning; the overall chance is based on four tokens.
- Concurrent activities must not double-count the same elapsed time toward rewards; the chosen accounting policy must define how competing sessions are handled before implementation.
- Project principles are established in `.specify/memory/constitution.md` v2.0.0. The user-selected stack is reflected in the completed [plan](plan.md), [research](research.md), [data model](data-model.md), and [validation guide](quickstart.md). Model calibration and lifecycle defaults are explicit; implementation must validate them.

Planning defaults: custom/run/walk timers use server timestamps and manual controls; study time requires observed compatible classification with the exact five-second grace/two-second reacquisition rules in the data model. Daily progress can combine completed sessions and the current provisional session, with canceled activity excluded. Classification tolerances, GPS distance filters, quote expiry, and simulator retry rules are documented defaults rather than additional user decisions.
