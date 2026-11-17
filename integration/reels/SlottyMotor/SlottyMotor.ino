// SLOTTY MOTOR BOARD (two-board setup)
// Runs the team's motion code unchanged (bench_motor.h, outcome_motion.h, drawer_control.h and their
// config files). Wi-Fi stays off on this board. The WiFi board sends it commands over two wires:
//   WiFi board D17 (TX2) -> this board D18 (RX)
//   WiFi board D16 (RX2) <- this board D19 (TX)
//   GND <-> GND
// Each command line is "<seq> <COMMAND> [args]" and gets one reply: "R <seq> <1|0> <state>".
// It also reports by itself: "E OUT" when the reels stop, "E DRAWER" when a drawer sequence
// finishes or faults, "E BOOT" after a restart, "E STOPPED" when this board's BOOT button stops
// motion, and a "S <state>" heartbeat every 250 ms.
// <state> is 8 digits: aligned, moving, drawerHardwareReady, drawersClosed, drawerFault,
// drawerJogging, drawerSequence.phase (0-5), drawerTimingConfirmed.
//
// Libraries: "TMCStepper" by teemuatlut, "AccelStepper" by Mike McCauley,
//            "Adafruit PWM Servo Driver Library" by Adafruit.
// Upload settings for this board: Flash Frequency 40MHz, Flash Mode DIO.

#include "bench_motor.h"
#include "outcome_motion.h"
#include "drawer_control.h"

const int LINK_RX = 18;      // D18: from the WiFi board's D17
const int LINK_TX = 19;      // D19: to the WiFi board's D16
const int motorStopButtonPin = 0;      // this board's BOOT button also stops motion, like the single-board version

String linkBuf;
uint32_t lastBeatMs = 0;
uint32_t lastCommandMs = 0;
constexpr uint32_t controllerTimeoutMs = 5000;

String stateCode() {
  char s[9];
  s[0] = aligned ? '1' : '0';
  s[1] = moving ? '1' : '0';
  s[2] = drawerHardwareReady ? '1' : '0';
  s[3] = drawersClosed ? '1' : '0';
  s[4] = drawerFault ? '1' : '0';
  s[5] = drawerJogging ? '1' : '0';
  s[6] = char('0' + int(drawerSequence.phase));
  s[7] = drawerTimingConfirmed ? '1' : '0';
  s[8] = 0;
  return String(s);
}

void sendLine(const String& line) { Serial1.println(line); }

// The hardware half of the team's stopAll(): reels released, LED off, drawers stopped
void stopMotion() {
  moving = false;
  aligned = false;
  digitalWrite(EN_PIN, HIGH);
  digitalWrite(LED_PIN, LOW);
  if (drawerHardwareReady) stopDrawers();
}

bool runCommand(const String& cmd, const String& arg) {
  if (cmd == "HELLO") return true;
  if (cmd == "STOP") { stopMotion(); return true; }
  if (moving || drawersBusy()) return false;
  if (cmd == "CAL") return validCalibration();
  if (cmd == "ALIGN") return confirmAlignment();
  if (cmd == "OUT") return startOutcome(arg.toInt());
  if (cmd == "INITDRAWERS") return initializeDrawers();
  if (cmd == "STOPDRAWERS") return stopDrawers();
  if (cmd == "START") return startDrawer(arg.toInt(), millis());
  if (cmd == "JOG") {
    int sp = arg.indexOf(' ');
    if (sp < 0) return false;
    return jogDrawer(arg.substring(0, sp).toInt(), arg.substring(sp + 1) == "1", millis());
  }
  if (cmd == "CLOSED") { drawersClosed = (arg == "1"); return true; }
  if (cmd == "STOP") { stopMotion(); return true; }
  return false;
}

void handleLine(const String& line) {
  int a = line.indexOf(' ');
  if (a < 0) return;
  String seq = line.substring(0, a);
  String rest = line.substring(a + 1);
  int b = rest.indexOf(' ');
  String cmd = b < 0 ? rest : rest.substring(0, b);
  String arg = b < 0 ? String("") : rest.substring(b + 1);
  lastCommandMs = millis();
  bool ok = runCommand(cmd, arg);
  sendLine("R " + seq + (ok ? " 1 " : " 0 ") + stateCode());
  if (!moving) Serial.println(cmd + " " + arg + (ok ? " -> ok" : " -> refused"));
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("SLOTTY MOTOR BOARD START");
  setupMotors();
  pinMode(motorStopButtonPin, INPUT_PULLUP);
  Serial1.begin(115200, SERIAL_8N1, LINK_RX, LINK_TX);
  sendLine("E BOOT " + stateCode());
}

void loop() {
  unsigned budget = 64;
  while (Serial1.available() && budget--) {
    char c = (char)Serial1.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String line = linkBuf;
      linkBuf = "";
      line.trim();
      if (line.length()) handleLine(line);
      continue;
    }
    if (linkBuf.length() < 64) linkBuf += c;
  }

  static bool stopLatched = false;               // BOOT on this board: stop, then tell the WiFi board
  if (digitalRead(motorStopButtonPin) == LOW) {
    if (!stopLatched && (moving || drawersBusy())) {
      stopMotion();
      sendLine("E STOPPED " + stateCode());
    }
    stopLatched = true;
  } else {
    stopLatched = false;
  }

  if ((moving || drawersBusy()) &&
      uint32_t(millis() - lastCommandMs) > controllerTimeoutMs) {
    stopMotion();
    sendLine("E LINKLOST " + stateCode());
  }
  if (moving && tickOutcome()) sendLine("E OUT " + stateCode());
  if (tickDrawer(millis())) sendLine("E DRAWER " + stateCode());
  if (millis() - lastBeatMs >= 250) {
    lastBeatMs = millis();
    sendLine("S " + stateCode());
  }
}
