// Manual WROOM-32 bench jog. Pin assignments follow the supplied perfboard plan.
#include <Arduino.h>
#include <driver/gpio.h>

constexpr gpio_num_t enablePin = GPIO_NUM_13;  // Shared, active low.
constexpr gpio_num_t stepPins[] = {GPIO_NUM_25, GPIO_NUM_27, GPIO_NUM_32};
constexpr gpio_num_t directionPins[] = {GPIO_NUM_26, GPIO_NUM_14, GPIO_NUM_33};
constexpr unsigned pulseCount = 200;

void setup() {
  // Preload the output latch before switching the pin to output mode.
  gpio_set_level(enablePin, 1);
  gpio_set_direction(enablePin, GPIO_MODE_OUTPUT);
  for (int i = 0; i < 3; ++i) {
    gpio_set_level(stepPins[i], 0);
    gpio_set_direction(stepPins[i], GPIO_MODE_OUTPUT);
    gpio_set_level(directionPins[i], 0);
    gpio_set_direction(directionPins[i], GPIO_MODE_OUTPUT);
  }
  Serial.begin(115200);
}

void loop() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "status") {
    Serial.println("READY BENCH JOG");
    return;
  }
  if (line.length() != 5 || !line.startsWith("jog ") ||
      line[4] < '1' || line[4] > '3') {
    Serial.println("ERR expected status or jog 1/2/3");
    return;
  }
  const int index = line[4] - '1';
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
  Serial.printf("DONE jog %d pulses=%u\n", index + 1, pulseCount);
}
