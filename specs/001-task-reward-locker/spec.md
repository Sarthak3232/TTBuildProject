# Feature Specification: Task Reward Locker

**Feature Branch**: `codex/task-reward-spec`; feature discovery uses `.specify/feature.json`.
**Repository**: https://github.com/Sarthak3232/TTBuildProject
**Created**: 2026-11-01
**Status**: Additional clarification in progress — reward/roll rules and web stack selected; Studbot presence/orientation rule confirmed; further task/session details being clarified
**Input**: A task and goal app connected to a physical four-compartment locker. Users earn tokens through focused study, runs/walks, and custom tasks, then allocate tokens among locked items and roll for a chance to unlock them. Includes dashboard, tasks, history, redeem, and profiles. User-supplied screenshots are saved under `references/`.

## Clarifications

### Session 2026-11-01

- Q: How should tasks earn tokens? → A: Time-based tokens, using one token per 30 minutes as the starting rate. Per-session rounding was resolved in the follow-up below; unmeasured tasks do not earn time-based tokens.
- Q: How many items can one roll unlock, and how is the result chosen? → A: At most one drawer per roll. First determine whether anything is won; if so, select one of the four drawers using the token allocations. One token uses the baseline win chance; adding tokens increases the overall win chance and the chance of receiving the drawer receiving those tokens. The percentage anchors are resolved in the final clarification below.
- Q: What is the initial hardware scope? → A: Simulate all four compartments initially and connect physical hardware later.
- Q: Should leftover minutes carry over between completed tasks? → A: No. Calculate whole tokens separately for each completed session and discard its leftover minutes.
- Q: What should the overall win probability be? → A: One token gives 20%; ten or more tokens should be around 60%; more tokens should improve the probability, and it should never be zero. The selected interpolation below approaches 60% with diminishing increases, giving approximately 58% at ten tokens.

- Q: Should the first version be a website or a phone app? → A: Web app using React/Next.js, Supabase, and FastAPI for ML models. Continue asking product-specification questions. This explicit stack replaces the provisional self-hosted-auth/Prisma planning choice.

- Q: What should Studbot recognize as qualifying study behavior? → A: Presence plus orientation toward the screen or study materials, allowing reading and writing while looking down. Use a short calibration for normal screen/book positions and tolerate brief glances, with an initial roughly five-second sustained-away pause threshold. Treat poor camera visibility as unable to verify rather than distraction. Phone detection is deferred; camera posture cannot prove cognitive attention or distinguish productive screen content from entertainment.

- Q: How should Studbot resume after an automatic pause? → A: Resume automatically after two consecutive seconds in a valid calibrated study position, preserving previously counted study time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete custom tasks and earn tokens (Priority: P1)

A user creates a named task with an optional minimum timer and one optional reflection question, completes it, and earns tokens.

**Why this priority**: Establishes the effort-to-reward loop without camera or location dependencies.
**Independent Test**: Create and complete a crochet task, then verify its history record and one reward credit under the selected policy.

**Acceptance Scenarios**:

1. **Given** Tasks, **When** the user selects Add task, **Then** they can enter a name, optional minimum duration, and one optional completion question such as “What did you make?”.
2. **Given** a timed task, **When** counted time is below its configured minimum, **Then** completion and rewards remain unavailable.
3. **Given** satisfied timing and a nonblank answer to the configured question, **When** completion is confirmed, **Then** one completion and its token credit are saved, including after repeated submissions.
4. **Given** an untimed task without a question or measured qualifying time, **When** the user confirms completion, **Then** it is recorded with zero earned tokens.
5. **Given** a completed eligible 45-minute session, **When** rewards are calculated, **Then** it earns one token and the extra 15 minutes are discarded. A separate completed 15-minute activity earns zero tokens.
6. **Given** a completed eligible 60-minute session, **When** rewards are calculated, **Then** it earns two tokens. Any configured custom-task minimum must also be met.

### User Story 2 - Roll to unlock a compartment (Priority: P1)

A user allocates tokens among items in four simulated compartments, reviews the total cost and chances, then rolls to unlock at most one compartment. These represent the later physical locker.

**Why this priority**: The locker reward loop is the product's central differentiator; a simulator makes it usable before physical integration.
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

### User Story 4 - Track a run or walk (Priority: P2)

A user tracks a run or walk with a map, distance, active time, and start/pause/resume/stop controls, then saves the activity.

**Why this priority**: Provides the second predefined task and an outdoor activity option.
**Independent Test**: Track a known route, pause/resume, and stop; verify saved route, distance, active time, and applicable reward.

**Acceptance Scenarios**:

1. **Given** location permission, **When** a run/walk starts, **Then** route, map, distance, active elapsed time, and controls are visible.
2. **Given** a paused session, **When** time passes or movement occurs, **Then** paused time and movement do not count toward qualifying totals.
3. **Given** location becomes unavailable, **When** tracking continues, **Then** missing coverage is shown and unavailable movement is not invented.
4. **Given** a finished qualifying activity, **When** it is saved, **Then** one completion, activity summary, and token credit are recorded.

