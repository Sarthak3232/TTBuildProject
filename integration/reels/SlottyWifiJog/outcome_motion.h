#pragma once
#include <AccelStepper.h>
#include "motion_config.h"
#include "motion_plan.h"

AccelStepper reel1(AccelStepper::DRIVER, STEP_PIN[0], DIR_PIN[0], 0, 0, false);
AccelStepper reel2(AccelStepper::DRIVER, STEP_PIN[1], DIR_PIN[1], 0, 0, false);
AccelStepper reel3(AccelStepper::DRIVER, STEP_PIN[2], DIR_PIN[2], 0, 0, false);
AccelStepper* reels[3] = {&reel1, &reel2, &reel3};
int symbolsAt[3] = {0, 0, 0};
int64_t roundingCarry[3] = {0, 0, 0};
bool aligned = false;
bool moving = false;

bool validCalibration() {
  if (!gearRatioConfirmed) return false;
  for (int i = 0; i < 3; i++) {
    if (measuredStepsPerTurn[i] > 0) {
      if (measuredStepsPerTurn[i] < SYMBOL_COUNT ||
          measuredStepsPerTurn[i] > 1000000) return false;
    } else {
      if (motorGearTeeth[i] <= 0 || reelGearTeeth[i] <= 0) return false;
      const int64_t numerator = int64_t(STEPS_PER_REV) * reelGearTeeth[i];
      if (numerator < int64_t(SYMBOL_COUNT) * motorGearTeeth[i] ||
          numerator > int64_t(1000000) * motorGearTeeth[i]) return false;
    }
  }
  return true;
}

bool confirmAlignment() {
  if (moving || !validCalibration()) return false;
  for (int i = 0; i < 3; i++) {
    if (!setupDriver(*drivers[i])) {
      aligned = false;
      digitalWrite(EN_PIN, HIGH);
      return false;
    }
    reels[i]->setPinsInverted(!forwardHigh[i], false, false);
    reels[i]->enableOutputs();
    reels[i]->setMinPulseWidth(2);
    reels[i]->setMaxSpeed(reelMaxSpeed);
    reels[i]->setAcceleration(reelAcceleration);
    reels[i]->setCurrentPosition(0);
    symbolsAt[i] = 0;
    roundingCarry[i] = 0;
  }
  aligned = true;
  digitalWrite(EN_PIN, LOW); // Hold the manually established reference.
  return true;
}

bool startOutcome(int target) {
  if (!aligned || moving || target < 0 || target > 4) return false;
  for (int i = 0; i < 3; i++) {
    const int64_t numerator = measuredStepsPerTurn[i] > 0
        ? measuredStepsPerTurn[i] : int64_t(STEPS_PER_REV) * reelGearTeeth[i];
    const int64_t denominator = measuredStepsPerTurn[i] > 0 ? 1 : motorGearTeeth[i];
    // Extra complete reel revolutions produce staggered stopping.
    const int symbol = outcomeSymbol(target, i);
    const auto plan = planMove(symbolsAt[i], symbol, 2 + i, SYMBOL_COUNT,
                               numerator, denominator, roundingCarry[i]);
    roundingCarry[i] = plan.remainder;
    symbolsAt[i] = symbol;
    reels[i]->setCurrentPosition(0);
    reels[i]->moveTo(plan.pulses);
  }
  digitalWrite(LED_PIN, HIGH);
  moving = true;
  return true;
}

bool tickOutcome() {
  if (!moving) return false;
  bool remaining = false;
  for (auto reel : reels) {
    reel->run();
    remaining |= reel->distanceToGo() != 0;
  }
  if (remaining) return false;
  moving = false;
  digitalWrite(LED_PIN, LOW);
  // Shared EN remains low for holding torque. A reboot requires realignment.
  return true;
}
