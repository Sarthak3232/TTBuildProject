# TTBuildProject

A task and goal app where users earn tokens through study, runs/walks, and custom tasks, then allocate tokens across four locked items and roll for a chance to unlock one.

## Current scope

- One token per full 30 qualifying minutes in each completed session; leftover minutes are discarded with no carryover.
- Custom tasks use a built-in start/stop timer; setting a minimum-duration target is optional. Manual duration entry does not award tokens.
- Two-stage rolls: total tokens determine win/no-win; after a win, drawer allocations determine which single item unlocks. One token uses a baseline chance and additional tokens improve it. Overall win chance starts at 20% for one token and approaches 60% (about 58% at ten tokens).
- Four simulated locker compartments first; real hardware integration later.
- Daily goals target specific activities and durations, such as Study for 60 minutes, with individual progress displays.
- Dashboard, tasks, history, redeem, and profiles, with mint/deep-green visual references.

## Selected stack

React/Next.js web app, Supabase accounts/database, and FastAPI for ML models. Studbot checks calibrated presence and orientation toward screen/book, allowing reading/writing; phone detection is deferred. Further task/session clarification is in progress. Camera/GPS tracking is foreground-only in the browser.

## Spec Kit workflow

Project-local Codex skills live in `.agents/skills/`; templates and scripts live in `.specify/`.

The active feature is [`specs/001-task-reward-locker/spec.md`](specs/001-task-reward-locker/spec.md). Its review checklist and supplied screenshots are alongside it. Feature state in `.specify/feature.json` is local and intentionally ignored by Git.

The initial clarification pass is recorded, project constitution v1.0.0 is established, and planning is being revised around the selected stack. Continue product clarification before finalizing the plan, task breakdown, and implementation. No app has been implemented yet.
