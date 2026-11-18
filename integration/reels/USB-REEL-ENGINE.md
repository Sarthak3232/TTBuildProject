# Website → ReelMotor over USB

The rewards page now talks directly to the **reel-engine/ReelMotor** firmware used by
`Slotty-Code 3/firmware/reel-engine/control.html`. It does not use the older
SlottyReels, SlottyUsbDemo, two-board HTTP contract, or Python bridge. No firmware
changes or uploads are required for a board already running that ReelMotor build.

## Operator setup

1. Run the website normally, with its configured Supabase account and migrations,
   including `20261118173233_roll_wheel_outputs.sql`. Open `/redeem` in desktop
   Chrome or Edge over HTTPS or localhost. The API commits the token transaction
   and three immutable wheel symbols; a hardware failure never rerolls that result.
2. Connect the **motor ESP32** by USB. Close Arduino Serial Monitor, `control.html`,
   and other serial clients. Disable any other controller of this machine,
   including a WiFi board issuing UART commands. Only one page should control it.
3. Click **Connect USB** and select the motor board. At 115200 baud the app sends
   `PING`, requires a valid heartbeat and matching reply, then automatically sends
   `ALIGNED 1` and verifies the board reports alignment confirmed. Per the operator's
   instruction, every connection trusts the saved reel position. This does not
   home, recalibrate, energise or move the reels.
4. Check the eight-sector order against your calibration page. The default is
   `hammer,tong,garnet,rose,hammer,tong,garnet,rose`; rose means jacqueminot and tong
   means tongs. The same order applies to all three reels. The file control page
   and website have separate storage, so copy a custom order explicitly. If you
   edit the order, check its confirmation box and click **Confirm sector order**.
5. Only drawers with saved, confirmed calibration accept token allocations. A
   machine reporting calibration `1001` supports slots 1 and 4 while slots 2 and 3
   remain disabled. Unused, uncalibrated drawers do not block a spin. At least one
   calibrated drawer and all three responding motor drivers are required.
6. Allocate tokens and click **Spin now**. This click authorizes the paid roll,
   reel motion, and opening the selected drawer if won. Nothing may be moving
   before a new payment is requested. Viewing results or connecting never spins.
7. Per operator instruction, **assume the selected drawer is closed before every
   opening**: immediately before `DOPEN d`, send `DMARK d closed` and require its
   acknowledgement. `DMARK` only updates the board's phase; it does not drive the
   servo. Collect your reward and close it by hand. The app never sends `DCLOSE`.
   Unknown/open phases therefore do not block setup; calibration and motion checks
   still apply. These are operator assumptions, not sensor measurements.
8. Keep the page open during delivery. **Stop machine** sends `STOP` if needed.
   The board's BOOT stop and serial watchdog remain available. Live spins and servo
   tests by the coding agent still require explicit approval first.

## Commands and outcome mapping

The website uses the exact three saved `roll.wheels` names, choosing one of each
name's two physical occurrences. Sector `k` maps to its centre in hundredths of a
degree: `k * 4500 + 2250`. It sends one `SPIN a0 a1 a2`.

An accepted command is not completion. The client requires `E LANDED s0 s1 s2`
matching all requested sectors, followed by an idle, aligned heartbeat reporting
those sectors. A win then marks only its selected drawer closed and sends **one** `DOPEN` and waits for that drawer's open
phase. A loss sends no drawer command.

| Saved winning slot | Servo channel/command |
| --- | --- |
| 1 | `DOPEN 0` |
| 2 | `DOPEN 1` |
| 3 | `DOPEN 2` |
| 4 | `DOPEN 3` |

The winning drawer comes from `roll.slot`, independently of the matching symbol.
The old `notifyReelBench` call was removed from `POST /api/rolls`; leaving
`SLOTTY_REEL_BENCH=1` set cannot dispatch a second hardware sequence from that API.

## Recovery and limits

- A lost API response uses **Recover roll** with the same idempotency key, so it
  cannot create another charge. If USB was not ready after the result was saved,
  connect and use **Send saved result to machine** without paying again.
  Viewing history, rendering a saved result and reconnecting never dispatch motion.
