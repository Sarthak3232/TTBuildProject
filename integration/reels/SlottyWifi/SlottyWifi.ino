// SLOTTY WIFI BOARD (two-board setup): the team's SlottyWifiJog sketch, unchanged except for the two
// lines marked TWO-BOARD. Network, endpoints, receipts, BOOT stop and the BOOT servo/fixture tests all
// work as before; motion runs on the motor board (SlottyMotor), reached through motion_link.h.
// Wiring: this board D17 -> motor board D18, D16 <- D19, GND <-> GND. Power this board from its own USB.
// Mode switches are in link_config.h. Upload settings: Flash Frequency 40MHz, Flash Mode DIO.
// No extra libraries needed on this board.

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "motion_link.h"     // TWO-BOARD: replaces bench_motor.h, outcome_motion.h, drawer_control.h
#include "demo_button.h"
#include "demo_policy.h"

// Empty SSID creates an offline AP. For Supabase use the laptop's private
// 2.4 GHz hotspot with internet. Keep actual credentials out of Git.
const char* stationName = "";
const char* stationPassword = "";
WebServer server(80);
Preferences receipts;
bool storageReady = false;
bool pending = false;
bool eventActive = false;
String lastEvent;
int pendingTarget = -1;

bool validId(const String& id) {
  if (id.length() != 36) return false;
  for (int i = 0; i < 36; i++) {
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (id[i] != '-') return false;
    } else if (!((id[i] >= '0' && id[i] <= '9') ||
                 (id[i] >= 'a' && id[i] <= 'f'))) return false;
  }
  return true;
}

String receiptKey(const String& id) {
  // NVS keys have a 15-character limit. Store and verify the full UUID too.
  return "e" + id.substring(0, 8) + id.substring(9, 13);
}

String recordPrefix(const String& id, int target) {
  return id + "|" + String(target) + "|";
}

bool saveReceipt(const String& id, int target, const String& status) {
  String record = recordPrefix(id, target) + status;
  return receipts.putString(receiptKey(id).c_str(), record) == record.length();
}

void stopAll();
void finishEvent(const String& status);

