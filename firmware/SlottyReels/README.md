# Slotty reel controller

Each reel has its own stepper motor and driver. A small gear on the motor turns the reel gear. The ESP32 tells the TMC2209 which direction to turn with DIR and commands one configured microstep per STEP pulse. An index flag on the **reel** passes a fixed optical sensor once per revolution, giving the firmware a physical reference even if the reel moved while power was off.

The Progress Check #2 CAD drawing shows three Ø130 mm reels on a common support shaft, each with a separate gear and motor. The reels need to rotate independently on the shaft, with each driven gear fixed to its own reel. The drawing dimensions the assembly. Use the gear model or count teeth on the printed parts for the ratio. Use the final symbol strip to count positions.

```text
Requested symbol → ESP32 → STEP/DIR → TMC2209 → stepper → gears → reel
                     ↑                                         │
                     └────────── index sensor ← reel flag ─────┘
```

Homing finds the leading edge of the flag while moving slowly in the spin direction. If the flag is already under the sensor, the reel moves forward until it clears the flag, then seeks the next leading edge. An adjustable offset puts symbol 0 in the viewing window. Spinning uses that reference to accelerate, travel several full turns plus the distance to the target symbol, and decelerate to a stop. Always approaching from the same direction keeps gear play on the same side.

## Calculate the positions

```text
pulses per reel revolution = motor full steps per revolution
                           × driver microsteps per full step
                           × reel gear teeth / motor gear teeth

symbol spacing in pulses = pulses per reel revolution / number of symbols
```

For example, a 1.8° motor has 200 full steps per turn. With 16 microsteps, a 16-tooth motor pinion, a 48-tooth reel gear, and eight equally spaced symbols, the reel needs 9,600 pulses per turn and 1,200 pulses per symbol. From symbol 0, symbol 3 is 3,600 pulses ahead. With two extra turns, the total move is 22,800 pulses. These are example dimensions. For a compound gear train, enter the equivalent tooth ratio across all stages. Use the STEP input microstep setting of the driver, which can differ from its internal interpolation resolution.

## Set up one reel first

The first reel is configured with 60 teeth on each gear and eight symbol positions. That is a 1:1 gear ratio, with positions spaced 45° apart. With the configured 200-step motor and eight microsteps per full step, each symbol is 200 STEP pulses apart. For the first test strip, measure around the actual reel and divide by eight. The Ø130 mm CAD reel gives about 51 mm per position.

1. Confirm that the bench uses the ESP32-S3 and TMC2209 shown in the proposal. Compare the wiring against the bench profile below before powering the driver. Verify the driver module's pinout and current setting for the installed motor. Install the ESP32 board package and **AccelStepper** in Arduino IDE, open `SlottyReels.ino`, and upload to the ESP32-S3.
2. Send `jog` to turn the first motor a small amount. This works before the gear ratio or symbol count is entered. After mounting the home sensor, send `sensor` with the flag in and out of the sensor and verify that the reported state changes. Set `homeActiveLow` to match the measured sensor polarity. Fill in the motor gear tooth count and the number of reel symbols before running `home`, `position`, or `spin`.
3. Start with `homeToSymbolZero = 0`. Place the flag so its leading edge appears slightly before the center of symbol 0 reaches the window. Home the reel and measure the angle still needed to center symbol 0. Convert it to pulses with `round(pulses per turn × angle / 360°)` and enter the result in the config. Re-home and check each symbol in the viewing window. Flip `reverse` if the reel turns opposite the direction you used to number its symbols.
4. Once the reel repeats its stops reliably, fill in the remaining rows and set `activeReels = 3`. Give each reel its own STEP, DIR, and home GPIO. Adjust acceleration and speed in `Reel.h` after testing with the installed reels. The initial settings are 250 pulses/s for homing, 1,000 pulses/s maximum for a spin, and 800 pulses/s² acceleration.

### First reel bench profile

| Signal | ESP32-S3 GPIO |
|---|---|
| Driver STEP | 4 |
| Driver DIR | 5 |
| Driver EN | 8, active low |
| Home sensor digital output | 15, proposed bench assignment |

The STEP, DIR, and EN assignments come from the proposal's schematic. The board and driver must share ground. Use a sensor whose output is compatible with 3.3 V GPIO. The profile assumes a 200-full-step motor and the schematic's standalone TMC2209 settings. Verify the actual board, wiring, and module settings if the bench differs from the drawing. With the pictured MS1/MS2 straps and no UART override, reels 1, 2, and 3 use 8, 32, and 64 microsteps respectively. A UART override needs matching values in the sketch.

## Serial bench commands

Set the Serial Monitor to **115200 baud** and use a newline line ending.

| Command | Expected behavior |
|---|---|
| `status` | Reports each active reel’s state. |
| `jog` | In the one-reel bench profile, sends 50 pulses and disables the driver again. Any previous home reference is cleared. |
| `sensor` | In the one-reel bench profile, reports whether the home input is active without moving the motor. |
| `home` | Finds the reference on each active reel. Wait for `DONE home`. A sensor that fails to change state within roughly one revolution causes a fault. |
| `position 3` | After homing one reel, moves forward to symbol 3 without adding full turns. Wait for `DONE position` and check the symbol in the window. |
| `spin 3` | In one-reel mode, spins and stops with zero-based symbol 3 in view. |
| `spin 3 1 5` | In three-reel mode, targets symbols 3, 1, and 5. Wait for `DONE spin`. Each reel gets a different number of extra turns. |

After `DONE home`, symbol 0 should be centered in the window. Number the evenly spaced symbols in the order they pass the window during forward rotation. Send `position 1`, `position 2`, and so on, waiting for `DONE position` after each command. Then send `position 0` to check the wrap back to the first symbol. In three-reel mode, send one index for each reel, such as `position 3 1 5`.

Try homing from several starting angles, including with the flag already covering the sensor. If a reel loses alignment after a jam, skipped steps, or manual movement, clear the cause and home it again. The index sensor establishes the starting position. During a move, the controller counts commanded pulses and cannot detect a missed step or confirm the displayed symbol.

For integration, the web app or game logic chooses the outcome and maps it to symbol indices. Use the sketch’s completion event to sequence the next action, with separate physical feedback if an unlock must depend on verified reel position. Keep the motion loop free of blocking network calls so it can service all active motors.
