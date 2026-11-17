// PCA9685 servo board test: upload to the perfboard ESP32 (the motor board). Re-upload SlottyMotor after.
// Checks in order, and repeats every ~15 s so you can wiggle wires and watch the result change:
//   1. SDA/SCL lines     2. chip answers on I2C     3. settings stick (write + read back)
//   4. chip outputs a real signal (optional jumper)  5. servos CH0-CH3 move   6. LEDs CH4-CH7 blink
//
// Open the Serial Monitor at 115200 baud for the details. The blue LED also shows the result:
//   1 blink, repeating  -> SDA or SCL stuck LOW: short to GND, swapped wire, or a part holding the line
//   2 blinks            -> nothing answers on I2C: check SDA->D21, SCL->D22, VCC->3.3 V, GND->GND
//   3 blinks            -> something answers, but not at 0x40: are any address pads (A0-A5) bridged?
//   4 blinks            -> chip answers but settings don't stick: loose SDA/SCL, bad joint, or bad chip
//   ON                  -> chip passed; servo test running. If servos still don't move, read the
//                          checklist the Serial Monitor prints after the servo test.
//
// OPTIONAL signal check: a jumper wire from the CH15 signal pin (PWM row, nearest the chip) to D34.
// The test then measures the chip's real output, which separates "chip not putting out pulses"
// (OE pin high, bad chip) from "servos not getting power" (V+).
//
// Library: "Adafruit PWM Servo Driver Library" by Adafruit (Arduino Library Manager).

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ===================== SET THESE =====================
const int STOP_US = 1500;        // servo stands still (FS90MR neutral)
const int SPEED_US = 150;        // distance from stop for the test: big enough to see clearly
const int RUN_MS = 1000;         // how long each servo runs each way
// =====================================================

const int SDA_PIN = 21;
const int SCL_PIN = 22;
const uint8_t PCA_ADDR = 0x40;
const uint8_t ALLCALL_ADDR = 0x70;   // a PCA9685 also answers here by default
const int LED_PIN = 2;
const int LOOPBACK_PIN = 34;         // optional jumper from CH15's signal pin
const int LOOPBACK_CH = 15;

Adafruit_PWMServoDriver pca(PCA_ADDR);

void blinkCode(int n) {              // n blinks, then a pause; repeated for ~3 s
  for (int rep = 0; rep < 2; rep++) {
    for (int k = 0; k < n; k++) {
      digitalWrite(LED_PIN, HIGH); delay(200);
      digitalWrite(LED_PIN, LOW);  delay(250);
    }
    delay(1000);
  }
}

// 1. With the I2C driver off, both lines should sit HIGH (the board's pull-ups to its VCC)
bool linesOK() {
  Wire.end();
  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, INPUT_PULLUP);
  delay(5);
  int sda = digitalRead(SDA_PIN), scl = digitalRead(SCL_PIN);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setTimeOut(50);
  Serial.printf("1. Lines:   SDA (D21) %s, SCL (D22) %s\n", sda ? "HIGH ok" : "LOW  <-- stuck", scl ? "HIGH ok" : "LOW  <-- stuck");
  if (!sda || !scl) {
    Serial.println("   A line held LOW: look for a solder bridge to GND, SDA/SCL swapped onto a GND pin,");
    Serial.println("   or the board's VCC/GND reversed. Unplug the servo board: if the line goes HIGH, the fault is on it.");
  }
  return sda && scl;
}

// 2. Which I2C addresses answer
int scan(bool& pcaHere, bool& allCallHere) {
  int found = 0;
  pcaHere = allCallHere = false;
  Serial.print("2. Scan:    ");
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      found++;
      Serial.printf("0x%02X ", a);
      if (a == PCA_ADDR) pcaHere = true;
      if (a == ALLCALL_ADDR) allCallHere = true;
    }
  }
  if (!found) Serial.print("nothing answered");
  Serial.println();
  if (!found) {
    Serial.println("   Check: SDA -> D21, SCL -> D22 (not swapped), VCC -> 3.3 V, GND -> GND. Measure VCC to GND on the");
    Serial.println("   servo board: about 3.3 V. The servo board's power LED should be on.");
  } else if (!pcaHere) {
    Serial.println("   Something answers but not 0x40. If 0x70 is there, it's the PCA9685 with an address pad bridged:");
    Serial.println("   check the A0-A5 pads on the board for solder blobs. 0x3C/0x3D would be the OLED screens.");
  } else {
    Serial.println("   0x40 found: the PCA9685 answers.");
  }
  return found;
}

