#pragma once
#include <stdint.h>

enum class DrawerPhase { Idle, Opening, Dwell, Closing, Done, Stopped };
enum class DrawerAction { None, Stop, Close, Complete };

// Pure timing state machine. Caller applies each returned action exactly once.
class DrawerSequence {
 public:
  DrawerPhase phase = DrawerPhase::Idle;

  bool busy() const {
    return phase == DrawerPhase::Opening || phase == DrawerPhase::Dwell ||
           phase == DrawerPhase::Closing;
  }

  bool start(uint32_t now, uint32_t openMs, uint32_t closeMs,
             uint32_t dwellMs) {
    if (busy() || !openMs || !closeMs || openMs > 10000 ||
        closeMs > 10000 || dwellMs > 60000) return false;
    opening_ = openMs;
    closing_ = closeMs;
    dwell_ = dwellMs;
    since_ = now;
    phase = DrawerPhase::Opening;
    return true;
  }

  DrawerAction tick(uint32_t now) {
    const uint32_t elapsed = now - since_;
    if (phase == DrawerPhase::Opening && elapsed >= opening_) {
      phase = DrawerPhase::Dwell;
      since_ = now;
      return DrawerAction::Stop;
    }
    if (phase == DrawerPhase::Dwell && elapsed >= dwell_) {
      phase = DrawerPhase::Closing;
      since_ = now;
      return DrawerAction::Close;
    }
    if (phase == DrawerPhase::Closing && elapsed >= closing_) {
      phase = DrawerPhase::Done;
      return DrawerAction::Complete;
    }
    return DrawerAction::None;
  }

  void cancel() { phase = DrawerPhase::Stopped; }

 private:
  uint32_t since_ = 0, opening_ = 0, closing_ = 0, dwell_ = 0;
};
