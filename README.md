<div align="center">

# TTBuildProject

### Build habits. Earn tokens. Unlock your rewards.

A task-powered reward system connected to a four-compartment locker.

[Features](#page-by-page-features) · [Deliverables](#project-deliverables) · [Workflows](#user-workflows) · [Documentation](#project-documentation)

</div>

---

## About the project

TTBuildProject turns everyday effort into a chance to reclaim your favorite items. Place items in four locked compartments, complete activities to earn tokens, then allocate those tokens to the drawers you want to open.

Each roll has two stages: **do you win something?** If you do, **which drawer opens?** Spending more tokens improves your overall chance of winning, while your allocation influences which item you receive. A roll can unlock at most one drawer.

> **Project status:** Specifications, technical planning, and a 72-task implementation backlog are complete. The application, firmware, and physical locker are planned deliverables. Initial development uses four simulated drawers before connecting real hardware.

## Page-by-page features

| Page | Purpose | Features |
| --- | --- | --- |
| **Dashboard** | See what you want to accomplish today. | Activity-specific daily goals; individual time progress such as **Study: 35/60 minutes**; completed tasks; token balance; tokens earned today; a shortcut to redeem rewards. |
| **Tasks** | Start activities and earn tokens. | Studbot, run/walk tracking, and custom tasks; built-in session controls; optional custom minimum-duration targets; one optional reflection question per custom task. |
| **History** | Review your completed activities. | Task name, description/reflection, date and time, duration, and tokens earned; newest-first daily groups; this-week, this-month, and all-time filters; saved run/walk summaries. |
| **Redeem** | Spend tokens for a chance to open a drawer. | Four named items and drawer states; per-drawer token allocation; total cost and probability preview; two-stage rolls; win/loss results; unlock status and retry after a delivery failure. |
| **Profile** | Keep your activity and rewards personal. | Account access; editable display name and timezone; private goals, task history, token balance, and associated locker. |

### Activity modes

| Mode | How it works |
| --- | --- |
| **Studbot** | Uses calibrated presence and orientation toward your screen or study materials. Reading and writing while looking down count. Sustained absence or looking away pauses the session after about five seconds; two valid seconds resume it automatically while preserving counted time. Sampled camera frames are analyzed live and discarded without saving footage. |
| **Run / Walk** | Shows a map, route, distance, and timer with manual start, pause/resume, and stop controls. Standing still does not automatically pause the timer. Missing GPS coverage does not invent distance. |
| **Custom tasks** | Create activities such as crochet, reading, or practice. Use a built-in timer, optionally set a minimum duration, and optionally ask a completion question such as **“What did you make?”** Rewards use measured time, not manually entered duration. |

### Daily-goal scheduling

Set a named activity and duration, then choose **today only**, **every day**, or **selected weekdays** such as Monday, Wednesday, and Friday. Each scheduled date has its own progress and completion state. Separate weekly targets are outside the current scope.

## Project deliverables

The delivery scope includes the following:

| Deliverable | Included scope |
| --- | --- |
| **Five-page application** | Dashboard, Tasks, History, Redeem, and Profile with consistent mint/deep-green styling and clear loading, empty, and error states. |
| **Studbot activity verification** | Camera setup/calibration, study-compatible presence/orientation classification, automatic pause/resume, and transient frame processing. |
| **Run/walk tracker** | Map and route display, distance measurement, manual timer controls, and saved activity summaries. |
| **Custom-task system** | Task creation, measured timers, optional minimum targets, and optional completion reflections. |
| **Daily goals and schedules** | Per-activity time targets, today/daily/weekday recurrence, and independent progress for each date. |
| **Accounts and activity records** | Profiles, private completion history, token balances, and earning/spending records. |
| **Token and roll engine** | Time-based rewards, per-drawer allocations, probability previews, two-stage random outcomes, and protection against duplicate rewards or charges. |
| **Four-drawer simulator** | Item assignment, locked/open states, collection and reload, offline behavior, and unlock-acknowledgement failure testing. |
| **Physical locker and firmware** | Four lockable compartments, item-to-drawer mapping, roll-result communication, and control of the matching lock after a win; follows the simulator milestone. |
| **Integration and validation** | End-to-end activity-to-unlock flow, reliable retry behavior, account isolation, privacy checks, usability checks, and documented validation results. |
| **Project documentation** | Constitution, feature specification, technical plan, data model, interface contracts, validation guide, and implementation checklist. |

## User workflows

### 1. Prepare your rewards

Assign an item to each of the four drawers and lock it. The Redeem page shows which items are available. The first prototype demonstrates this with simulated compartments.

### 2. Plan your day

Create goals such as **Study for 60 minutes**, **Walk for 30 minutes**, or **Crochet for 45 minutes**. Choose when each goal repeats, then follow its progress on the Dashboard.

### 3. Complete an activity

Start Studbot, a run/walk, or a custom-task timer. Pause and resume as needed, then finish the activity and answer its reflection question if one is configured. The completion appears in History and eligible time earns tokens.

**One token is earned for every full 30 minutes within a completed session.** Leftover minutes are discarded per session.

| Completed session | Tokens earned |
| --- | ---: |
| 30 minutes | 1 |
| 45 minutes | 1 |
| 60 minutes | 2 |

Daily-goal progress can combine sessions: two 20-minute study sessions contribute **40 minutes** toward a daily study goal, while earning **0 tokens** because neither session reaches 30 minutes.

### 4. Allocate tokens and roll

1. Open Redeem and select the drawers you want to play for.
2. Allocate whole tokens to those drawers and review the total cost and chances.
3. Roll: the total allocation determines whether you win anything.
4. If you win, the allocation weights determine which one funded drawer opens.
5. Collect the item, then reload and relock the drawer when it is ready for another reward.

Allocated tokens are spent on both wins and losses. The starting win chance is **20% with one token**, increasing toward **60%** as more tokens are spent; the current curve gives approximately **58% at ten tokens**. If an unlock acknowledgement fails, retry delivery of the same winning result without paying or rolling again.

### 5. Review your progress

Check the Dashboard for today's goals and earnings, or filter History to review past activities and reflections. Your profile keeps this activity and locker access tied to your account.

## Tech stack

**C++ / Arduino**

## Project documentation

Detailed planning documents are maintained on the [`task-reward-spec`](https://github.com/Sarthak3232/TTBuildProject/tree/task-reward-spec) branch.

| Document | What you will find |
| --- | --- |
| [Project constitution](https://github.com/Sarthak3232/TTBuildProject/blob/task-reward-spec/.specify/memory/constitution.md) | Guiding principles, product boundaries, and verification rules. |
| [Feature specification](https://github.com/Sarthak3232/TTBuildProject/blob/task-reward-spec/specs/001-task-reward-locker/spec.md) | All features, user decisions, scenarios, and acceptance criteria. |
| [Technical plan](https://github.com/Sarthak3232/TTBuildProject/blob/task-reward-spec/specs/001-task-reward-locker/plan.md) | Architecture and delivery sequence. |
| [Data model](https://github.com/Sarthak3232/TTBuildProject/blob/task-reward-spec/specs/001-task-reward-locker/data-model.md) | Records, relationships, and lifecycle rules. |
| [Interface contracts](https://github.com/Sarthak3232/TTBuildProject/tree/task-reward-spec/specs/001-task-reward-locker/contracts) | Application, ML-service, and locker interfaces. |
| [Implementation checklist](https://github.com/Sarthak3232/TTBuildProject/blob/task-reward-spec/specs/001-task-reward-locker/tasks.md) | 72 ordered tasks covering the planned implementation. |
| [Validation guide](https://github.com/Sarthak3232/TTBuildProject/blob/task-reward-spec/specs/001-task-reward-locker/quickstart.md) | Planned setup commands and the checks required before completion. |
| [Design references](https://github.com/Sarthak3232/TTBuildProject/tree/task-reward-spec/specs/001-task-reward-locker/references) | Dashboard and History visual references. |
