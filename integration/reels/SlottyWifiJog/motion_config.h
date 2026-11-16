#pragma once
// Each reel must physically carry these four equally spaced labels in its
// direction of rotation: 1, 2, 3, 4. Manually align all reels to 1.
constexpr int SYMBOL_COUNT = 4;
// Provisional assumption from the user: both gears use the 20-tooth STL.
// Confirm the installed pair or check one motor turn gives one reel turn.
constexpr bool gearRatioConfirmed = false;
// Alternatively set measuredStepsPerTurn to measured pulses per REEL revolution.
constexpr int motorGearTeeth[3] = {20, 20, 20};
constexpr int reelGearTeeth[3] = {20, 20, 20};
constexpr long measuredStepsPerTurn[3] = {0, 0, 0};
constexpr bool forwardHigh[3] = {true, true, true};
// Gentle starting values for attached reels. Calibrate with EE on the rig.
constexpr float reelMaxSpeed = 800;
constexpr float reelAcceleration = 400;
