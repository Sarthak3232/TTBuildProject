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

Custom-task time decision accepted: built-in start/stop timer with pause/resume, optional minimum target, and no reward-bearing manual duration entry. Updated spec scenarios/requirements, plan, research, and checklist notes. Checklist re-evaluated: 11/15 unchanged; remaining session/ML/goal details still precede final plan readiness.

Daily goals clarified: specific activity/time targets with individual progress, such as Study 35/60 minutes, completed upon reaching the target. Supersedes aggregate task-count-goal assumptions. Goal time can accumulate across matching sessions independently of token rounding. Recurrence and weekly behavior remain open. Checklist re-evaluated: 11/15 unchanged; no marker changes or regressions.
