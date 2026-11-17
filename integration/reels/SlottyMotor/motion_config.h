#pragma once
// Each reel must physically carry these eight equally spaced labels in its
// direction of rotation: 1, 2, 3, 4, 1, 2, 3, 4. Manually align all reels to 1.
constexpr int SYMBOL_COUNT = 8;
// Confirmed by the user: each motor and reel pair uses identical 60-tooth gears.
constexpr bool gearRatioConfirmed = true;
// Alternatively set measuredStepsPerTurn to measured pulses per REEL revolution.
constexpr int motorGearTeeth[3] = {60, 60, 60};
constexpr int reelGearTeeth[3] = {60, 60, 60};
constexpr long measuredStepsPerTurn[3] = {0, 0, 0};
constexpr bool forwardHigh[3] = {true, true, true};
// Gentle starting values for attached reels. Calibrate with EE on the rig.
constexpr float reelMaxSpeed = 1600;
constexpr float reelAcceleration = 800;
