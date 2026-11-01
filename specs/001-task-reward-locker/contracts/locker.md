# Locker and simulator contract

Initial adapter is a persistent four-drawer simulator. A future hardware adapter implements the same versioned event/acknowledgement semantics; no device board, transport, wiring or actuator implementation is selected now.

## Roll event v1

Fields: `eventId`, `rollId`, `lockerId`, `occurredAt`, `outcome` win/loss, `winningSlot` or null, `itemRevision` or null, and `schemaVersion: 1`. A win references exactly one previously reserved slot 1–4 and the item revision selected at roll acceptance. A loss references no slot. Every committed roll emits one durable event.

The worker obtains a leased pending event from Postgres and calls `deliver(event)`. On success the adapter returns `eventId`, `status: acknowledged`, `appliedAt`, and the resulting drawer revision if won. Repeated event IDs with the same payload return the original receipt. Changed payload under an existing ID is a conflict; do not apply it. A stale item revision or non-reserved drawer is an explicit failure, never an excuse to unlock another drawer.

## States and acknowledgements

Drawer lifecycle: empty → locked (load item) → reserved (win committed) → open (event applied) → collected → locked (reload/relock same or new item). Losing rolls do not change drawer state. No allocation to reserved/open/collected/empty drawers. Collection/reload cannot bypass an unresolved acknowledgement.

Delivery status is separate: pending → inflight → acknowledged; failures enter retry. Use a 30-second lease and retries after 1, 2, 4, 8, then 30 seconds, capped at 30 seconds thereafter; after ten failed attempts flag needs-attention and allow an explicit retry of the same event. Never drop a winning entitlement. Worker restart recovers expired leases.

Simulator modes: online/normal, offline, reject-before-apply, and apply-but-drop-ack. Known offline blocks new rolls without charging. Failure after roll commitment preserves its charge/result. In apply-but-drop-ack mode, atomically store the receipt and unlock; simulate one lost response, then the retry returns that receipt. Duplicate delivery cannot open a reloaded drawer because collection/reload requires acknowledgement and item revisions must match.

Owner-only simulation controls are visibly labeled. They may change connectivity/failure mode but cannot set a win, edit token balances, bypass an entitlement, or control another user's locker. Test-only result fixtures exist only in isolated tests, not public endpoints.

## Required validation

Known win opens only the selected slot; loss opens none; duplicate delivery has one effect; lost acknowledgement is recoverable; worker restart preserves events; stale revisions are rejected; all events retain owner isolation; reloaded items cannot receive old unlocks.
