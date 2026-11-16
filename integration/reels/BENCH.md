# Saved-outcome reel integration

## What the MVP does

The existing real Redeem button commits the roll and debit through the existing
backend. Its optional local notification sends that saved roll to bench.py.
The bridge maps slot wins 1–4 to outcome codes 0–3 and losses to outcome code 4.
Firmware expands winning codes to matching symbols and loss code 4 to indices 0/1/3. Firmware starts them together, adds
2/3/4 full reel turns respectively, and holds position after the pulse trains.
On identical reel gearing this produces left-to-right staggered stops.
The existing probability and debit logic and EE's bench motor routines are retained.
The new positioning scheduler uses AccelStepper, also used by the team's Reel.h.

The chosen physical layout is four evenly spaced labels on EVERY reel:
1, 2, 3, 4, in the configured direction of rotation.
A saved slot-3 win displays 3/3/3. A loss displays 1/2/4.
These labels must actually be attached. The saved outcome never changes for motion.
An open-loop pulse receipt confirms commanded pulses finished. Physical alignment
and absence of missed steps must be checked on the rig.

## Run without hardware

From the repository root in the SAME OS as the local Next.js server:

```sh
python3 integration/reels/bench.py --no-browser
```

Set SLOTTY_REEL_BENCH=1 in ignored web/.env.local and restart Next.js.
Use the real Redeem page at http://localhost:3000/redeem.
The bridge terminal prints the same roll UUID after each newly committed roll.
Viewing wallet history performs a read and does not issue movement.
The optional http://127.0.0.1:8765 page uses a separate SQLite fixture wallet.
The default ledger is slotty-bench.sqlite. Existing rows remain readable.

## Calibration information still required

motion_config.h provisionally assumes 20-tooth motor and reel gears, following
the user's expectation of identical gears. gearRatioConfirmed defaults to false.
The firmware will advertise Wi-Fi but refuse alignment and spins until the ratio is checked and gearRatioConfirmed is set to true.
For each reel, verify or enter the number of teeth on its motor-shaft gear and its
reel-shaft gear. Pulses per reel revolution =
200 full steps * 8 microsteps * reel gear teeth / motor gear teeth.
If confirmed that both meshing gears use the uploaded 20-tooth 8Gear.stl,
enter 20 for both. The uploaded set contains only one standalone gear model,
alongside drawer rack/rail/tray/frame models. That does not establish which
two gears are installed on the reel assembly.

Alternatively enter an independently measured pulses-per-reel-revolution value
in measuredStepsPerTurn for each reel. Do not guess a 1:1 ratio.
forwardHigh selects the shaft direction. Inspect label progression on the rig.
Rounding carry prevents systematic accumulation for fractional gear ratios.

## When stable power is available

1. Install TMCStepper and AccelStepper through Arduino Library Manager.
   Open SlottyWifiJog/SlottyWifiJog.ino and Verify. This version requires the
   accompanying bench_motor.h, motion_config.h, motion_plan.h, outcome_motion.h.
2. Configure actual calibration and attach the four labels to each reel.
   Set stationName/stationPassword locally for a private 2.4 GHz hotspot that
   the laptop also joins and that has internet for Supabase. Empty stationName
   instead creates Slotty-Bench, password SlottyBench24, at 192.168.4.1.
   Keep private credentials out of Git.
3. Upload with motor power disconnected. Use EE's verified power arrangement.
   Resolve the observed brownout before running movement tests.
4. After power-up the motors are released and alignment is invalid.
   Manually put label 1 of each reel at the display line. Open http://BOARD_IP/
   and select Confirm all reels at 1. It configures/checks drivers, establishes
   zero and enables holding torque. Reboot and realign after any lost reference.
   /identity must say SLOTTY WIFI REELS V3 and /ready must return ready.
5. Stop the simulated bridge and run:
   python3 integration/reels/bench.py --esp BOARD_IP --no-browser
   Physical mode uses a separate slotty-physical.sqlite ledger so simulator
   receipts cannot suppress the first real movement.
6. Initially exercise the fixture bench's fixed slot-3 outcome and physically
   verify 3/3/3. Check the same roll and confirm no new movement or debit.
   Then use one new roll on the real Redeem page. Check saved outcome, all
   three labels, the bridge receipt and the final database balance.

Holding torque draws power and can warm motors/drivers. EE must verify current,
temperature and power stability with all three holding and with Wi-Fi active.

## Protocol and interruption handling

V3 uses POST /spin?id=UUID&target=0..4 with X-Slotty-Bench: 1.
GET /receipt?id=UUID returns pulses finished, failed before motion or unconfirmed.
The ESP32 durably claims the full UUID and target in NVS before movement.
A shortened storage key collision rejects movement after comparing the full UUID.
NVS exhaustion rejects new claims. Receipts survive a reset. Existing claimed
events never automatically replay. A reset requires manual reel realignment.
An interrupted event remains unconfirmed and requires operator inspection.
The bridge also durably claims the event before sending. Transport failures
preserve the original charge and outcome. Keep both receipt stores.
HTTP handling and receipt writes run outside the motor stepping loop.
The laptop allows up to 90 seconds for an HTTP response while the ESP32 is busy
stepping. The local web notification has a 120-second timeout.

