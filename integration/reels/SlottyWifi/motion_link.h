#pragma once
// TWO-BOARD LINK, WiFi board side.
// Replaces bench_motor.h, outcome_motion.h and drawer_control.h on this board. It keeps the same
// function and variable names the main sketch uses, but each call is sent over two wires to the
// motor board, which runs the team's real motion code and reports back.
//   this board D17 (TX2) -> motor board D18
//   this board D16 (RX2) <- motor board D19
//   GND <-> GND
// If the motor board goes silent or restarts, anything in progress is stopped and its receipt
// becomes "unconfirmed", the same rule the single-board firmware uses for restarted events.
#include <Arduino.h>
#include "link_config.h"
#include "drawer_sequence.h"

const int EN_PIN = 13;     // not wired on this board; the motor board drives the real EN line
const int LED_PIN = 2;     // blue LED: on while the reels move, as on the single-board version
const int LINK_RX = 16;    // D16 (RX2)
const int LINK_TX = 17;    // D17 (TX2)
const uint32_t LINK_TIMEOUT_MS = 2000;   // motor board sends a heartbeat every 250 ms

// ---- copies of the motor board's state, refreshed by every message it sends
bool aligned = false;
bool moving = false;
bool drawerHardwareReady = false;
bool drawerFault = false;
bool drawerJogging = false;
bool drawerTimingConfirmed = false;   // comes from the motor board's drawer_config.h
DrawerSequence drawerSequence;        // only .phase and .busy() are used on this board

// drawersClosed is written by the main sketch (/drawers-closed and the offline fixture);
// each write is forwarded to the motor board, where startDrawer() checks it.
void linkSetClosed(bool closed);
struct RemoteFlag {
  bool value = false;
  RemoteFlag& operator=(bool v) { linkSetClosed(v); return *this; }
  operator bool() const { return value; }
};
RemoteFlag drawersClosed;

extern bool eventActive;   // defined in the main sketch
void stopAll();            // defined in the main sketch

bool outcomeDone = false, drawerDone = false;
bool motorRebooted = false, motorStopped = false;
bool linkUp = false, linkWasLost = false, needResync = false;
bool linkFault = false;
uint32_t lastHeardMs = 0;
uint16_t rpcSeq = 0;
int replySeq = -1;
bool replyOk = false;
String linkBuf;

void applyState(const String& st) {
  if (st.length() != 8) return;
  aligned = st[0] == '1';
  moving = st[1] == '1';
  drawerHardwareReady = st[2] == '1';
  drawersClosed.value = st[3] == '1';
  drawerFault = st[4] == '1';
  drawerJogging = st[5] == '1';
  drawerSequence.phase = DrawerPhase(st[6] - '0');
  drawerTimingConfirmed = st[7] == '1';
  digitalWrite(LED_PIN, moving ? HIGH : LOW);
}

void handleLinkLine(const String& line) {
  lastHeardMs = millis();
  if (!linkUp) {
    linkUp = true;
    if (linkWasLost) needResync = true;
  }
  int a = line.indexOf(' ');
  if (a < 0) return;
  String kind = line.substring(0, a);
  String rest = line.substring(a + 1);
  int b = rest.lastIndexOf(' ');
  String st = b < 0 ? rest : rest.substring(b + 1);
  if (kind == "S") {
    applyState(rest);
  } else if (kind == "R") {                       // R <seq> <ok> <state>
    int c = rest.indexOf(' ');
    if (c < 0) return;
    applyState(st);
    replyOk = rest.substring(c + 1, c + 2) == "1";
    replySeq = rest.substring(0, c).toInt();
  } else if (kind == "E") {                       // E <name> <state>
    String name = b < 0 ? rest : rest.substring(0, b);
    applyState(st);
    if (name == "OUT") outcomeDone = true;
    else if (name == "DRAWER") drawerDone = true;
    else if (name == "LINKLOST") {
      linkFault = true;
      motorStopped = true;
    }
    else if (name == "BOOT") motorRebooted = true;
    else if (name == "STOPPED") motorStopped = true;
  }
}

void linkRead() {
  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String line = linkBuf;
      linkBuf = "";
      line.trim();
      if (line.length()) handleLinkLine(line);
      continue;
    }
    if (linkBuf.length() < 80) linkBuf += c;
  }
}

