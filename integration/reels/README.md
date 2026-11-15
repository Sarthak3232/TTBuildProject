# Slotty reel display prototype

## Integration gaps at the reviewed heads

| Boundary | Existing behavior | Missing piece |
| --- | --- | --- |
| Committed roll | PR #11 commits one debit and a fixed result. The owner can read `{roll: {id, won, slot, deliveryState, …}}` from `GET /api/rolls?id=<uuid>`. Wins also create an unlock entitlement. | A device-scoped source of committed display events, device assignment, claiming and receipt storage. The locker contract describes future work. |
| Symbols | Software uses winning slots 1–4 and null for loss. Firmware consumes one zero-based index per active reel. | A calibrated correspondence between the outcome and the printed symbols. |
| Motion | PR #12 uses 115200-baud line commands. One active reel has positions 0–7. The other two profiles have incomplete configuration. | A sequencer must home, await `DONE home`, issue the correctly sized spin and await `DONE spin`. `OK spinning` only means accepted. |
| Recovery | Neither command nor response identifies the roll. A disconnect can hide a completed motion. | A stable event identity and durable receipt on each side before unattended retries are possible. |

Reviewed [PR #11 roll route](https://github.com/Sarthak3232/TTBuildProject/blob/b927b7fb49256545ef29966a90edbd55d2fbac5d/web/src/app/api/rolls/route.ts), [accounting migration](https://github.com/Sarthak3232/TTBuildProject/blob/b927b7fb49256545ef29966a90edbd55d2fbac5d/supabase/migrations/20261110000100_application_transactions.sql), [locker contract](https://github.com/Sarthak3232/TTBuildProject/blob/b927b7fb49256545ef29966a90edbd55d2fbac5d/specs/001-task-reward-locker/contracts/locker.md) and [PR #12 sketch](https://github.com/Sarthak3232/TTBuildProject/blob/a824309b8f60e74fe164f5cd0526ffa612fb0a25/firmware/SlottyReels/SlottyReels.ino).

## Run locally

From the repository root, with Python 3.10+ and its standard library, run these commands. Use the **same persistent ledger path** across invocations for a given installation.

```sh
python integration/reels/bridge.py integration/reels/example-win.json --db ../slotty-demo.sqlite
python integration/reels/bridge.py integration/reels/example-win.json --db ../slotty-demo.sqlite
python -B -m unittest discover -s integration/reels -v
```

The example is a synthetic single-roll GET response. To try a stored result, substitute a JSON file exported from that authenticated GET. The CLI reads this file locally. The event ledger and serial session are local mocks. Nothing contacts the backend, and the program has no token, roll creation or entitlement mutation operation.

**Provisional one-reel mapping.** Slots 1, 2, 3 and 4 select indices 0, 1, 2 and 3 respectively. A loss selects index 4. Indices 5–7 are unused. Every outcome produces one target. The first example run reports target 2, commands `["home","spin 2"]`, status `completed` and detail `DONE spin`. The second returns the stored result with `replay: true` and an empty command list.

For independent **simulator-only** fault experiments, start each with a fresh demonstration ledger and add `--mode reject-spin` or `--mode drop-done`. The former returns `failed` with `ERR busy`. The latter applies motion, drops its terminal line and reports `unconfirmed`. The simulator models expiry instantly. Each command has its own deadline. Exit 0 means completed, 1 means incomplete or failed delivery, and 2 means input, ledger or invocation error.

## Duplicate and crash behavior

A unique SQLite primary key combines the reel-display purpose with the canonical stored roll UUID. The mapping uses only the stored outcome. The claim commits before the first command. A competing process sees the existing claim, and a changed outcome for that UUID raises a conflict. A crash between claim and receipt leaves `inflight`. A timeout or transport loss leaves `unconfirmed`. Replays of either state send zero commands, as do replays of a recorded failure or success. Inspect unresolved claims manually. Deleting or replacing the ledger removes this protection.

This provides at-most-once dispatch per roll within one shared ledger. A crash can leave a roll undisplayed. The mock uses an exclusive serial session per invocation. A physical bridge will need exclusive ownership of the device across different rolls and a way to correlate replies after a reconnect. A completed display records only reel motion. Winning entitlements stay pending for future redemption.

## Files and verification

Four additions under `integration/reels/` on local branch `integration/esp32-reel-control`, based on PR #11. All existing application and firmware files are untouched.

| File | Purpose |
| --- | --- |
| `bridge.py` | Stored-roll validation and mapping, mock serial transport, sequencer, SQLite ledger and CLI. |
| `example-win.json` | Synthetic GET response for a committed slot-3 win. |
| `test_bridge.py` | Automated protocol, outcome and duplicate-delivery tests. |
| `README.md` | Reviewed contracts, mapping, run instructions, evidence and remaining work. |

12/12 prototype tests passed on Windows with Python 3.14 and a writable temporary directory. Coverage includes all four winning slots, loss, invalid input, separate events, changed payload, concurrent duplicate claims, replay after reopen, crash after claim, homing failure, unrelated completion, rejected spin and lost completion after motion. Separate CLI runs verified success/replay, rejection, and lost-completion/replay. The test boundary is the saved GET response through the simulated terminal reply and persisted receipt. No live Supabase session, powered reel or full application regression suite was exercised.

## Remaining ESP32 Wi-Fi/HTTPS work

1. Have the backend create a durable, versioned reel-display event from the committed roll, atomically or through a backfill-safe outbox. Bind each event to the authorized owner and device. Implement authenticated, leased claims and idempotent status reporting with conflict checks. Display success and drawer entitlement need separate state.
2. Confirm printed symbol order, zero offset, sensor behavior, active reel count and timings on the powered bench. For three reels, complete each hardware profile and agree on a deterministic winning/losing symbol tuple. Version the mapping before field deployment.
3. On ESP32, validate TLS certificates and provision per-device credentials. Use a separate networking task with bounded queues for validated commands and receipts. Keep stepping and completion detection in the existing nonblocking motor loop. Handle reconnects and backoff in the networking task.
4. Persist event IDs, payloads, dispatch state and completion receipts on-device. On reconnect, replay receipts before accepting new motion. Reconcile power loss during movement explicitly. Bench-test delayed/duplicate events, lost acknowledgements, reset during motion, unavailable network and sensor faults before enabling automatic recovery.

## USB demo on the WROOM-32

`SlottyUsbDemo/SlottyUsbDemo.ino` is a USB-only Arduino sketch. Upload it with the motor supply disconnected, then close Serial Monitor. It answers status, home and spin with simulated motion. `usb_demo.py` uses pySerial 3.5 and the existing bridge ledger to deliver a saved roll over a real serial port. From the repository root, with pySerial installed, run:

```sh
python integration/reels/usb_demo.py --port COM3 --db ../slotty-usb-demo.sqlite
```

Observed on the user's ESP32: slot 3 produced target 2, SIM DONE home preceded spin 2, SIM DONE spin completed the event, and replay sent no second spin. This used the example GET response. Live backend delivery and physical motion remain to be tested.

## Manual motor identification on the WROOM-32

Open `SlottyBenchJog/SlottyBenchJog.ino` in Arduino IDE. With motor power disconnected, select ESP32 Dev Module, verify and upload, then send `status` at 115200 baud with Newline. Expect `READY BENCH JOG`. The sketch starts with the shared driver enable disabled. The documented STEP/DIR pairs are 25/26, 27/14 and 32/33; GPIO13 enables all drivers together. Confirm the actual power path, common ground, driver supply decoupling and motor current settings before applying motor power. In particular, establish whether the regulator already feeds ESP32 VIN before combining a motor supply with USB.

Secure all motors. With the bench power configuration verified, send `jog 1` once. Only channel 1 receives 200 step pulses. All three drivers may energize during the burst because they share enable. The firmware disables them after the burst. Observe which shaft turns, then label its housing. `DONE jog 1 pulses=200` confirms pulse generation only. The sketch has no home sensor, absolute positioning, website delivery, or drawer commands. For later web integration, keep delivery IDs and the stored outcome upstream; treat manual jog as a bench operation.

The 12 Python regression tests passed. The local Windows toolchain failed to launch its Xtensa compiler because of a DLL relocation error. Arduino IDE verification and the powered motion check are pending.

For battery-only triggering, the updated sketch also jogs channel 1 on a debounced press and release of BOOT (GPIO0) after startup. With only USB connected and motor power disconnected, confirm one OK/DONE pair in Serial Monitor when releasing BOOT. With all power removed, secure each motor and use the confirmed battery connector and polarity from the successful test. For the powered test disconnect USB first, power up with BOOT released, then press and release BOOT once. The serial reply counts issued pulses; observe the shaft to verify movement. Host checks passed for a held button at startup, contact bounce and one trigger on release. Board upload and powered movement remain unverified.
