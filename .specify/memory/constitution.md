# TTBuildProject Constitution

## Core Principles

### I. Traceable Product Rules

Changes MUST trace to the feature specification, an explicit assumption, or a recorded user
answer. Token accounting, win probabilities, drawer weighting, and simulator behavior MUST be
stated in testable terms before implementation. Explicit user requirements take precedence
over default design choices. Product defaults MUST be distinguished from user decisions.

### II. Consistent Rewards and Outcomes

The trusted service MUST calculate rewards, spend tokens, and determine random outcomes.
Clients MUST NOT award tokens or select authoritative outcomes. Each completion and roll
MUST be idempotent; balances MUST never become negative. An accepted roll MUST retain one
fixed outcome, and a winning entitlement MUST survive delivery failures without extra payment.
These rules prevent lost effort, duplicate charges, and contradictory locker states.

### III. Explicit Observation and Private Activity

Camera and location collection MUST require contextual permission and an active session.
Raw study video MUST NOT be stored by default. Routes, activity, balances, and locker control
MUST be account-scoped. Focus detection MUST be presented as an observable estimate rather
than proof of learning. Missing observations MUST NOT be credited as tracked activity.

### IV. Virtual Redemption Before Physical Delivery

The current milestone MUST support authentication, activities, history, goals, token earning,
and virtual redemption independently of physical hardware. Current balances MUST use the
user-selected table name `tokenBalance`. A valid roll MUST deduct the accepted allocation
and persist one immutable win/loss result now. A winning result MUST retain its selected
slot and entitlement with delivery explicitly pending hardware. The interface MUST NOT
claim an unlock or acknowledgement when no device performed one. Hardware readiness MUST
NOT block quoting, rolling, spending, result recovery, signup or activity credits.

Physical locker provisioning, transport, actuator control, acknowledgement workers, collection
and simulator-delivery recovery remain later work. Roll outcome and physical delivery MUST
remain separate so integration cannot reroll or charge again. ML integration is outside this
assignment; unverified study observations MUST NOT generate reward-bearing time.

### V. Accessible Flows and Evidence-Based Verification

Primary flows MUST support keyboard access, readable contrast, labeled inputs, and clear
pending/error states. Interfaces MUST adapt to phone and desktop layouts and keep required content
and controls usable. Verification MUST cover reward rounding, probability bounds,
weighted drawer selection, authorization, duplicate/concurrent requests, and unlock recovery.
Keep the implementation simple; add infrastructure only for a documented requirement.

## Product Boundaries

Every custom task MUST have a required minimum duration of at least 30 minutes (inclusive).
Missing, null, disabled, or shorter minimums MUST be rejected. Custom tasks MUST NOT complete
or award tokens before their selected minimum has been reached. Exactly 30 minutes is valid.

Tokens are earned from qualifying activity and have no purchase, transfer, or cash-out flow.
Award one token for each full 30 minutes in a completed session; discard that session's
remainder. Rolls have two stages: win/no-win from total allocation, then one drawer selected
from funded drawers. The current win curve starts at 20% and approaches 60%; its precise
formula and proportional drawer-weighting assumption live in the feature spec.

Virtual redemption contains exactly four allocation slots corresponding to the future locker compartments.
Scheduled daily goals, task history, and
profile data MUST derive from the same persisted activity records. Platform limits, tracking
coverage, and interrupted-session behavior MUST be documented before the relevant feature ships.

## Delivery and Verification

Follow specification, clarification, planning, task breakdown, and implementation as separate
workflows. Planning MUST resolve platform, focus-classification, session lifecycle, data,
authorization, and recovery decisions before affected implementation tasks begin. Changes to
product semantics MUST update the spec and related contracts together.

Run checks proportional to the change. Domain and integration tests are required for balance,
roll, identity, and locker invariants; visual checks are required for the main pages. Documentation
changes need consistency and link checks. Do not invent an approval requirement for routine
reversible work already authorized by the user.

## Governance

This is the initial project constitution. Amendments MUST record the reason, affected principles,
version, and date and reconcile affected feature artifacts. Major versions change or remove
existing governance obligations; minor versions add substantive principles; patch versions clarify
wording without changing obligations. Plans and reviews MUST identify constitution violations
and justify exceptions explicitly. User instructions take precedence over this document.

Amendment record — 2026-11-01, v3.0.0: user-directed redefinition of Principle IV.
Retain token earning now and defer redemption/locker infrastructure until hardware readiness,
replacing the initial simulator-first delivery obligation. Account isolation, credit integrity
and future unlock-recovery requirements remain in force.

Amendment record — 2026-11-09, v4.0.0: explicit user request in issues #9/#10 enables
virtual rolls, fixed outcomes and token spending before hardware readiness, while excluding
ML integration and physical delivery. This supersedes the v3.0.0 blanket redemption gate.

**Version**: 4.0.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-09