// Sends one command and waits for its reply; false if refused or no answer
bool rpc(const String& cmd, uint32_t timeoutMs = 400) {
  uint16_t seq = ++rpcSeq;
  replySeq = -1;
  Serial2.println(String(seq) + " " + cmd);
  uint32_t t0 = millis();
  while (millis() - t0 < timeoutMs) {
    linkRead();
    if (replySeq == seq) return replyOk;
    delay(1);
  }
  linkFault = true;
  aligned = false;
  Serial.println("LINK: motor board did not answer " + cmd);
  return false;
}

bool drawersBusy() { return drawerSequence.busy() || drawerJogging; }

bool initializeDrawers() { return rpc("INITDRAWERS", 1000); }

// Link housekeeping: lost link, motor-board restart, BOOT stop on the motor board
bool inLinkPoll = false;
void linkPoll() {
  linkRead();
  if (inLinkPoll) return;
  inLinkPoll = true;
  static uint32_t lastPingMs = 0;
  if (uint32_t(millis() - lastPingMs) >= 500) {
    lastPingMs = millis();
    Serial2.println(String(++rpcSeq) + " HELLO");
  }
  if (linkUp && millis() - lastHeardMs > LINK_TIMEOUT_MS) {
    linkUp = false;
    linkWasLost = true;
    linkFault = true;
    Serial.println("LINK LOST: motor board silent; stopping. Check D17->D18, D16<-D19, GND and its power");
    bool wasBusy = moving || drawersBusy() || eventActive;
    aligned = false;
    moving = false;
    drawerHardwareReady = false;
    drawerJogging = false;
    drawerSequence.phase = DrawerPhase::Stopped;
    if (wasBusy) stopAll();
  }
  if (motorRebooted || needResync) {
    linkFault = true;
    Serial.println(motorRebooted ? "Motor board restarted: realign reels before the next event"
                                 : "Motor board back: realign reels before the next event");
    motorRebooted = false;
    needResync = false;
    linkWasLost = false;
    if (eventActive) stopAll();       // an in-flight event becomes "unconfirmed"
    else rpc("STOP");                 // either way the reels must be realigned
    if (enableWifi || offlineIncludeDrawers || offlineDrawerCalibration) initializeDrawers();
  }
  if (motorStopped) {                 // the motor board's BOOT button stopped motion
    motorStopped = false;
    stopAll();
  }
  inLinkPoll = false;
}

// ---- the functions the main sketch calls, same names as on the single board

void setupMotors() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial2.begin(115200, SERIAL_8N1, LINK_RX, LINK_TX);
  for (int i = 0; i < 15 && !rpc("HELLO", 200); i++) {}
  motorRebooted = false;              // a BOOT notice seen during start-up needs no action
  Serial.println(linkUp ? "Motor board connected"
                        : "ERR motor board not answering: check D17->D18, D16<-D19, GND and its power");
}

bool validCalibration() { return rpc("CAL"); }
bool confirmAlignment() { bool ok = rpc("ALIGN", 3000); if (ok) linkFault = false; return ok; }   // checks all three drivers over UART

bool startOutcome(int target) {
  outcomeDone = false;
  return rpc("OUT " + String(target));
}

bool tickOutcome() {                  // true once, when the motor board reports the reels stopped
  linkPoll();
  if (!outcomeDone) return false;
  outcomeDone = false;
  return true;
}

bool stopDrawers() { return rpc("STOPDRAWERS"); }

bool startDrawer(int index, uint32_t) {
  drawerDone = false;
  return rpc("START " + String(index));
}

bool jogDrawer(int index, bool opening, uint32_t) {
  return rpc("JOG " + String(index) + (opening ? " 1" : " 0"));
}

bool tickDrawer(uint32_t) {           // true once, when a drawer sequence finishes or faults
  linkPoll();
  if (!drawerDone) return false;
  drawerDone = false;
  return true;
}

void linkSetClosed(bool closed) { rpc(closed ? "CLOSED 1" : "CLOSED 0"); }

bool linkStopAll() { bool ok = rpc("STOP"); outcomeDone = false; drawerDone = false; return ok; }
