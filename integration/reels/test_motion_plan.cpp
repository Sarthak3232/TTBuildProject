// Compile as a standalone C++11 program. No Arduino board is required.
#include <assert.h>
#include <initializer_list>
#include "SlottyWifiJog/motion_plan.h"

int main() {
  for (int outcome = 0; outcome < 4; outcome++)
    for (int reel = 0; reel < 3; reel++)
      assert(outcomeSymbol(outcome, reel) == outcome);
  assert(outcomeSymbol(4, 0) == 0);
  assert(outcomeSymbol(4, 1) == 1);
  assert(outcomeSymbol(4, 2) == 3);
  for (int motorTeeth : {17, 20, 30}) {
    for (int reelTeeth : {20, 43, 60}) {
      int from = 0;
      int64_t remainder = 0, totalPulses = 0, totalUnits = 0;
      const int64_t numerator = int64_t(1600) * reelTeeth;
      const int64_t divisor = int64_t(motorTeeth) * 4;
      for (int step = 0; step < 10000; step++) {
        const int to = (step * 3) % 4;
        const int turns = 2 + step % 3;
        const auto plan = planMove(from, to, turns, 4, numerator,
                                   motorTeeth, remainder);
        assert(plan.pulses > 0);
        totalUnits += turns * 4 + (to - from + 4) % 4;
        totalPulses += plan.pulses;
        remainder = plan.remainder;
        assert(totalPulses * divisor + remainder == totalUnits * numerator);
        assert(remainder >= -divisor / 2 && remainder <= divisor / 2);
        from = to;
      }
    }
  }
  // A direct-drive reel at 8 microsteps: one quarter turn is 400 pulses.
  assert(planMove(0, 1, 2, 4, 1600, 1, 0).pulses == 3600);
  assert(planMove(3, 0, 2, 4, 1600, 1, 0).pulses == 3600);
}
