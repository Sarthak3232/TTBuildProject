#include "Reel.h"
#include <stdlib.h>
#include <string.h>

// STEP, DIR, and DRV_EN follow the proposal's ESP32-S3 schematic.
// GPIO 15 is a proposed bench input for the first home sensor.
// Microsteps assume standalone TMC2209 operation with the pictured MS1/MS2 straps.
constexpr size_t activeReels = 1;
constexpr int driverEnablePin = 8;  // Shared, active-low DRV_EN.
const ReelConfig configs[] = {
    // STEP, DIR, HOME, reverse, active-low, motor steps, microsteps,
    // motor teeth, reel teeth, symbols, pulses from home to symbol zero.
    {4, 5, 15, false, true, 200, 8, 60, 60, 8, 0},
    {6, 7, -1, false, true, 200, 32, 0, 0, 0, 0},
    {1, 2, -1, false, true, 200, 64, 0, 0, 0, 0},
};
static_assert(activeReels >= 1 && activeReels <= 3, "Use one to three reels");

Reel reels[] = {Reel(configs[0]), Reel(configs[1]), Reel(configs[2])};
enum class Operation { Idle, Home, Spin, Position, Jog };
Operation operation = Operation::Idle;
bool configured = false;
bool benchAvailable = false;

bool validConfiguration() {
  int usedPins[3 * activeReels];
  size_t used = 0;
  for (size_t i = 0; i < activeReels; ++i) {
    if (!reels[i].valid()) return false;
    const int pins[] = {configs[i].stepPin, configs[i].dirPin, configs[i].homePin};
    for (int pin : pins) {
      for (size_t j = 0; j < used; ++j) {
        if (usedPins[j] == pin) return false;
      }
      if (pin == driverEnablePin) return false;
      usedPins[used++] = pin;
    }
  }
  return true;
}

const char *stateName(Reel::State state) {
  switch (state) {
    case Reel::State::Unhomed: return "unhomed";
    case Reel::State::Clearing:
    case Reel::State::Seeking:
    case Reel::State::Aligning: return "homing";
    case Reel::State::Ready: return "ready";
    case Reel::State::Spinning: return "spinning";
    case Reel::State::Jogging: return "jogging";
    case Reel::State::Fault: return "home-sensor-fault";
  }
  return "unknown";
}

void printStatus() {
  if (!benchAvailable && !configured) {
    Serial.println("ERR verify board and reel configuration");
    return;
  }
  for (size_t i = 0; i < activeReels; ++i) {
    Serial.printf("REEL %u %s\n", unsigned(i + 1), stateName(reels[i].state()));
  }
  if (!configured) Serial.println("Bench only: set motor gear teeth and symbol count for symbol moves");
}

void handleCommand(char *line) {
  char *context = nullptr;
  const char *command = strtok_r(line, " \t", &context);
  if (!command) return;
  if (strcmp(command, "status") == 0 && !strtok_r(nullptr, " \t", &context)) {
    printStatus();
    return;
  }
  if (operation != Operation::Idle) {
    Serial.println("ERR busy");
    return;
  }
  if (benchAvailable && strcmp(command, "sensor") == 0 &&
      !strtok_r(nullptr, " \t", &context)) {
    Serial.println(reels[0].atHomeMarker() ? "HOME active" : "HOME inactive");
    return;
  }
  if (benchAvailable && strcmp(command, "jog") == 0 &&
      !strtok_r(nullptr, " \t", &context)) {
    digitalWrite(driverEnablePin, LOW);
    reels[0].jog();
    operation = Operation::Jog;
    Serial.println("OK jogging");
    return;
  }
  if (!configured) {
    printStatus();
    return;
  }
  if (strcmp(command, "home") == 0 && !strtok_r(nullptr, " \t", &context)) {
    digitalWrite(driverEnablePin, LOW);
    for (size_t i = 0; i < activeReels; ++i) reels[i].home();
    operation = Operation::Home;
    Serial.println("OK homing");
    return;
  }
  const bool directPosition = strcmp(command, "position") == 0;
  if (!directPosition && strcmp(command, "spin") != 0) {
    Serial.println("ERR expected home, position <symbol per reel>, spin <symbol per reel>, or status");
    return;
  }

  int symbols[activeReels];
  for (size_t i = 0; i < activeReels; ++i) {
    const char *token = strtok_r(nullptr, " \t", &context);
    char *end = nullptr;
    const long symbol = token ? strtol(token, &end, 10) : -1;
    if (!token || end == token || *end != '\0' || symbol < 0 || symbol > 254) {
      Serial.println("ERR expected one zero-based symbol index per reel");
      return;
    }
    if (!reels[i].acceptsSymbol(symbol)) {
      Serial.printf("ERR reel %u must be homed and the symbol must be in range\n",
                    unsigned(i + 1));
      return;
    }
    symbols[i] = symbol;
  }
  if (strtok_r(nullptr, " \t", &context)) {
    Serial.println("ERR too many symbols");
    return;
  }

  for (size_t i = 0; i < activeReels; ++i) {
    const int fullTurns = directPosition ? 0 : 2 + int(i);
    reels[i].moveToSymbol(symbols[i], fullTurns);
  }
  operation = directPosition ? Operation::Position : Operation::Spin;
  Serial.println(directPosition ? "OK positioning" : "OK spinning");
}

void pollSerial() {
  static char line[48];
  static size_t length = 0;
  static bool discardLine = false;
  // Limit input processing per loop so the motors keep receiving steps.
  for (int count = 0; count < 8 && Serial.available(); ++count) {
    const char ch = Serial.read();
    if (ch == '\r' || ch == '\n') {
      if (discardLine) {
        Serial.println("ERR invalid or too long command");
      } else if (length > 0) {
        line[length] = '\0';
        handleCommand(line);
      }
      length = 0;
      discardLine = false;
    } else if (ch == '\0' || length == sizeof(line) - 1) {
      discardLine = true;
    } else if (!discardLine) {
      line[length++] = ch;
    }
  }
}

void setup() {
  Serial.begin(115200);
#if defined(ARDUINO_ARCH_ESP32) && !defined(CONFIG_IDF_TARGET_ESP32S3)
  Serial.println("ERR this wiring profile requires ESP32-S3");
  return;
#endif
  configured = validConfiguration();
  const auto &first = configs[0];
  benchAvailable = activeReels == 1 && first.stepPin == 4 && first.dirPin == 5 &&
                   first.homePin == 15;
  if (!configured && !benchAvailable) {
    printStatus();
    return;
  }
  pinMode(driverEnablePin, OUTPUT);
  digitalWrite(driverEnablePin, HIGH);
  for (size_t i = 0; i < activeReels; ++i) reels[i].begin();
  Serial.println(configured ? "OK configured; send home before position or spin"
                            : "OK one-reel bench mode; commands: jog, sensor, status");
}

void loop() {
  if (operation != Operation::Idle) {
    bool busy = false;
    bool fault = false;
    for (size_t i = 0; i < activeReels; ++i) {
      reels[i].tick();
      busy |= reels[i].busy();
      fault |= reels[i].state() == Reel::State::Fault;
    }
    if (!busy) {
      if (fault || operation == Operation::Jog) digitalWrite(driverEnablePin, HIGH);
      if (fault) {
        Serial.println("ERR home sensor did not change state");
      } else if (operation == Operation::Jog) {
        Serial.println("DONE jog");
      } else if (operation == Operation::Position) {
        Serial.println("DONE position");
      } else {
        Serial.println(operation == Operation::Home ? "DONE home" : "DONE spin");
      }
      operation = Operation::Idle;
    }
  }
  pollSerial();
}
