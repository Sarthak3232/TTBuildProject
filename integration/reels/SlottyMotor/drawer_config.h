#pragma once
// Confirmed diagram: PCA9685 at 0x40, SDA D21, SCL D22, drawers CH0..CH3.
constexpr int drawerSdaPin = 21;
constexpr int drawerSclPin = 22;
constexpr int drawerPcaAddress = 0x40;
constexpr unsigned drawerChannels[4] = {0, 1, 2, 3};
// FS90MR continuous rotation. Adjust each neutral until that servo stays still.
constexpr unsigned drawerStopUs[4] = {1500, 1500, 1500, 1500};
// Matches supplied test: 1500 - 200 opens; 1500 + 200 closes.
// Viewed at the output shaft: clockwise opens, counterclockwise closes.
constexpr unsigned drawerOpenUs[4] = {1300, 1300, 1300, 1300};
constexpr unsigned drawerCloseUs[4] = {1700, 1700, 1700, 1700};
// Short initial test values, NOT calibrated 140 mm movement.
constexpr unsigned drawerOpenMs[4] = {250, 250, 250, 250};
constexpr unsigned drawerCloseMs[4] = {250, 250, 250, 250};
constexpr bool drawerTimingConfirmed = false;
constexpr unsigned drawerDwellMs = 6000;
constexpr unsigned drawerJogMs = 250;

// Physical demo has one assembled drawer; other servos remain available for calibration.
constexpr bool drawerAvailable[4] = {true, false, false, false};
