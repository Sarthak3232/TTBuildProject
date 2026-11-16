// WROOM-32 bench diagnostic. Use only after confirming soldered pin assignments.
#include <Arduino.h>
#include <driver/gpio.h>
#include <TMCStepper.h>

constexpr int ledPin = 2;
constexpr uint8_t tmc2209Version = 0x21;
TMC2209Stepper first(&Serial2, 0.11f, 0);
TMC2209Stepper second(&Serial2, 0.11f, 1);
TMC2209Stepper third(&Serial2, 0.11f, 2);
TMC2209Stepper* const drivers[] = {&first, &second, &third};

void setup() {
  gpio_set_level(GPIO_NUM_13, 1); // Shared active-low enable stays inactive.
  gpio_set_direction(GPIO_NUM_13, GPIO_MODE_OUTPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17);
  delay(500);
}

void loop() {
  unsigned firstMissing = 0;
  for (unsigned i = 0; i < 3; ++i) {
    const uint8_t version = drivers[i]->version(); // Read IOIN; no configuration writes.
    Serial.printf("Driver %u: version 0x%02X\n", i + 1, version);
    if (!firstMissing && version != tmc2209Version) firstMissing = i + 1;
  }
  if (firstMissing == 0) {
    digitalWrite(ledPin, HIGH);
  } else {
    for (unsigned i = 0; i < firstMissing; ++i) {
      digitalWrite(ledPin, HIGH);
      delay(250);
      digitalWrite(ledPin, LOW);
      delay(250);
    }
  }
  delay(1500);
}