### User Story 5 - Set goals and review progress (Priority: P2)

A user sets daily/weekly goals, sees today's completed tasks on Dashboard, and reviews all completed tasks on History.

**Why this priority**: Makes progress and rewards understandable over time.
**Independent Test**: Record activities across date boundaries and compare goals, dashboard, history, and earned totals.

**Acceptance Scenarios**:

1. **Given** Dashboard, **When** daily/weekly completion-count targets are set, **Then** current progress and remaining completions follow recorded activity.
2. **Given** today's activity, **When** Dashboard opens, **Then** current tokens, tokens earned today, and today's completed tasks are shown.
3. **Given** saved completions, **When** History opens, **Then** task names, descriptions/reflections, dates/times, and rewards appear newest first, grouped by day.
4. **Given** History, **When** this-week, this-month, or all-time is selected, **Then** entries and summary totals match that period.

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
- Unused minutes are discarded per completed session: separate 20-minute and 10-minute sessions earn zero tokens, while one eligible 30-minute session earns one.
- Camera/location denial leaves other task types usable. Canceled or ineligible sessions earn no tokens.
- Profile timezone governs dates; weeks begin Monday by default.
- Win chance is positive for every valid allocation and bounded above by 60%; an unfunded drawer still has zero selection chance. Higher token counts may look equal after display rounding, but the roll uses the unrounded curve.
- Camera classification estimates observable focus; it cannot establish learning or understanding.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide Dashboard, Tasks, History, Redeem, and Profile with consistent navigation and a visible current destination.
- **FR-002**: Provide user accounts, editable display names, private progress, and authorization for locker control.
- **FR-003**: Include Studbot and run/walk as the two predefined task types; allow additional custom tasks.
- **FR-004**: Custom tasks must support a name, optional minimum timer, and at most one optional completion question. A configured question requires a nonblank answer to complete.
- **FR-005**: Count active custom-task time and qualifying Studbot focus time. Provisional interpretation: a configured custom minimum must be strictly greater than 30 minutes; untimed custom tasks remain allowed.
- **FR-006**: Studbot must classify observable study-compatible behavior using presence plus orientation toward the calibrated screen or book/notebook area. Reading and writing while looking down are valid. Provide a short calibration for both positions, tolerate brief glances, and use an initial five-second sustained-away threshold before auto-pause. Camera failure, poor lighting, or blocked view must produce an unable-to-verify state rather than a distraction judgment; unverifiable intervals do not earn qualifying time. Show the state and counted time. Phone detection is outside the first version. Validate representative reading, writing, screen-facing, absent, and sustained-away cases before implementation; the classifier must not claim cognitive attention or knowledge of screen content. After an automatic pause, resume automatically only after two consecutive seconds in a valid calibrated study position, preserving all previously counted qualifying time. Invalid or unknown observations reset the two-second reacquisition interval. Exact grace-window accounting remains a planning detail to document before implementing the session lifecycle.
- **FR-007**: Run/walk tracking must show route/map, distance, active time, start, pause/resume, stop, and a saved summary.
- **FR-008**: Rewards must depend on qualifying active time across custom tasks, Studbot, and runs/walks, using one whole token per 30 minutes as the starting rate. Credit accepted activity once and preserve earning/spending history. Calculate each completed session separately: tokens = floor(qualifying seconds / 1800). Discard the remainder; do not carry it into other sessions. Untimed custom tasks remain recordable, but must not award time-based tokens without qualifying measured time. Proposed default: separate repeated sessions can earn through new non-overlapping qualifying time; this is an assumption, not a confirmed answer.
- **FR-009**: Support daily/weekly completion-count goals and show progress, today's completed tasks, balance, and tokens earned today on Dashboard.
- **FR-010**: Preserve completion-time task name, type, description/reflection, applicable duration, date/time, and reward; retain route/distance for runs/walks.
- **FR-011**: History must show completed tasks newest first by day with this-week, this-month, and all-time filters and matching totals.
- **FR-012**: Represent exactly four simulated compartments with assigned items and confirmed or unknown availability, corresponding to the later physical slots.
- **FR-013**: Accept whole-token per-item allocations only, with total cost from one token up to the available balance.
- **FR-014**: Use two random stages. First determine win/no-win from the total tokens allocated; one token uses a baseline win chance and additional total tokens increase that chance. Only after a win, choose exactly one funded drawer using the allocation weights. An unfunded drawer cannot win. Before commitment, display cost, overall win chance, and clearly labeled drawer probabilities. Increasing one drawer's allocation while keeping the others fixed raises total win chance and increases that drawer's selection weight; its conditional selection probability can remain 100% when it is the only funded drawer. For a positive total n, use P(win) = 0.60 - 0.40 × exp(-(n - 1) / 3). This selected interpolation starts at 20%, gives about 58% at ten tokens, increases toward a 60% upper limit, and leaves both a positive win chance and a positive no-win chance. The user supplied the anchors and increasing/nonzero behavior; the exact interpolation is a documented product default, not a formula supplied by the user. Zero total tokens is invalid and does not trigger a roll. Default assumption for stage two: weights are proportional to tokens, so the conditional drawer chance is its allocation divided by total allocation. The unconditional chance of opening it is overall win chance multiplied by that conditional chance.
- **FR-015**: Charge the entire accepted allocation once for wins or losses and preserve a fixed recoverable outcome that cannot be manipulated or rerolled.
- **FR-016**: Send each roll result, including no-win, to the associated locker simulator; only a winning result authorizes its matching compartment unlock. Keep the outcome separate from acknowledgement. The simulator must support successful delivery, offline state, and acknowledgement failure so retries can be verified before physical integration.
- **FR-017**: Preserve winning entitlements through delivery failures and permit retry without rerolling, another charge, or duplicate unlocks.
- **FR-018**: Initial delivery must work without physical hardware using four simulated compartments. Support locker association, item labels/loading, lock state, collection, and reload/reset to a locked state. Physical controller choice, communication transport, and real actuator integration are deferred; preserve the same roll-result and acknowledgement behavior for later integration.
- **FR-019**: Follow the provided visual direction: deep green navigation, mint accents, off-white background, rounded cards, progress summaries, and readable completion logs. Screenshot sample content does not override the requested allocation mechanic.
- **FR-020**: Request camera/location for the relevant activities and explain denied/unavailable access. Do not retain raw study video by default; saved routes remain private to the account.

