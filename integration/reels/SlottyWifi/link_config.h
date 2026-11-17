#pragma once
// Wi-Fi is on the separate ESP32. The perfboard ESP32 never starts its radio.
constexpr bool enableWifi = true;
// Used only if enableWifi=false for the standalone paired-board fixture.
constexpr bool offlineIncludeDrawers = true;
constexpr bool offlineDrawerCalibration = false;
constexpr int offlineDemoOutcome = 0; // Always slot 1 for this one-drawer fixture.
