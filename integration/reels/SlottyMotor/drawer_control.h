#pragma once
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include "drawer_config.h"
#include "drawer_sequence.h"

Adafruit_PWMServoDriver drawerPwm(drawerPcaAddress);
DrawerSequence drawerSequence;
bool drawerHardwareReady = false;
bool drawersClosed = false;
bool drawerFault = false;
bool drawerJogging = false;
uint32_t drawerJogStarted = 0;
int activeDrawer = -1;

bool drawerPulse(int index, unsigned microseconds) {
  drawerPwm.writeMicroseconds(drawerChannels[index], microseconds);
  const unsigned prescale = drawerPwm.readPrescale();
  if (prescale != 121) return false;
  const unsigned expected = uint64_t(microseconds) * 25000000 /
                            (uint64_t(prescale + 1) * 1000000);
  return drawerPwm.getPWM(drawerChannels[index], true) == expected;
}

bool stopDrawers() {
  bool ok = true;
  for (int i = 0; i < 4; i++) {
    if (!drawerPulse(i, drawerStopUs[i])) ok = false;
  }
  drawerSequence.cancel();
  drawerJogging = false;
  drawersClosed = false;
  return ok;
}

bool initializeDrawers() {
  Wire.begin(drawerSdaPin, drawerSclPin);
  Wire.setTimeOut(50);
  Wire.beginTransmission(drawerPcaAddress);
  const int probe = Wire.endTransmission();
  Serial.printf("PCA9685 probe at 0x40: %d (0 means acknowledged)\n", probe);
  if (probe != 0) return false;
  if (!drawerPwm.begin()) {
    Serial.println("ERR PCA9685 library initialization failed");
    return false;
  }
  drawerPwm.setOscillatorFrequency(25000000);
  drawerPwm.setPWMFreq(50);
  drawerHardwareReady = stopDrawers();
  Serial.println(drawerHardwareReady ? "PCA9685 neutral commands sent" : "ERR PCA9685 neutral writes failed");
  return drawerHardwareReady;
}

bool drawersBusy() { return drawerSequence.busy() || drawerJogging; }

bool startDrawer(int index, uint32_t now) {
  if (!drawerHardwareReady || !drawerTimingConfirmed || !drawersClosed ||
      drawersBusy() || index < 0 || index > 3) return false;
  if (!drawerAvailable[index]) return false;
  if (!drawerSequence.start(now, drawerOpenMs[index], drawerCloseMs[index],
                            drawerDwellMs)) return false;
  activeDrawer = index;
  drawersClosed = false;
  drawerFault = false;
  if (drawerPulse(index, drawerOpenUs[index])) return true;
  stopDrawers();
  drawerFault = true;
  return false;
}

bool jogDrawer(int index, bool opening, uint32_t now) {
  if (!drawerHardwareReady || drawersBusy() || index < 0 || index > 3)
    return false;
  activeDrawer = index;
  drawersClosed = false;
  drawerFault = false;
  if (!drawerPulse(index, opening ? drawerOpenUs[index] : drawerCloseUs[index])) {
    stopDrawers();
    drawerFault = true;
    return false;
  }
  drawerJogStarted = now;
  drawerJogging = true;
  return true;
}

// Returns true once for completion or fault. A jog never becomes a roll receipt.
bool tickDrawer(uint32_t now) {
  if (drawerJogging) {
    if (uint32_t(now - drawerJogStarted) < drawerJogMs) return false;
    drawerJogging = false;
    if (!drawerPulse(activeDrawer, drawerStopUs[activeDrawer])) drawerFault = true;
    return false;
  }
  DrawerAction action = drawerSequence.tick(now);
  if (action == DrawerAction::None) return false;
  const unsigned pulse = action == DrawerAction::Close
      ? drawerCloseUs[activeDrawer] : drawerStopUs[activeDrawer];
  if (!drawerPulse(activeDrawer, pulse)) {
    stopDrawers();
    drawerFault = true;
    return true;
  }
  if (action != DrawerAction::Complete) return false;
  drawersClosed = true;
  return true;
}