### Key Entities

- **User/Profile**: Identity, display name, timezone, and authorized locker association.
- **Task Definition**: Type, name, description, minimum duration, optional question, and reward rule.
- **Activity Session**: Task instance, time, qualification, and optional route/distance.
- **Completion**: Historical task snapshot, reflection, completion date/time, activity totals, and reward.
- **Goal**: User, daily/weekly period, target count, and progress from completions.
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
- **SC-006**: In controlled sessions, credited study time excludes all intervals classified non-qualifying; paused run/walk time is excluded from activity totals.
- **SC-007**: Dashboard, History, and balance agree with recorded activity across tested day/week boundaries.
- **SC-009**: Every tested roll performs the win/no-win decision before any drawer selection; losses select no drawer and wins select exactly one funded drawer.
- **SC-010**: The documented win curve matches 20% at one token and approximately 58.0% at ten tokens; it increases toward 60% and never makes a valid roll impossible or guaranteed.
- **SC-008**: At least four of five first-time testers can find their balance, complete a custom task, and explain the displayed roll cost/chances without help.

## Assumptions

- Users lock their own discretionary items. Tokens are earned only; purchase, transfer, and cash-out are outside this scope.
- Start with one personal four-compartment simulated locker per user; shared lockers/admin roles are outside initial scope.
- Confirmed platform/stack: mobile-friendly React/Next.js web app, Supabase for account/data services, and FastAPI for ML models. Browser run/walk and camera observation are foreground-only; reliable screen-locked/background tracking is outside the web capability.
- Camera-processing placement and handling must be documented for the FastAPI model service; raw study video must not be retained by default.
- Goals initially count completed sessions; duration/distance-specific goals are unconfirmed.
- Users label their items; automated item recognition is outside scope.
- The user requested MediaPipe plus an ML classifier for Studbot. Preserve this implementation preference for technical planning.
- Screenshot branding “MINT”, names, streaks, sample totals, extra navigation destinations, and “1 token = 1 slot roll” are examples rather than confirmed requirements.
- Study/run rewards use FR-008's per-session time rule; there is no additional configured minimum by default. Strictly greater than 30 minutes for timed custom tasks is provisional.
- Background/hidden-page behavior, interrupted-session recovery, Studbot grace-window accounting, calibration tolerances, locker provisioning, collection confirmation, and manual/emergency access need resolution before affected implementation tasks begin. The observable presence/orientation rule itself is confirmed.
- Initial dependencies are a four-compartment locker simulator, camera access, and location/map access. Physical locks/controller and their transport are later integration dependencies.
- Simulated locker behavior is for validating the app; physical unlock acceptance is outside initial delivery.
- Stage one interprets “10+ tokens like 60%” as a smooth approach to a 60% upper limit, rather than a hard plateau at ten tokens, preserving increasing odds. This interpolation is adjustable after product testing.
- Stage-two proportional weighting is an explicit default interpretation, not a user-specified formula. Example: three tokens on drawer A and one on B gives A 75% and B 25% conditional on winning; the overall chance is based on four tokens.
- Concurrent activities must not double-count the same elapsed time toward rewards; the chosen accounting policy must define how competing sessions are handled before implementation.
- Project principles are established in `.specify/memory/constitution.md` v1.0.0. Planning is being revised around the user-selected stack; complete the requested further product clarification before finalizing it.

Pending product question: should custom tasks measure qualifying time with a built-in start/stop timer, or let the user enter duration afterward? No answer has been selected. Existing measured-time requirements remain provisional until this is resolved.
