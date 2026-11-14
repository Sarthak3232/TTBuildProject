# Run/walk activity implementation (#9)

Replaces the illustrated preview at `/tasks/runTracker` with authenticated foreground GPS tracking using the shared activity/session API. Start, pause, resume, finish and discard use the same server-owned intervals, revisions, completion snapshots and token transaction as other activities. Stationary time and GPS outages do not pause or rewrite that clock. Completed runs/walks receive `floor(eligible_ms / 1800000)` tokens once; distance is independent of time rewards.

The screen shows restored active time, distance, average pace, earned/estimated tokens, an interactive MapLibre/OpenFreeMap map with visible attribution, optional notes, GPS errors and a saved summary. History links `/tasks/runTracker?session=UUID` open a private, read-only route and completion summary. No sample routes or fabricated distance are used.

`GET /api/sessions/:id/route` reads only the verified owner's route and optional completion. `POST` accepts strict JSON `{revision,points:[{sequence,capturedAt,lat,lng,accuracyM}],gap?}`. Cookie mutation origin checks and authentication are shared. Trusted server-role calls verify the owner; browser roles cannot write points, read internal cursors, or invoke these RPCs. Route reads also use owner RLS.

Ingestion locks the activity row, serializing against pause/resume/finish/discard. It requires a running run/walk at the supplied revision and a capture timestamp in the current active interval. Limits are 100 fixes per batch, 25,000 per session and batches at least 250 ms apart. Coordinates are finite/in bounds, accuracy <=50 m, age <=15 seconds, timestamps/sequences increasing and continuous sample speed <=12 m/s. Identical duplicate sequences have no effect. Invalid fixes, missing sequences, gaps >15 seconds and revision changes create disconnected segments. Distance excludes bridging gaps and suppresses small stationary jitter with a bounded uncertainty anchor. Completion reads authoritative distance under the shared session lock through `private.tracking_summary`.

Collection stops on manual pause/end, page hiding, leaving the tracker and network loss. High-accuracy fresh locations are collected only while the visible running activity is loaded. Web Locks prevent simultaneous collectors in supported browsers. Refresh restores the stored route/cursor first. Route reads/uploads time out after 10 seconds; stale failed uploads are not backfilled. Screen-locked/background GPS is outside this browser implementation. The server timer continues until a confirmed manual control change.

Validation:

- Targeted tracking ESLint passed.
- `npm test`: 28 passed (14 tracking and 14 shared accounting).
- `supabase/tests/tracking_validation.sql` on isolated PostgreSQL 17 with the base/core/GPS migrations passed and rolled back. Covers known distance, replay, rate/batch limits, malformed/stale/future/poor-accuracy/jump exclusion, stationary jitter, gaps, pause/resume, stale/late batches, owner isolation, role revocations/RLS and the real completion token/distance transaction.
- Parent also ran the fresh migration chain and concurrent transaction tests successfully.

Actual Supabase Auth and device GPS require configured credentials/browser permissions. No ML inference or hardware command is included.