There is still no durable backend delivery outbox. A roll accepted while the
bridge is offline can remain undelivered. Do not spend tokens again as recovery.
Automatic recovery needs an authenticated saved-event queue and reconciliation.
Private HTTP is for a trusted bench network. Later deployment needs device
authentication, HTTPS and a strategy for interrupted sensor-free motion.
Drawer actuation remains pending.

## Files changed for symbol positioning

- SlottyWifiJog.ino adds V3 target requests, manual alignment and persistent receipts.
- motion_config.h contains physical geometry, layout and conservative motion settings.
- motion_plan.h computes relative pulses with rounding carry.
- outcome_motion.h schedules the three reels and retains holding torque.
- bench.py forwards the target, recognizes V3 and separates physical/simulation ledgers.
- test_bench.py tests target forwarding, duplicate suppression and missing receipts.
- test_motion_plan.cpp tests repeated fractional ratios and position wraparound.
- web/src/server/reelBench.ts extends the local notification timeout.
- .gitignore excludes physical bench state.
- This guide documents configuration, operation and outstanding hardware validation.

The earlier saved-result UI fix is a separate local change in RewardPreview.tsx.
WalletHistory.tsx matches the committed version.

## Verification

Run python3 -B -m unittest discover -s integration/reels -v.
All 18 tests passed, including real loopback HTTP against a mock ESP32 for all
four wins and loss, duplicate suppression, lost receipts and fixture accounting.
The native C++ planner test passed 90,000 repeated moves across nine gear ratios.
On Linux it can be run with:
g++ -std=c++11 integration/reels/test_motion_plan.cpp -o /tmp/slotty-motion-test
/tmp/slotty-motion-test

Arduino compilation could not run here because the ESP32 compiler fails to
start with Illegal System DLL Relocation. Arduino Verify and physical positioning,
direction, stopping order, holding temperature and gear calibration remain pending.


## Monday demo checklist

1. Prepare three strips with four equally spaced positions labeled 1, 2, 3, 4.
   Matching triples 111/222/333/444 mean wins for slots 1/2/3/4.
   The saved losing outcome is displayed as 124. Labels do not determine odds.
2. Confirm the installed gear ratio, then set gearRatioConfirmed=true.
   Meshing alone does not establish equal tooth counts. With equal gears,
   one motor revolution produces one reel revolution in the opposite direction.
3. Install TMCStepper and AccelStepper and Verify the sketch before upload.
4. Have EE establish stable power with Wi-Fi and all three drivers holding.
5. Use a private internet-capable 2.4 GHz hotspot for the laptop and ESP32.
6. Upload, power using EE's verified arrangement, check /identity, manually
   align all labels to 1, then confirm alignment at the board's root page.
7. Stop the existing bridge. Start physical mode with the board IP.
   Test the fixture's slot-3 win and duplicate suppression before a paid roll.
8. Verify a losing pattern and repeat moves maintain physical alignment.
9. Run the real website: earn, allocate, roll, check matching physical outcome,
   refresh and show saved result and debit. Repeat after one power cycle and
   manual realignment.
10. Keep the board, hotspot and laptop powered throughout the presentation.
    Avoid changes after a successful rehearsal.

For a controlled physical loss test, this private bench command uses a synthetic
event and does not create a backend roll or spend tokens. Run in WSL, replacing
BOARD_IP with the actual board address after alignment:

```sh
event=$(cat /proc/sys/kernel/random/uuid)
curl -X POST -H 'X-Slotty-Bench: 1' "http://BOARD_IP/spin?id=$event&target=4"
# Once motion finishes, retrieve the receipt.
curl "http://BOARD_IP/receipt?id=$event"
# Repeating the exact POST with the same event must not move the reels again.
```

For winning bench patterns use target=0,1,2,3 for 111,222,333,444 respectively,
each with a fresh synthetic event ID. Keep these fixture tests distinct from
the final authenticated website demonstration.


## Complete HTTP rehearsal while the circuit is unavailable

Run the actual website in terminal 1. In terminal 2, from the repo root, run:
python3 integration/reels/mock_esp32.py
Stop the old bridge, then in terminal 3 run:
python3 integration/reels/bench.py --mock-esp --no-browser

Create one roll on the real Redeem page. The real wallet debit and saved result
should match the UUID and labels printed by both bridge and MOCK receiver.
This tests actual HTTP requests through the device boundary, with simulated
mechanics. No board connection or extra browser test page is required.
Mock receiver state lasts for that process. The bridge's separate
slotty-mock-http.sqlite prevents it from consuming physical-mode receipts.
Restart the mock with --mode reject or --mode unconfirmed to rehearse failures
using new fixture events. Never reroll a paid result to recover delivery.
When the physical device is ready, stop the mock-mode bridge and start --esp IP.

mock_esp32.py is the clearly marked HTTP device mock. test_bench.py exercises
its normal response, duplicate handling, conflicting target, rejection and
unconfirmed reply. All 19 Python tests passed after this addition.
