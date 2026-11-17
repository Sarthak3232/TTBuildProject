// Tests the actual two-board Wi-Fi-side UART implementation with a clock/UART double.
// g++ -std=c++11 -I integration/reels/tests/native integration/reels/test_motion_link.cpp -o /tmp/slotty-link-test
#include <assert.h>
#include <sstream>
#include "SlottyWifi/motion_link.h"
#include "SlottyWifi/demo_policy.h"

namespace ServoSettings {
#include "SlottyMotor/drawer_config.h"
}
bool eventActive = false;
int stopCalls = 0;
void stopAll() {
  ++stopCalls;
  linkStopAll();
  eventActive = false;
  aligned = false;
  moving = false;
}

int main() {
  assert(ServoSettings::drawerSdaPin == 21);
  assert(ServoSettings::drawerSclPin == 22);
  assert(ServoSettings::drawerPcaAddress == 0x40);
  for(int i=0; i<4; i++) {
    assert(ServoSettings::drawerChannels[i] == unsigned(i));
    assert(ServoSettings::drawerStopUs[i] == 1500);
    assert(ServoSettings::drawerOpenUs[i] == 1300);
    assert(ServoSettings::drawerCloseUs[i] == 1700);
    assert(ServoSettings::drawerAvailable[i] == (i==0));
  }

  for (int target=0; target<5; target++)
    assert(demoDrawerAvailable(target) == (target==0));

  std::string motorState = "00100001";
  bool silent = false;
  bool refuseClosed = false;
  int motionCalls = 0;
  Serial2.onTransmit = [&](const std::string& line) {
    if(silent) return;
    std::istringstream input(line);
    int seq;
    std::string cmd;
    input >> seq >> cmd;
    bool ok = true;
    if(cmd=="ALIGN") motorState[0]='1';
    if(cmd=="OUT") { motorState[1]='1'; ++motionCalls; }
    if(cmd=="STOP") { motorState[0]='0'; motorState[1]='0'; }
    if(cmd=="CLOSED") {
      if(refuseClosed) ok=false;
      else { int closed; input>>closed; motorState[3]=closed?'1':'0'; }
    }
    Serial2.inject("R "+std::to_string(seq)+(ok?" 1 ":" 0 ")+motorState+"\n");
  };
  setupMotors();
  assert(linkUp);
  assert(confirmAlignment());
  assert(aligned && !linkFault);
  drawersClosed = true;
  assert(bool(drawersClosed));
  refuseClosed = true;
  drawersClosed = false;
  assert(bool(drawersClosed)); // A refused update must preserve actual remote state.
  refuseClosed = false;
  drawersClosed = false;
  assert(!bool(drawersClosed));
  assert(startOutcome(0));
  assert(moving && motionCalls==1);
  motorState[1]='0';
  Serial2.inject("E OUT "+motorState+"\n");
  assert(tickOutcome());
  assert(!tickOutcome());
  assert(!moving);
  assert(confirmAlignment());
  eventActive = true;
  silent = true;
  testMillis += LINK_TIMEOUT_MS+1;
  linkPoll();
  assert(linkFault);
  assert(!aligned && !moving && !eventActive);
  assert(stopCalls==1);

  // A timeout after a command may conceal execution and must remain uncertain.
  assert(!startOutcome(0));
  assert(linkFault);

  silent = false;
  linkRead();
  linkPoll();
  assert(confirmAlignment());
  assert(!linkFault);
  eventActive = true;
  motorState[0]='0';
  Serial2.inject("E BOOT "+motorState+"\n");
  linkPoll();
  assert(linkFault && !eventActive);
  assert(stopCalls>=2);
}
