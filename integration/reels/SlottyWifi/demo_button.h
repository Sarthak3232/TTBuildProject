#pragma once
#include <stdint.h>

enum class DemoButtonAction { None, Start, Stop };

// Start on release after a debounced idle press. Stop on the first busy press.
// Startup-held BOOT and release after a stop cannot start a new movement.
class DemoButton {
 public:
  DemoButtonAction update(bool pressed, bool busy, uint32_t now) {
    if (pressed != pressed_) {
      pressed_ = pressed;
      since_ = now;
      if (pressed && busy) {
        armed_ = false;
        blocked_ = true;
        return DemoButtonAction::Stop;
      }
    }
    if (uint32_t(now - since_) < 40) return DemoButtonAction::None;
    if (pressed) {
      if (!blocked_ && idleSeen_) armed_ = true;
      return DemoButtonAction::None;
    }
    const bool start = armed_ && !blocked_ && !busy;
    armed_ = false;
    blocked_ = false;
    idleSeen_ = true;
    return start ? DemoButtonAction::Start : DemoButtonAction::None;
  }

 private:
  bool pressed_ = false, armed_ = false, blocked_ = false, idleSeen_ = false;
  uint32_t since_ = 0;
};
