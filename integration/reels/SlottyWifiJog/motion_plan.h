#pragma once
#include <stdint.h>

// Based on the fractional-pulse carry used by firmware/SlottyReels/Reel.h.
// Pure integer planning so rounding cannot accumulate over repeated rolls.
struct MotionPlan {
  long pulses;
  int64_t remainder;
};
inline MotionPlan planMove(int from, int to, int turns, int symbols,
                           int64_t numerator, int64_t denominator,
                           int64_t remainder) {
  const int forward = (to - from + symbols) % symbols;
  const int64_t units = int64_t(turns) * symbols + forward;
  const int64_t divisor = denominator * symbols;
  const int64_t exact = units * numerator + remainder;
  const long pulses = long((exact + divisor / 2) / divisor);
  return {pulses, exact - int64_t(pulses) * divisor};
}


// Outcome codes 0..3 are the four saved slot wins. Code 4 is a saved loss.
// Physical symbol indices 0..3 correspond to labels 1..4.
inline int outcomeSymbol(int outcome, int reel) {
  const int loss[3] = {0, 1, 3};
  return outcome == 4 ? loss[reel] : outcome;
}