bool readRegs(uint8_t reg, uint8_t* buf, uint8_t n) {
  Wire.beginTransmission(PCA_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom((uint8_t)PCA_ADDR, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

// 3. Set it up like the slot machine firmware, then write a test value and read it back
bool registersOK() {
  pca.begin();
  pca.setOscillatorFrequency(25000000);
  pca.setPWMFreq(50);
  uint8_t prescale = pca.readPrescale();
  pca.setPWM(14, 0, 1234);                         // test pattern on an unused channel
  uint8_t r[4] = {0, 0, 0, 0}, mode1 = 0xFF;
  bool readOK = readRegs(0x06 + 4 * 14, r, 4) && readRegs(0x00, &mode1, 1);
  int off = r[2] | ((r[3] & 0x1F) << 8);
  bool asleep = mode1 & 0x10;
  bool ok = readOK && prescale == 121 && off == 1234 && !asleep;
  Serial.printf("3. Settings: prescale %u (want 121), test value %d (want 1234), %s -> %s\n", prescale, off,
                asleep ? "chip ASLEEP" : "chip awake", ok ? "OK" : "FAILED");
  if (!ok) Serial.println("   It answers but doesn't hold settings: reseat SDA/SCL, reflow the header joints, check GND.");
  pca.setPWM(14, 0, 0);
  return ok;
}

// 4. Optional: measure the chip's actual pulses through the jumper CH15 -> D34
void loopbackCheck() {
  pca.writeMicroseconds(LOOPBACK_CH, STOP_US);
  delay(60);
  unsigned long us = pulseIn(LOOPBACK_PIN, HIGH, 60000);
  if (us == 0) {
    Serial.println("4. Signal:  nothing on D34. Fine if you didn't fit the CH15 -> D34 jumper.");
    Serial.println("   If you did: the chip isn't putting out pulses. OE must go to GND (or be left unconnected), not 3.3 V.");
  } else {
    Serial.printf("4. Signal:  CH15 measures %lu us (sent %d). The chip's outputs work", us, STOP_US);
    if (us < STOP_US * 0.9 || us > STOP_US * 1.1) Serial.print(" (its clock runs off; servos may creep at stop)");
    Serial.println(".");
  }
  pca.setPWM(LOOPBACK_CH, 0, 0);
}

// 5 + 6. Move each servo both ways, then blink each LED
void servoAndLedTest() {
  digitalWrite(LED_PIN, HIGH);
  for (int ch = 0; ch < 4; ch++) {
    Serial.printf("5. Servo CH%d (drawer %d): one way...", ch, ch + 1);
    pca.writeMicroseconds(ch, STOP_US + SPEED_US); delay(RUN_MS);
    pca.writeMicroseconds(ch, STOP_US);            delay(400);
    Serial.print(" other way...");
    pca.writeMicroseconds(ch, STOP_US - SPEED_US); delay(RUN_MS);
    pca.writeMicroseconds(ch, STOP_US);            delay(400);
    Serial.println(" stop");
  }
  Serial.print("6. LEDs CH4-CH7, one at a time:");
  for (int ch = 4; ch < 8; ch++) {
    Serial.printf(" CH%d", ch);
    pca.setPWM(ch, 4096, 0); delay(350);           // fully on
    pca.setPWM(ch, 0, 4096); delay(150);           // fully off
  }
  Serial.println();
  digitalWrite(LED_PIN, LOW);
  Serial.println("   The chip passed. If a servo didn't move:");
  Serial.println("   - V+: measure V+ to GND on the servo header with the battery on. It should read about 5 V.");
  Serial.println("   - Plug: brown/black wire on the GND row, red on V+, orange/yellow/white on the PWM signal row.");
  Serial.println("   - OE: must be on GND or unconnected. On 3.3 V every output is off (step 4 would show nothing).");
  Serial.println("   - If only one servo is dead, swap it to another channel: dead on every channel = bad servo.");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(LED_PIN, OUTPUT);
  pinMode(LOOPBACK_PIN, INPUT);
  Wire.begin(SDA_PIN, SCL_PIN);
  Serial.println("\n=== PCA9685 servo board test ===");
}

void loop() {
  Serial.println("\n----- test round -----");
  if (!linesOK()) { blinkCode(1); return; }
  bool pcaHere, allCallHere;
  int found = scan(pcaHere, allCallHere);
  if (!found) { blinkCode(2); return; }
  if (!pcaHere) { blinkCode(3); return; }
  if (!registersOK()) { blinkCode(4); return; }
  loopbackCheck();
  servoAndLedTest();
  delay(2000);
}
