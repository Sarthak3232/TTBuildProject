# Slotty demo: three reels, one drawer, two ESP32s

## Code to upload

- Perfboard ESP32: SlottyMotor/SlottyMotor.ino.
- Separate ESP32: SlottyWifi/SlottyWifi.ino.
Keep all companion headers in the corresponding sketch folder.
Use ESP32 Dev Module, DIO flash mode, 40 MHz flash frequency.
Motor libraries: TMCStepper, AccelStepper, Adafruit PWM Servo Driver Library,
Adafruit BusIO. Wi-Fi board uses ESP32 core libraries only.
Verify each sketch, then upload to the correct board using EE's verified
power arrangement. Both paired sketches compile with ESP32 core 3.3.12 using these settings.

## Wiring

Wi-Fi ESP32 D17 TX -> perfboard D18 RX.
Wi-Fi ESP32 D16 RX <- perfboard D19 TX.
GND -> GND. Use EE's verified separate supplies and keep positive rails separate.
Perfboard D16/D17 remain the TMC UART; do not use them for the inter-board link.
PCA9685: SDA21/SCL22, VCC3.3 V, regulated servo V+ ~5 V, OE GND, shared GND.
The assembled demo drawer is slot 1 / CH0. All three reel motors remain active.

## Current servo settings

Stop: 1500 us.
Clockwise/open: 1300 us (1500 - 200, matching the supplied working test).
Counterclockwise/close: 1700 us (1500 + 200).
Direction is viewed at the servo output shaft. Check the mounted mechanism
using short jogs before a complete stroke.
Initial integrated travel times: 250 ms outward and 250 ms inward.
Open dwell: 6000 ms. Those initial travel times are a short-stroke test,
not a measured 140 mm opening. A seven-second free-spin test does not establish
the correct drawer travel time.
drawerTimingConfirmed=false protects full winning cycles until direction,
neutral and the chosen stroke have been checked on the actual assembly.

## First network test: no hotspot credentials needed

1. Leave stationName/stationPassword empty in SlottyWifi.ino. enableWifi is
   already true in link_config.h.
2. Power the motor board, then the separate Wi-Fi board.
3. Wi-Fi board Serial Monitor at 115200 should show Motor board connected,
   PCA9685 ready and AP READY: Slotty-Bench.
4. Join Slotty-Bench, password SlottyBench24. Open http://192.168.4.1/identity.
   Expected response: SLOTTY WIFI REELS V4.
5. Open http://192.168.4.1/. Manually align Jacqueminot (1) on all three reels,
   then confirm alignment. Use CH0's 250 ms open/close jogs to check direction.
   Stop is on the page. Either board's BOOT sends a stop.
6. Test loss with a fresh synthetic UUID (no wallet charge):
   event=$(cat /proc/sys/kernel/random/uuid)
   curl -X POST -H 'X-Slotty-Bench: 1' "http://192.168.4.1/spin?id=$event&target=4"
   curl "http://192.168.4.1/receipt?id=$event"
   Expect all three reels to spin and display 124. Drawers remain stationary.
   Receipt initially says in progress, then sequence finished.
7. After the CH0 short open/close stroke is acceptable, enter the actual
   opening/closing times in SlottyMotor/drawer_config.h and set
   drawerTimingConfirmed=true. Verify and upload only SlottyMotor.
   Re-establish reel alignment and the drawer's flush closed reference.
   /ready should say ready. Test a NEW synthetic event with target=0.
   Expect 111, CH0 opens, stops, waits six seconds, closes and stops.
8. Repeat the exact event POST and confirm no repeated movement.

## Hotspot + real website

1. In SlottyWifi.ino enter the private hotspot's SSID/password locally.
   It must support 2.4 GHz. Connect the laptop to the same hotspot.
   Keep credentials out of Git.
2. Verify/upload only SlottyWifi. Power both boards. Serial Monitor prints
   JOINED and its actual IP. Open http://BOARD_IP/identity from the laptop.
3. Repeat alignment and closed-reference confirmation at http://BOARD_IP/.
   Check http://BOARD_IP/ready returns ready before spending tokens.
4. Stop any old/mock bridge and run from the repo root, in the same OS as Next:
   python3 integration/reels/bench.py --esp BOARD_IP --no-browser
5. Ensure ignored web/.env.local has SLOTTY_REEL_BENCH=1 and the configured
   Supabase keys. Restart the real website if settings changed.
6. Open Redeem and allocate tokens ONLY to slot 1. Click Roll & spend tokens once.
   Match the saved UUID to the bridge receipt.
   A win must display 111 and cycle physical CH0. A loss must display 124
   and leave drawers stationary. Refresh and show the saved balance/history.

Other saved wins still display 222/333/444, but their receipt says
reels finished; drawer unavailable. They never substitute drawer 1.
The backend's existing probability and debit logic is preserved.
Four reward symbols repeat around eight physical positions:
Jacqueminot, garnet, hammers, tongs, Jacqueminot, garnet, hammers, tongs.
60:60 gearing, 1600 pulses per revolution, 200 per symbol.
Speed cap 1600 pulses/sec; acceleration 800 pulses/sec squared.

## Offline video fallback

Set enableWifi=false in SlottyWifi/link_config.h and upload only that board.
The separate board's BOOT starts a predetermined slot-1 fixture over UART.
All drawers must be physically closed and reels aligned to 1 beforehand.
This creates no backend event or token debit. BOOT during motion stops.
To return to short servo tests, set offlineDrawerCalibration=true.
Motor board BOOT is always stop-only.
Label offline footage as a hardware fixture demonstration.

## Verification and limits

21 Python tests passed for bridge/mock outcomes, failures and duplicate handling.
Native C++ tests passed for motion/drawer timing/BOOT and actual motion_link.h
using UART/clock doubles. Servo pulse signs and CH0-only policy are asserted.
No physical two-board/Wi-Fi run has been verified by Codex.
Both Arduino builds pass. Reproduce software checks from the repository root:

```sh
python3 -m unittest discover -s integration/reels -p 'test_*.py'
clang++ -std=c++17 -I integration/reels/tests/native integration/reels/test_motion_link.cpp -o /tmp/slotty-link-test
/tmp/slotty-link-test
clang++ -std=c++17 integration/reels/test_motion_plan.cpp -o /tmp/slotty-motion-test
/tmp/slotty-motion-test
```
The Wi-Fi and motor watchdogs stop active motion on link loss.
Interrupted events stay unconfirmed and require inspection and realignment.
A receipt confirms the command sequence, not sensor-verified arrival.
No durable backend outbox exists. Keep services online and recover the same
saved roll instead of spending tokens again if delivery fails.
