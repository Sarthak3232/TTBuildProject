// Manual WROOM-32 bench jog. Pin assignments follow the supplied perfboard plan.
#include <Arduino.h>
#include <driver/gpio.h>
#include <TMCStepper.h>

constexpr gpio_num_t enablePin = GPIO_NUM_13;  // Shared, active low.
constexpr gpio_num_t stepPins[] = {GPIO_NUM_25, GPIO_NUM_27, GPIO_NUM_32};
constexpr gpio_num_t directionPins[] = {GPIO_NUM_26, GPIO_NUM_14, GPIO_NUM_33};
constexpr unsigned pulseCount = 400;  // Nominal quarter turn at 8 microsteps.
constexpr int ledPin = 2;
TMC2209Stepper driver1(&Serial2, 0.11f, 0);
TMC2209Stepper driver2(&Serial2, 0.11f, 1);
TMC2209Stepper driver3(&Serial2, 0.11f, 2);
TMC2209Stepper* const drivers[] = {&driver1, &driver2, &driver3};

void setupMotors() {
  // Preload the output latch before switching the pin to output mode.
  gpio_set_level(enablePin, 1);
  gpio_set_direction(enablePin, GPIO_MODE_OUTPUT);
  for (int i = 0; i < 3; ++i) {
    gpio_set_level(stepPins[i], 0);
    gpio_set_direction(stepPins[i], GPIO_MODE_OUTPUT);
    gpio_set_level(directionPins[i], 0);
    gpio_set_direction(directionPins[i], GPIO_MODE_OUTPUT);
  }
  pinMode(0, INPUT_PULLUP);  // BOOT button on the classic ESP32 DevKit.
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17);
}

void indicateFailure() {
  Serial.println("ERR driver UART or configuration");
  for (int i = 0; i < 3; ++i) {
    digitalWrite(ledPin, HIGH);
    delay(120);
    digitalWrite(ledPin, LOW);
    delay(160);
  }
}

bool jog(int index) {
  TMC2209Stepper& d = *drivers[index];
  if (d.version() == 0x21) {
    d.begin();
    d.toff(4);
    d.pdn_disable(true);
    d.I_scale_analog(false);
    d.mstep_reg_select(true);
    d.rms_current(300);
    d.microsteps(8);
    d.en_spreadCycle(true);
    if (d.microsteps() == 8 && d.toff() == 4 && d.mstep_reg_select()) {
      digitalWrite(ledPin, HIGH);
    } else {
      indicateFailure();
      return false;
    }
  } else {
    indicateFailure();
    return false;
  }
  Serial.printf("OK jog %d\n", index + 1);
  gpio_set_level(enablePin, 0);
  delay(2);
  for (unsigned pulse = 0; pulse < pulseCount; ++pulse) {
    gpio_set_level(stepPins[index], 1);
    delayMicroseconds(10);
    gpio_set_level(stepPins[index], 0);
    delayMicroseconds(2000);
  }
  gpio_set_level(enablePin, 1);
  digitalWrite(ledPin, LOW);
  Serial.printf("DONE jog %d pulses=%u\n", index + 1, pulseCount);
  return true;
}