void acceptSpin() {
  String id = server.arg("id");
  String rawTarget = server.arg("target");
  if (!validId(id) || rawTarget.length() != 1 ||
      rawTarget[0] < '0' || rawTarget[0] > '4' ||
      server.header("X-Slotty-Bench") != "1") {
    server.send(400, "text/plain", "invalid event or target");
    return;
  }
  int target = rawTarget.toInt();
  if (!storageReady) {
    server.send(503, "text/plain", "receipt storage unavailable");
    return;
  }
  String old = receipts.getString(receiptKey(id).c_str(), "");
  String prefix = recordPrefix(id, target);
  if (old.length()) {
    if (!old.startsWith(prefix)) {
      server.send(409, "text/plain", "event conflict; no movement");
      return;
    }
    server.send(200, "text/plain", old.substring(prefix.length()));
    return;
  }
  if (!linkUp || linkFault || !aligned || pending || moving || drawersBusy() ||
      (demoDrawerAvailable(target) && (!drawerHardwareReady || !drawerTimingConfirmed || !drawersClosed))) {
    server.send(409, "text/plain", "align reels, confirm calibrated closed drawers, and wait for idle");
    return;
  }
  // Durable claim precedes pulses. Restarted inflight events require inspection.
  if (!saveReceipt(id, target, "unconfirmed")) {
    server.send(503, "text/plain", "could not claim event");
    return;
  }
  lastEvent = id;
  pendingTarget = target;
  pending = true;
  eventActive = true;
  server.send(202, "text/plain", "queued");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("SLOTTY WIFI REELS V4 START");
  setupMotors();
  pinMode(0, INPUT_PULLUP);
  if (enableWifi || offlineIncludeDrawers || offlineDrawerCalibration)
    Serial.println(initializeDrawers() ? "PCA9685 ready; verify servo neutral" : "ERR PCA9685 unavailable");
  storageReady = receipts.begin("slotty-events", false);
  if (!enableWifi) {
    Serial.println("OFFLINE FIXTURE DEMO: Wi-Fi disabled");
    if (offlineDrawerCalibration) {
      Serial.println("SERVO CALIBRATION: BOOT jogs CH0 open, CH0 close, CH1 open, CH1 close, etc.");
      Serial.println("Each jog stops after 250 ms. BOOT during motion sends stop.");
      Serial.println("Verify each servo is stationary between jogs.");
      return;
    }
    Serial.println("Manually align reels to 1. Press and release BOOT to start.");
    Serial.println("Offline fixture always selects 111 and drawer 1. BOOT during motion stops.");
    if (!offlineIncludeDrawers)
      Serial.println("REELS ONLY: drawer outputs are not initialized.");
    else
      Serial.println("Each idle BOOT press also confirms all drawers are flush closed.");
    return;
  }
  if (*stationName) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(stationName, stationPassword);
    // ADDED: wait up to 15 s and print the address the bridge (bench.py) needs
    Serial.printf("Joining %s", stationName);
    for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print("."); }
    if (WiFi.status() == WL_CONNECTED) Serial.printf("\nJOINED %s, ESP32 address: http://%s\n", stationName, WiFi.localIP().toString().c_str());
    else Serial.println("\nERR could not join; check the name/password and that it's a 2.4 GHz network");
  } else {
    WiFi.mode(WIFI_AP);
    bool ok = WiFi.softAP("Slotty-Bench", "SlottyBench24");
    Serial.println(ok ? "AP READY: Slotty-Bench" : "AP FAILED");
    Serial.println(WiFi.softAPIP());
  }
  const char* headers[] = {"X-Slotty-Bench"};
  server.collectHeaders(headers, 1);
  server.on("/", HTTP_GET, [] {
    server.send(200, "text/html", R"HTML(
      <h1>Slotty alignment</h1>
      <p>After each power-up, with motors released, manually align all reels
      to label 1. Confirm only after calibration values are configured.</p>
      <button onclick="fetch('/align',{method:'POST',headers:{
      'X-Slotty-Bench':'1'}}).then(async r=>document.getElementById('s').textContent=await r.text())">
      Confirm all reels at 1</button>
      <h2>Drawer calibration</h2>
      <p>Jog buttons move for 250 ms. Check direction and stop first.
      Start with all drawers clear. BOOT stops movement.</p>
      <div id="drawers"></div>
      <button onclick="send('/drawers-closed')">Confirm all drawers flush closed</button>
      <button onclick="send('/stop')">Stop and invalidate alignment</button>
      <p id="s"></p>
      <script>
      async function send(path){
        const r=await fetch(path,{method:'POST',headers:{'X-Slotty-Bench':'1'}});
        document.getElementById('s').textContent=await r.text();
      }
      for(let d=1;d<=4;d++){
        const row=document.createElement('p');
        row.textContent='Drawer '+d+' ';
        for(const direction of ['open','close']){
          const b=document.createElement('button');
          b.textContent=direction+' 250 ms';
          b.onclick=()=>send('/drawer-jog?drawer='+d+'&direction='+direction);
          row.appendChild(b);
        }
        document.getElementById('drawers').appendChild(row);
      }
      </script>
    )HTML");
  });
  server.on("/align", HTTP_POST, [] {
    if (server.header("X-Slotty-Bench") != "1" || aligned || pending || moving || eventActive || drawersBusy()) {
      server.send(409, "text/plain", "alignment unavailable; restart to realign");
    } else if (!validCalibration()) {
      server.send(409, "text/plain", "confirm gear ratio and configure actual gear counts or steps per reel turn");
    } else if (!storageReady || !confirmAlignment()) {
      server.send(503, "text/plain", "check driver UART, power and receipt storage");
    } else {
      server.send(200, "text/plain", "aligned to 1; motors holding; ready for saved rolls");
    }
  });
  server.on("/drawer-jog", HTTP_POST, [] {
    String drawer = server.arg("drawer");
    String direction = server.arg("direction");
    if (server.header("X-Slotty-Bench") != "1" || eventActive || moving ||
        drawer.length() != 1 || drawer[0] < '1' || drawer[0] > '4' ||
        (direction != "open" && direction != "close")) {
      server.send(409, "text/plain", "invalid jog or active saved event");
      return;
    }
    bool ok = jogDrawer(drawer.toInt() - 1, direction == "open", millis());
    server.send(ok ? 202 : 409, "text/plain", ok ? "250 ms jog started" : "check PCA9685 or wait");
  });
  server.on("/drawers-closed", HTTP_POST, [] {
    if (server.header("X-Slotty-Bench") != "1" || eventActive ||
        drawersBusy() || !drawerHardwareReady) {
      server.send(409, "text/plain", "drawer confirmation unavailable");
      return;
    }
    drawersClosed = true;
    if (!drawersClosed) {
      server.send(503, "text/plain", "motor board did not confirm the closed reference");
      return;
    }
    server.send(200, "text/plain", drawerTimingConfirmed
        ? "drawers confirmed closed; ready" : "closed reference set; calibrate drawer_config.h timings");
  });
  server.on("/stop", HTTP_POST, [] {
    if (server.header("X-Slotty-Bench") != "1") {
      server.send(403, "text/plain", "invalid stop request");
      return;
    }
    stopAll();
    server.send(200, "text/plain", "stop sent; verify physical stop; realign before another event");
  });
  server.on("/identity", HTTP_GET, [] {
    server.send(200, "text/plain", "SLOTTY WIFI REELS V4");
  });
  server.on("/ready", HTTP_GET, [] {
    bool ready = linkUp && !linkFault && aligned && storageReady && !pending && !moving &&
                 !drawersBusy() && drawerHardwareReady &&
                 drawerTimingConfirmed && drawersClosed;
    server.send(ready ? 200 : 409, "text/plain", ready ? "ready" : "align reels first");
  });
  server.on("/spin", HTTP_POST, acceptSpin);
  server.on("/receipt", HTTP_GET, [] {
    String id = server.arg("id");
    if (!storageReady || !validId(id)) {
      server.send(400, "text/plain", "invalid receipt request");
      return;
    }
    String record = receipts.getString(receiptKey(id).c_str(), "");
    if (!record.startsWith(id + "|")) {
      server.send(404, "text/plain", "unknown event");
      return;
    }
    if (eventActive && id == lastEvent) {
      server.send(200, "text/plain", "in progress");
      return;
    }
    server.send(200, "text/plain", record.substring(record.lastIndexOf('|') + 1));
  });
  server.begin();
}

