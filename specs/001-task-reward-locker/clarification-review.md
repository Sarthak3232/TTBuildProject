# Clarification review — 2026-11-01

Five questions answered across the clarification conversation. Updated specification: `spec.md`.

Updated sections: Clarifications; User Scenarios & Testing; Edge Cases; Functional Requirements; Key Entities; Success Criteria; Assumptions. README also reflects the selected policies.

Spec quality checklist: 10/15 → 11/15 passing. Newly passing: no clarification markers remain. No regressions. Four unchecked areas remain: complete testability, final acceptance rules, acceptance criteria for all requirements, and full outcome evaluability. These depend on focus classification criteria/calibration and session lifecycle defaults. The checklist notes retain the original draft review as required by the marker-only clarification update rule; this review and current spec describe the latest state.

| Coverage category | Status | Detail |
| --- | --- | --- |
| Functional scope and behavior | Resolved | Per-session rewards, two-stage rolls, simulator-first delivery |
| Domain and data | Resolved | Session rounding, roll outcome stages, positive allocation rules |
| Interaction and UX | Clear | Primary journeys, status/error handling, supplied visual references |
| Non-functional quality | Deferred | Concrete focus classification criteria, calibration, and privacy implementation need planning |
| Integration and dependencies | Resolved | Simulator now; physical transport/controller later |
| Edge cases and failures | Clear | Duplicate requests, concurrent spending, interrupted unlocks, invalid allocations |
| Constraints and tradeoffs | Deferred | Native versus web, background tracking, and session recovery choices belong in planning |
| Terminology and consistency | Clear | Total win chance distinguished from conditional drawer selection |
| Completion signals | Outstanding | Final measurable focus criteria and session lifecycle acceptance rules remain |
| Placeholders | Clear | No clarification markers in spec; constitution remains a separate unfilled project template |

No before/after clarification hooks configured. No application implementation performed.

Next: establish the project constitution, then use the planning workflow to resolve the deferred runtime and session lifecycle decisions before implementing affected tasks. Further broad product questioning is unnecessary for this pass.

## Continued specification — user-directed update

The user selected React/Next.js, Supabase, and FastAPI for ML and explicitly requested more product questions. This supersedes the earlier optional-platform and completed-pass status. Constitution v1.0.0 now exists. Planning is in progress; the current Studbot focus question is pending. The expanded spec has one new clarification marker, so the quality checklist returned from 11/15 to 10/15; no-clarification-markers regressed because the scope is being refined. Historical review above describes the initial pass only.

Latest update: Studbot presence/orientation recommendation accepted, including reading/writing, calibration, brief-glance tolerance, initial five-second sustained-away pause, and no initial phone detection. The related marker is resolved; checklist returns to 11/15 (no regressions). Further session behavior questions are still authorized and pending, so this does not establish final plan readiness.

Automatic Studbot resume accepted: two consecutive valid seconds after an automatic pause, with earlier qualifying time preserved and reacquisition restarted by invalid/unknown observations. Checklist re-evaluated: 11/15 unchanged, no newly passing items or regressions; remaining lifecycle/task/ML-contract details still prevent final plan readiness.

Custom-task time decision accepted: built-in start/stop timer with pause/resume, a required minimum target of at least 30 minutes (inclusive), and no reward-bearing manual duration entry. Updated spec scenarios/requirements, plan, research, and checklist notes. Checklist re-evaluated: 11/15 unchanged; remaining session/ML/goal details still precede final plan readiness.

Daily goals clarified: specific activity/time targets with individual progress, such as Study 35/60 minutes, completed upon reaching the target. Supersedes aggregate task-count-goal assumptions. Goal time can accumulate across matching sessions independently of token rounding. Recurrence and weekly behavior remain open. Checklist re-evaluated: 11/15 unchanged; no marker changes or regressions.

Daily recurrence confirmed: calendar-style today only, every day, or selected weekdays. Store independent per-local-date occurrences/progress; do not imply a full calendar page or notification system. Separate aggregate weekly targets remain unconfirmed. Checklist re-evaluated: 11/15 unchanged, no marker changes or regressions.

Separate aggregate weekly targets explicitly declined. Current goal scope is scheduled daily activity/time goals only; historical weekly-goal questions above are resolved. Weekly History filtering remains available and is not a goal feature. Spec, plan, research, and constitution boundary updated consistently. Checklist re-evaluated: 11/15 unchanged, no marker changes or regressions.

Studbot processing choice confirmed: sampled camera frames are analyzed transiently by FastAPI and discarded; no saved images/video, raw-frame logs, or image storage. Aggregate observation/session results persist. Explicit pause/end stops capture; automatic observation pauses may sample for reacquisition without crediting paused time. Updated spec acceptance/privacy requirements, plan, research, README and review notes. Checklist re-evaluated: 11/15 unchanged, no marker changes or regressions.

Run/walk manual controls confirmed: no movement-based auto-pause; stationary time counts while running. Keep map, distance, and timer visible, with GPS coverage independent of elapsed reward time. Paused movement/time do not count and motion alone cannot resume a paused session. Main product choices are sufficient to finish the design using explicit interruption/calibration defaults.

Planning closure: user-selected manual run/walk controls recorded, then concrete defaults selected for study grace/calibration, server-timestamped manual timer recovery, one active session, daily occurrence lifecycle, model validation, GPS distance filtering, transactions and simulator retry. Phase-one plan, research, data model, API/ML/locker contracts and quickstart are complete. Requirements-quality checklist 11/15 → 15/15, no regressions. The four newly satisfied items are testability, final acceptance rules, per-requirement acceptance criteria and measurable-outcome evaluability. This supersedes historical pending-plan statuses above. No application code/tests have been implemented or run.

Correction: the user confirmed that every custom task always requires a minimum duration of 30 minutes or more, inclusive. Earlier optional/strictly-greater interpretations have been replaced in all current project documents, examples, model/API constraints and task descriptions. Missing/null/below-30-minute minimums must be rejected; custom completion at 29:59 is blocked and at a 30-minute target is allowed at 30:00. Short zero-token completion examples apply only to predefined study/run activities.
