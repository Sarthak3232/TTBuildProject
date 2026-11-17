#pragma once
#include <Arduino.h>
// Three-motor test: regular ESP32 (WROOM-32) + three TMC2209 drivers (UART) + three NEMA 17 motors
// Repeats forever:
//   1. checks that all three drivers answer, then sends each one its settings
//   2. spins motor 1, then motor 2, then motor 3 (forward, then back), so you can see which is which
//   3. spins all three together
//
// No Serial Monitor needed. The ESP32's blue LED:
//   ON while motors turn                    -> working
//   1, 2 or 3 blinks, pause, repeating      -> that driver isn't answering. Check its 24 V (VM),
//                                              its first UART pin, and its MS1/MS2 address wires.
//   (1 blink when driver 1 worked before usually means driver 2 or 3 has the wrong MS1/MS2
//    wiring and is answering on driver 1's address too.)
//
// Library: "TMCStepper" by teemuatlut (Arduino Library Manager)

#include <TMCStepper.h>

// ===================== SET THESE =====================
const int MOTOR_MA = 300;            // 17HS13-0404S: 300 (up to 400 for more torque, runs warmer)
const int MAX_RPM = 300;             // top speed in revolutions per minute
const int ACCEL_RPM_PER_SEC = 600;   // how fast it speeds up / slows down. Lower = gentler
const int TURNS = 3;                 // revolutions each way
// =====================================================

const int START_RPM = 30;            // speed it starts from and ends at
const int MICROSTEPS = 8;
const int STEPS_PER_REV = 200 * MICROSTEPS;   // 1600

const float R_SENSE = 0.11f;         // current-sense resistor on BTT TMC2209 V1.3 boards
const int EN_PIN = 13;               // D13, shared: LOW = all motors on, HIGH = off
const int TMC_RX = 16;               // RX2 (D16): straight to the UART line
const int TMC_TX = 17;               // TX2 (D17): through the 1k resistor to the UART line
const int LED_PIN = 2;               // blue on-board LED
const int STEP_PIN[3] = {25, 27, 32};   // motor 1, 2, 3
const int DIR_PIN[3]  = {26, 14, 33};

// All three share one UART wire. The address (set by MS1/MS2) decides which driver listens.
TMC2209Stepper driver1(&Serial2, R_SENSE, 0b00);   // MS1 GND,   MS2 GND
TMC2209Stepper driver2(&Serial2, R_SENSE, 0b01);   // MS1 3.3 V, MS2 GND
TMC2209Stepper driver3(&Serial2, R_SENSE, 0b10);   // MS1 GND,   MS2 3.3 V
TMC2209Stepper* drivers[3] = {&driver1, &driver2, &driver3};

// Checks one driver answers, then sends its settings. Returns false if it doesn't answer.
bool setupDriver(TMC2209Stepper& d) {
  d.begin();
  if (d.test_connection() != 0) return false;
  d.toff(4);                  // switch the output stage on
  d.pdn_disable(true);        // the PDN/UART pin is used for UART
  d.I_scale_analog(false);    // current is set here, not by the little knob
  d.mstep_reg_select(true);   // microsteps are set here, not by MS1/MS2 (those are the address now)
  d.rms_current(MOTOR_MA);
  d.microsteps(MICROSTEPS);
  d.en_spreadCycle(true);     // more torque at speed
  return true;
}

// Turns the chosen motors TURNS revolutions: speeds up from START_RPM to MAX_RPM, then slows down.
// which: bit 0 = motor 1, bit 1 = motor 2, bit 2 = motor 3 (0b111 = all three)
void turn(uint8_t which, bool forward) {
  const long total = (long)STEPS_PER_REV * TURNS;
  const float vMax = MAX_RPM * STEPS_PER_REV / 60.0f;              // steps per second
  const float v0 = START_RPM * STEPS_PER_REV / 60.0f;
  const float accel = ACCEL_RPM_PER_SEC * STEPS_PER_REV / 60.0f;   // steps per second, per second

  for (int m = 0; m < 3; m++) {
    if (which & (1 << m)) digitalWrite(DIR_PIN[m], forward ? HIGH : LOW);
  }
  digitalWrite(LED_PIN, HIGH);
  uint32_t next = micros();
  for (long s = 0; s < total; s++) {
    float vUp = sqrtf(v0 * v0 + 2.0f * accel * s);
    float vDown = sqrtf(v0 * v0 + 2.0f * accel * (total - 1 - s));
    float v = fminf(vMax, fminf(vUp, vDown));

    for (int m = 0; m < 3; m++) {
      if (which & (1 << m)) digitalWrite(STEP_PIN[m], HIGH);
    }
    delayMicroseconds(2);
    for (int m = 0; m < 3; m++) {
      if (which & (1 << m)) digitalWrite(STEP_PIN[m], LOW);
    }

    next += (uint32_t)(1000000.0f / v);         // time of the next step
    while ((int32_t)(micros() - next) < 0) { }   // wait for it
  }
  digitalWrite(LED_PIN, LOW);
}

// Blinks the LED n times, then pauses
void blinkCode(int n) {
  for (int k = 0; k < n; k++) {
    digitalWrite(LED_PIN, HIGH); delay(250);
    digitalWrite(LED_PIN, LOW);  delay(250);
  }
  delay(1200);
}

void setupMotors() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(EN_PIN, OUTPUT);
  digitalWrite(EN_PIN, HIGH);      // motors off until every driver is set up
  for (int m = 0; m < 3; m++) {
    pinMode(STEP_PIN[m], OUTPUT);
    pinMode(DIR_PIN[m], OUTPUT);
  }
  Serial2.begin(115200, SERIAL_8N1, TMC_RX, TMC_TX);
}


bool jog(int index) {
  digitalWrite(EN_PIN, HIGH);
  if (!setupDriver(*drivers[index])) return false;
  digitalWrite(EN_PIN, LOW);
  turn(1 << index, true);
  digitalWrite(EN_PIN, HIGH);
  return true;
}
