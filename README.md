# TTBuildProject

A task and goal app where users earn tokens through study, runs/walks, and custom tasks, then allocate tokens across four locked items and roll for a chance to unlock one.

## Current scope

- One token per full 30 qualifying minutes in each completed session; leftover minutes are discarded with no carryover.
- Every custom task requires a minimum duration of at least 30 minutes (30 minutes is valid) and uses a built-in start/stop timer. Completion is blocked until its selected minimum is reached. Manual duration entry does not award tokens.
- Two-stage rolls: total tokens determine win/no-win; after a win, drawer allocations determine which single item unlocks. One token uses a baseline chance and additional tokens improve it. Overall win chance starts at 20% for one token and approaches 60% (about 58% at ten tokens).
- Runs/walks show a map, distance, and timer with manual pause/resume and stop; no movement-based auto-pause.
- Four simulated locker compartments first; real hardware integration later.
- Daily goals target specific activities and durations, such as Study for 60 minutes, with individual progress displays. Schedule them for today only, every day, or selected weekdays; each date has its own progress. Separate weekly targets are outside scope.
- Dashboard, tasks, history, redeem, and profiles with responsive layouts and accessible controls.

## Selected stack

React/Next.js web app, Supabase accounts/database, and FastAPI for ML models. Studbot checks calibrated presence and orientation toward screen/book, allowing reading/writing; phone detection is deferred. The first specification, technical design, and implementation task backlog are recorded. Camera/GPS tracking is foreground-only in the browser. Studbot sends sampled frames to FastAPI for live analysis and discards them without saving footage.

## Spec Kit workflow

Project-local Codex skills live in `.agents/skills/`; templates and scripts live in `.specify/`.

The active feature is [`specs/001-task-reward-locker/spec.md`](specs/001-task-reward-locker/spec.md). Its review checklist and technical plan are alongside it. Feature state in `.specify/feature.json` is local and intentionally ignored by Git.

Project constitution v2.0.0 and the first technical plan are complete. See the feature's plan, data model, API/ML/locker contracts, and quickstart validation guide. The [implementation backlog](specs/001-task-reward-locker/tasks.md) contains 72 dependency-ordered tasks. Next is implementation, beginning with the shared foundation and custom-task timer MVP. The commands in the quickstart describe the future app interface and are not runnable yet. No app has been implemented yet.
