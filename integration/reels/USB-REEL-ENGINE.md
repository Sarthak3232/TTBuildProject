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
3. Click **Connect USB** and select the motor board. Connection sends only `PING`
   at 115200 baud; it does not energise, home, spin, or open anything. It requires a
   valid 26-field ReelMotor heartbeat and `pong` handshake.
4. Check the eight-sector order against the physical reels and your calibration
   page. The default is `hammer,garnet,rose,tong,hammer,garnet,rose,tong`, but it is
   editable. `rose` means website `jacqueminot`; `tong` means `tongs`. The same order
   applies to all three reels, matching the supplied control page. The control
   page's `file://` storage is separate from the website's storage: copy a custom
   order explicitly. The website remembers its order in `slottyOrder`.
5. Inspect that each reel physically matches the displayed board position and
   that all four drawers are closed. Check the confirmation box and click
   **Confirm saved calibration & closed drawers**. This sends `ALIGNED 1`, then
   `DMARK 4 closed`, and waits for a fresh ready heartbeat. These commands record
   your inspection; they do not move or recalibrate the mechanism. Existing
   steps/turn, home, direction, speeds and drawer timings are retained.
6. Allocate tokens and click **Spin now**. This click authorizes the paid roll,
   reel motion, and opening the selected drawer if won. All three drivers must
   answer, all four drawers must be calibrated and closed, and nothing may be
   moving before a new payment is requested.
7. Collect a winning reward and **close the drawer by hand**. Inspect and confirm
   the closed drawers again before another roll. No `DCLOSE` is sent. Keep the
   page open during delivery; **Stop machine** sends `STOP` if needed. The board's
   BOOT stop and serial watchdog remain available.

## Commands and outcome mapping

The website uses the exact three saved `roll.wheels` names, choosing one of each
name's two physical occurrences. Sector `k` maps to its centre in hundredths of a
degree: `k * 4500 + 2250`. It sends one `SPIN a0 a1 a2`.

An accepted command is not completion. The client requires `E LANDED s0 s1 s2`
matching all requested sectors, followed by an idle, aligned heartbeat reporting
those sectors. A win then sends **one** `DOPEN` and waits for that drawer's open
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
  connect/confirm and use **Send saved result to machine** without paying again.
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
setup/readiness gating, independent drawer selection, duplicate suppression,
lost acknowledgements, incorrect landings, reset/stop/disconnect interruptions,
storage failures, saved-roll recovery, and desktop/mobile rendering. Mobile
browser tests inject the simulator; they do not establish mobile Web Serial
support. Real serial, reel accuracy and drawer movement require separate operator
permission and observation. No hardware commands were sent during implementation.
