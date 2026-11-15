// USB protocol demonstration only. No motor pins are configured.
#include <Arduino.h>

bool homed = false;
void setup() {
  Serial.begin(115200);
}

void loop() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "status") {
    Serial.println("READY SLOTTY USB SIM V1");
  } else if (line == "home") {
    Serial.println("SIM OK homing");
    homed = true;
    Serial.println("SIM DONE home");
  } else if (homed && line.length() == 6 && line.startsWith("spin ") &&
             line[5] >= '0' && line[5] <= '7') {
    Serial.println("SIM OK spinning");
    Serial.println("SIM DONE spin");
  } else {
    Serial.println("ERR expected status, home, or a valid spin after home");
  }
}
