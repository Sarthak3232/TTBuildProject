For the current three-reel, two-board setup, follow [README.md](README.md). The instructions below describe the earlier bench prototype.

# Reel bench for the MVP

## Rehearse today

In File Explorer, double-click **Start Reel Bench.cmd** in this folder. Keep the console open. Visit http://127.0.0.1:8765. Alternatively run the following from the repository root in WSL or Windows.

```sh
python3 integration/reels/bench.py
```

Click **Roll & spend 1 test token**. The local fixture always wins slot 3 (target 2). SQLite starts with 20 test tokens. **Check same roll** reuses the ID. Refresh to see the stored balance. The default transport simulates all three jogs. The rehearsal and live bridge share a persistent jog ledger beside the script. Keep that ledger between launches, and run one bridge per rig.

## Bring up the physical board

Have EE demonstrate channels 1, 2 and 3 individually on the finished board and confirm the STEP/DIR, enable, UART, address, current and microstep configuration against bench_motor.h. Record which shaft is which. Use the team's verified power arrangement.

1. In Arduino IDE, open SlottyWifiJog/SlottyWifiJog.ino, select ESP32 Dev Module, install TMCStepper if needed and click Verify. When EE has released the board, upload over USB with motor power disconnected. Disconnect USB before using the verified battery-only configuration.
2. Join Slotty-Bench from the laptop with password SlottyBench24. Stay connected if Windows reports no internet. Open http://192.168.4.1/identity and expect SLOTTY BENCH JOG V1. This checks the device without moving a shaft.
3. Stop the simulated bridge with Ctrl+C in its terminal. From this folder, run `python bench.py --esp 192.168.4.1` (WSL: `python3`). Click a **new** roll in the bench page. Observe all three shafts in sequence. Each channel gets the bench sketch's 400 pulses. A driver configuration failure stops the sequence and names the channel. A completed pulse train cannot detect a stalled motor.
4. This jog fixture records the mapped target but uses the same movement for every outcome. To align symbols without sensors, provide a repeatable manual starting mark after every power-up, confirm the actual gear ratio, symbol order, direction and steps per reel revolution, then implement relative moves from tracked position. A missed step requires realignment.

## Use the real Slotty wallet

Use the local Next.js app on this branch. Its existing authenticated Roll & spend tokens action commits the full stake and the saved result through Supabase. Only after that success does the optional server hook forward the committed roll. A bridge failure leaves the debit and saved outcome intact. Look at the Next.js terminal for the receipt. The app requires its normal credentials and migrations (see repository README and web/.env.example). Ask software for a configured test account with tokens. Keep service credentials on the server.

1. Run the bridge in the same OS/network namespace as Next.js. Keep simulated mode initially. Put `SLOTTY_REEL_BENCH=1` in web/.env.local alongside the configured Supabase values and restart Next.js. From the repo root run `npm ci` once, then `npm run dev`.
2. Visit http://localhost:3000, sign in, open Redeem, note the balance, allocate one token and select **Roll & spend tokens**. Match the saved roll UUID to the receipt in the bridge console. Refresh and check wallet history. Both wins and losses should produce a movement request. The bridge has no spend endpoint for this wallet.
3. To run the real wallet and battery board together, use a network with internet for both. Enter the SSID/password of a private 2.4 GHz hotspot in the sketch before uploading; keep credentials out of Git. Get the board IP from the hotspot's client list, verify /identity and start the bridge using that IP. Alternatively use the ESP32 access point plus a separate laptop internet connection. A hosted Next.js server cannot reach this laptop's loopback bridge.

## Scope and recovery

The bridge claims the roll UUID in SQLite before sending a motor request. A process crash can leave a claimed event unconfirmed. Do not repeat a paid roll to troubleshoot hardware. Check the bridge console, balance history and physical shaft. This local demo has no durable server-side outbox if the bridge is offline when the roll commits. For unattended delivery add a transactional outbox, assigned device identity, HTTPS authentication, persistent device event receipts, and a recovery policy for interrupted open-loop motion. The Wi-Fi sketch uses private bench HTTP. It services network traffic outside the stepping loop.

## Files and verification

- bench.py implements the local HTTP bridge, fixture wallet and persistent delivery claims.
- bench.html and Start Reel Bench.cmd provide the rehearsal UI and launcher.
- SlottyWifiJog/SlottyWifiJog.ino implements the Wi-Fi command and receipt. bench_motor.h carries the existing bench pulse and configuration routine, returning its success flag.
- web/src/app/api/rolls/route.ts and web/src/server/reelBench.ts forward the accepted database result when explicitly enabled.
- test_bench.py covers wallet and event replay, missing receipts, empty balance and the Wi-Fi request sequence. The root .gitignore excludes the local SQLite state. This file documents the bench.
- From this folder run `python -B -m unittest discover -v`. All 16 tests passed. Headless Chrome verified click, debit, replay, and balance after refresh. No live Supabase transaction or physical movement was verified here. The ESP32 compiler could not start in this Windows sandbox (Illegal System DLL Relocation); run Arduino Verify before upload.
