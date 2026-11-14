#pragma once

#include <Arduino.h>
#include <AccelStepper.h>

struct ReelConfig {
  int stepPin;
  int dirPin;
  int homePin;
  bool reverse;
  bool homeActiveLow;
  uint16_t motorSteps;
  uint16_t microsteps;
  uint16_t motorTeeth;
  uint16_t reelTeeth;
  uint8_t symbols;
  long homeToSymbolZero;
};

class Reel {
 public:
  enum class State { Unhomed, Clearing, Seeking, Aligning, Ready, Spinning, Jogging, Fault };

  explicit Reel(const ReelConfig &config)
      : config_(config),
        motor_(AccelStepper::DRIVER, config.stepPin, config.dirPin, 0, 0, false) {}

  bool valid() const {
    const auto &c = config_;
    if (c.stepPin < 0 || c.dirPin < 0 || c.homePin < 0 ||
        c.stepPin > 254 || c.dirPin > 254 || c.homePin > 254 ||
        !c.motorSteps || !c.microsteps || !c.motorTeeth || !c.reelTeeth ||
        c.symbols < 2) {
      return false;
    }
    return pulseNumerator() >= int64_t(c.symbols) * c.motorTeeth &&
           pulsesPerTurn() <= 1000000 &&
           c.homeToSymbolZero >= 0 && c.homeToSymbolZero < pulsesPerTurn();
  }

  void begin() {
    if (config_.homePin >= 0) {
      pinMode(config_.homePin, config_.homeActiveLow ? INPUT_PULLUP : INPUT);
    }
    motor_.setPinsInverted(config_.reverse, false, false);
    motor_.setMinPulseWidth(2);
    motor_.enableOutputs();
    motor_.setAcceleration(800);
    motor_.setMaxSpeed(1000);
  }

  State state() const { return state_; }
  bool busy() const {
    return state_ == State::Clearing || state_ == State::Seeking ||
           state_ == State::Aligning || state_ == State::Spinning || state_ == State::Jogging;
  }
  bool atHomeMarker() const { return homeActive(); }
  bool acceptsSymbol(int symbol) const {
    return state_ == State::Ready && symbol >= 0 && symbol < config_.symbols;
  }

  void home() {
    startHomePhase(homeActive() ? State::Clearing : State::Seeking);
  }

  void jog() {
    motor_.setCurrentPosition(0);
    motor_.setMaxSpeed(250);
    motor_.moveTo(50);
    state_ = State::Jogging;
  }

  // The application chooses the result. Firmware only positions the reel.
  void moveToSymbol(int symbol, int fullTurns) {
    const int forwardSymbols = (symbol - symbol_ + config_.symbols) % config_.symbols;
    const int64_t symbolUnits = fullTurns * config_.symbols + forwardSymbols;
    const int64_t denominator = int64_t(config_.motorTeeth) * config_.symbols;
    const int64_t exact = symbolUnits * pulseNumerator() + roundingRemainder_;
    const long pulses = (exact + denominator / 2) / denominator;
    // Carry fractional pulses between moves so non-integer ratios do not drift.
    roundingRemainder_ = exact - pulses * denominator;
    symbol_ = symbol;
    motor_.setCurrentPosition(0);
    motor_.setMaxSpeed(1000);
    motor_.moveTo(pulses);
    state_ = State::Spinning;
  }

  void tick() {
    switch (state_) {
      case State::Clearing:
      case State::Seeking:
        tickHome();
        break;
      case State::Aligning:
      case State::Spinning:
      case State::Jogging:
        motor_.run();
        if (motor_.distanceToGo() == 0) {
          state_ = state_ == State::Jogging ? State::Unhomed : State::Ready;
        }
        break;
      default:
        break;
    }
  }

 private:
  int64_t pulseNumerator() const {
    return int64_t(config_.motorSteps) * config_.microsteps * config_.reelTeeth;
  }

  int64_t pulsesPerTurn() const {
    return (pulseNumerator() + config_.motorTeeth - 1) / config_.motorTeeth;
  }

  bool homeActive() const {
    return digitalRead(config_.homePin) == (config_.homeActiveLow ? LOW : HIGH);
  }

  void startHomePhase(State phase) {
    state_ = phase;
    edgePending_ = false;
    motor_.setCurrentPosition(0);
    motor_.setMaxSpeed(250);
    motor_.setSpeed(250);
  }

  void tickHome() {
    const bool edgeReached = homeActive() == (state_ == State::Seeking);
    if (edgeReached) {
      // Hold still while confirming the edge to avoid speed-dependent overshoot.
      if (!edgePending_) {
        edgePending_ = true;
        edgeSince_ = millis();
      }
      if (millis() - edgeSince_ < 3) return;
      if (state_ == State::Clearing) {
        startHomePhase(State::Seeking);
        return;
      }
      motor_.setCurrentPosition(0);
      motor_.moveTo(config_.homeToSymbolZero);
      symbol_ = 0;
      roundingRemainder_ = 0;
      state_ = State::Aligning;
      return;
    }

    edgePending_ = false;
    if (motor_.currentPosition() >= pulsesPerTurn() + 8) {
      motor_.setCurrentPosition(0);
      state_ = State::Fault;
      return;
    }
    motor_.runSpeed();
  }

  const ReelConfig config_;
  AccelStepper motor_;
  State state_ = State::Unhomed;
  int symbol_ = 0;
  int64_t roundingRemainder_ = 0;
  bool edgePending_ = false;
  unsigned long edgeSince_ = 0;
};