- Before USB motion, the client synchronously saves a receipt in this website
  origin's `slotty-usb-deliveries-v1` localStorage journal. Storage failure blocks
  dispatch. Matching completed event IDs send nothing; changed payloads under
  an existing ID are refused. Explicit board refusals before motion may be retried.
- USB commands on this firmware **have no event IDs or firmware receipts**. The
  receipt layer described in the handoff is on the WiFi board, bypassed here.
  A timeout, reset, stop, disconnect, unexpected landing, or interrupted local
  claim becomes uncertain. The app blocks new spins and automatic replays. An
  operator must inspect and resolve that delivery manually, then acknowledge the
  inspection. That event is retained as inspected and is never replayed.
- This journal protects one browser profile and website origin. Do not clear it,
  switch origins/profiles, or control the same roll from another computer to
  retry a delivery. Cross-client exactly-once delivery requires a device event
  protocol and shared server receipt ledger, which this firmware does not have.
- Board reports describe commanded positions/timed travel, not sensor-verified
  movement. Check actual reels/drawers during the first approved hardware test.
  Browser receipts do not change the server's `hardware_pending` entitlement or
  implement collection, item revisions, restocking, or a server worker.

## Verification without hardware

`npm test`, `npm run check`, and `npm run test:e2e` exercise a simulated serial
board only. Tests cover all four channels, exact saved-symbol mapping, losses,
automatic alignment, partial drawer calibration, assumed-closed marking, readiness gating, independent drawer selection, duplicate suppression,
lost acknowledgements, incorrect landings, reset/stop/disconnect interruptions,
storage failures, saved-roll recovery, and desktop/mobile rendering. Mobile
browser tests inject the simulator; they do not establish mobile Web Serial
support. Real serial, reel accuracy and drawer movement require separate operator
permission and observation. No spin or servo-drive commands were sent during implementation. A separately authorized USB check sent `PING` and the nonmoving `ALIGNED 1` command.

## Approved USB bench test — 2026-11-18

After explicit operator approval, one direct USB test sent `ALIGNED 1`, one
`SPIN 2250 2250 2250`, then—only after `E LANDED 0 0 0` and matching idle
heartbeat state—`DMARK 0 closed` and one `DOPEN 0`. All three `E REEL` events
reported sector 0 at 22.50 degrees, and drawer 1 subsequently reported open
(phase 3). The port was released and no close command was sent. No other drawer
was actuated. This confirms firmware command acceptance and completion reports;
physical symbol alignment and actual drawer travel await the operator's visual
confirmation. This was a serial bench test, not a real-account browser roll.

## Confirmed physical artwork order

The operator corrected the physical sector order on 2026-11-18: sectors 0–7 are
**hammer, tong, garnet, rose, hammer, tong, garnet, rose**. The website now uses
this default and migrates the previous default saved in browser storage, including
its canonical aliases. Custom orders remain editable. The firmware controls sector
indices; its diagnostic name strings and the separate control page may still use
the older order, so use the confirmed physical order when testing those tools.

## Temporary 100% win test mode

Set server-only `SLOTTY_TEST_WINS=true` in `web/.env.local` and run the development
server. The rewards page displays a test-mode banner and 100% win probability for
new paid rolls. Authentication, token debits, allocation-weighted drawer choice,
database-generated matching wheel symbols, and idempotent saved results remain
active. Only the trusted server supplies a guaranteed winning sample to the
existing accounting RPC; the browser cannot choose an outcome. Previously saved
rolls, including losses recovered by their original key, remain unchanged.

This mode requires the existing server-only `SUPABASE_SECRET_KEY`, is disabled
in production, and changes no database-wide win policy. Set the flag to `false`
and restart development to return to normal probabilities. The database's normal
policy threshold remains in roll history; the local test-mode banner identifies
the temporary override. Tokens and winning entitlements are real saved records,
not a mock wallet. Tests use simulated serial streams and never actuate hardware.