void finishEvent(const String& status) {
  eventActive = false;
  Serial.println(status);
  if (!saveReceipt(lastEvent, pendingTarget, status))
    Serial.println("ERR receipt write; event remains unconfirmed");
}

void stopAll() {
  const bool stopped = linkStopAll();
  moving = false;
  pending = false;
  aligned = false;
  digitalWrite(EN_PIN, HIGH);
  digitalWrite(LED_PIN, LOW);
  bool ok = drawerHardwareReady ? stopDrawers()
                                : (!enableWifi && !offlineIncludeDrawers);
  if (eventActive) finishEvent(ok && stopped && !linkFault ? "failed stopped by operator"
                                  : "unconfirmed");
}

void startOfflineFixture() {
  if (offlineDrawerCalibration) {
    static unsigned jogStep = 0;
    const int index = (jogStep / 2) % 4;
    const bool opening = jogStep % 2 == 0;
    if (jogDrawer(index, opening, millis())) {
      Serial.printf("SERVO FIXTURE CH%d %s for 250 ms\n", index,
                    opening ? "open direction" : "close direction");
      ++jogStep;
    } else {
      Serial.println("ERR servo jog unavailable; check PCA9685 and power");
    }
    return;
  }
  if (!storageReady || (offlineIncludeDrawers &&
      (!drawerHardwareReady || !drawerTimingConfirmed))) {
    Serial.println("ERR offline fixture not ready; check receipt storage/drawer calibration");
    return;
  }
  if (offlineIncludeDrawers) drawersClosed = true;
  if (!aligned && !confirmAlignment()) {
    Serial.println("ERR reel driver/alignment configuration");
    return;
  }
  uint32_t counter = receipts.getUInt("demo-counter", 0);
  if (counter == UINT32_MAX || receipts.putUInt("demo-counter", counter + 1) != 4) {
    Serial.println("ERR could not reserve fixture ID");
    return;
  }
  ++counter;
  char id[37];
  snprintf(id, sizeof(id), "%08lx-0000-4000-8000-000000000000",
           static_cast<unsigned long>(counter));
  lastEvent = id;
  pendingTarget = offlineDemoOutcome;
  if (!saveReceipt(lastEvent, pendingTarget, "unconfirmed")) {
    Serial.println("ERR could not claim fixture event");
    return;
  }
  Serial.printf("OFFLINE FIXTURE %s outcome=%d\n", id, pendingTarget);
  eventActive = true;
  pending = true;
}

void loop() {
  linkPoll();
  const bool busy = pending || moving || eventActive || drawersBusy();
  if (!enableWifi) {
    static DemoButton button;
    const auto action = button.update(digitalRead(0) == LOW, busy, millis());
    if (action == DemoButtonAction::Stop) {
      stopAll();
      return;
    }
    if (action == DemoButtonAction::Start) startOfflineFixture();
  } else {
    static bool stopLatched = false;
    if (digitalRead(0) == LOW) {
      if (!stopLatched) stopAll();
      stopLatched = true;
      return;
    }
    stopLatched = false;
  }
  // Motion runs on the other board, so HTTP can service Stop during a spin.
  if (enableWifi) server.handleClient();
  if (moving) {
    if (tickOutcome() && eventActive && !linkFault) {
      if (!enableWifi && !offlineIncludeDrawers) {
        finishEvent("offline reel fixture finished; drawer sequence skipped");
      } else if (pendingTarget == 4) {
        finishEvent("sequence finished");
      } else if (!demoDrawerAvailable(pendingTarget)) {
        finishEvent("reels finished; drawer unavailable");
      } else if (!startDrawer(pendingTarget, millis())) {
        if (linkFault) stopAll();
        else finishEvent("failed drawer startup after reel motion");
      }
    }
    return;
  }
  if (pending) {
    pending = false;
    if (!startOutcome(pendingTarget)) {
      if (linkFault) stopAll();
      else finishEvent("failed before motion");
    }
    return;
  }
  if (tickDrawer(millis()) && eventActive) {
    finishEvent(drawerFault ? "unconfirmed" : "sequence finished");
  }
}
