#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "bench_motor.h"
#include "outcome_motion.h"

// Empty SSID creates an offline AP. For Supabase use the laptop's private
// 2.4 GHz hotspot with internet. Keep actual credentials out of Git.
const char* stationName = "";
const char* stationPassword = "";
WebServer server(80);
Preferences receipts;
bool storageReady = false;
bool pending = false;
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
  if (!aligned || pending || moving) {
    server.send(409, "text/plain", "align reels first or wait for motion");
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
  server.send(202, "text/plain", "queued");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("SLOTTY WIFI REELS V3 START");
  setupMotors();
  storageReady = receipts.begin("slotty-events", false);
  if (*stationName) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(stationName, stationPassword);
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
      Confirm all reels at 1</button><p id="s"></p>
    )HTML");
  });
  server.on("/align", HTTP_POST, [] {
    if (server.header("X-Slotty-Bench") != "1" || aligned || pending || moving) {
      server.send(409, "text/plain", "alignment unavailable; restart to realign");
    } else if (!validCalibration()) {
      server.send(409, "text/plain", "confirm gear ratio and configure actual gear counts or steps per reel turn");
    } else if (!storageReady || !confirmAlignment()) {
      server.send(503, "text/plain", "check driver UART, power and receipt storage");
    } else {
      server.send(200, "text/plain", "aligned to 1; motors holding; ready for saved rolls");
    }
  });
  server.on("/identity", HTTP_GET, [] {
    server.send(200, "text/plain", "SLOTTY WIFI REELS V3");
  });
  server.on("/ready", HTTP_GET, [] {
    bool ready = aligned && storageReady && !pending && !moving;
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
    server.send(200, "text/plain", record.substring(record.lastIndexOf('|') + 1));
  });
  server.begin();
}

void loop() {
  if (moving) {
    if (tickOutcome()) {
      if (!saveReceipt(lastEvent, pendingTarget, "pulses finished"))
        Serial.println("ERR completion receipt unavailable; event remains unconfirmed");
    }
    return;
  }
  if (pending) {
    pending = false;
    if (!startOutcome(pendingTarget)) {
      saveReceipt(lastEvent, pendingTarget, "failed before motion");
    }
    return;
  }
  // HTTP and flash writes occur outside the motor stepping loop.
  server.handleClient();
}
