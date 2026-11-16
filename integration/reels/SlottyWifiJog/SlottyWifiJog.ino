#include <WiFi.h>
#include <WebServer.h>
#include "bench_motor.h"

// For a bench with internet, enter the credentials of the same 2.4 GHz
// hotspot that the laptop uses. Empty SSID creates a private offline AP.
const char* stationName = "";
const char* stationPassword = "";
WebServer server(80);
bool pending = false;
String lastEvent;
String phase = "idle";

void acceptJog() {
  String id = server.arg("id");
  if (id.length() != 36 || server.header("X-Slotty-Bench") != "1") {
    server.send(400, "text/plain", "invalid bench request");
    return;
  }
  if (id != lastEvent) {
    lastEvent = id;
    pending = true;
    phase = "queued";
  }
  server.send(202, "text/plain", phase);
}

void setup() {
  setupMotors();
  if (*stationName) {
    WiFi.begin(stationName, stationPassword);
  } else {
    WiFi.softAP("Slotty-Bench", "SlottyBench24");
  }
  const char* headers[] = {"X-Slotty-Bench"};
  server.collectHeaders(headers, 1);
  server.on("/identity", HTTP_GET, [] { server.send(200, "text/plain", "SLOTTY BENCH JOG V1"); });
  server.on("/jog", HTTP_POST, acceptJog);
  server.on("/receipt", HTTP_GET, [] {
    if (server.arg("id") != lastEvent) server.send(404, "text/plain", "unknown");
    else server.send(200, "text/plain", phase);
  });
  server.begin();
}

void loop() {
  server.handleClient();
  if (!pending) return;
  pending = false;
  for (int channel = 0; channel < 3; channel++) {
    if (!jog(channel)) {
      phase = "driver error on channel " + String(channel + 1);
      return;
    }
  }
  phase = "pulses finished";
}
