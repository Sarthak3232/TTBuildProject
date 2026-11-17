// Compile as a standalone C++11 program. No Arduino board is required.
#include <assert.h>
#include <initializer_list>
#include "SlottyMotor/motion_plan.h"
#include "SlottyMotor/drawer_sequence.h"
#include "SlottyWifi/demo_button.h"

int main() {
  // Final eight-position layout, confirmed equal 60-tooth gears.
  assert(planMove(0, 1, 0, 8, 1600LL * 60, 60, 0).pulses == 200);
  assert(planMove(7, 0, 0, 8, 1600LL * 60, 60, 0).pulses == 200);
  assert(planMove(0, 0, 1, 8, 1600LL * 60, 60, 0).pulses == 1600);

  DemoButton button;
  assert(button.update(true, false, 0) == DemoButtonAction::None);
  assert(button.update(true, false, 100) == DemoButtonAction::None);
  assert(button.update(false, false, 150) == DemoButtonAction::None);
  assert(button.update(false, false, 200) == DemoButtonAction::None);
  assert(button.update(true, false, 250) == DemoButtonAction::None);
  assert(button.update(true, false, 300) == DemoButtonAction::None);
  assert(button.update(false, false, 350) == DemoButtonAction::None);
  assert(button.update(false, false, 400) == DemoButtonAction::Start);
  assert(button.update(false, true, 450) == DemoButtonAction::None);
  assert(button.update(true, true, 500) == DemoButtonAction::Stop);
  assert(button.update(true, false, 550) == DemoButtonAction::None);
  assert(button.update(false, false, 600) == DemoButtonAction::None);
  assert(button.update(false, false, 650) == DemoButtonAction::None);

  DrawerSequence drawer;
  assert(!drawer.start(0, 0, 250, 6000));
  assert(drawer.start(0, 250, 350, 6000));
  assert(!drawer.start(1, 250, 350, 6000));
  assert(drawer.tick(249) == DrawerAction::None);
  assert(drawer.tick(250) == DrawerAction::Stop);
  assert(drawer.tick(6249) == DrawerAction::None);
  assert(drawer.tick(6250) == DrawerAction::Close);
  assert(drawer.tick(6599) == DrawerAction::None);
  assert(drawer.tick(6600) == DrawerAction::Complete);
  assert(!drawer.busy());
  assert(drawer.tick(7000) == DrawerAction::None);
  assert(drawer.start(UINT32_MAX - 100, 250, 350, 6000));
  assert(drawer.tick(148) == DrawerAction::None);
  assert(drawer.tick(149) == DrawerAction::Stop);
  drawer.cancel();
  assert(!drawer.busy());
  assert(drawer.tick(10000) == DrawerAction::None);

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
  assert(planMove(0, 1, 0, 4, 1600LL * 60, 60, 0).pulses == 400);
  assert(planMove(0, 0, 1, 4, 1600LL * 60, 60, 0).pulses == 1600);
  // A direct-drive reel at 8 microsteps: one quarter turn is 400 pulses.
  assert(planMove(0, 1, 2, 4, 1600, 1, 0).pulses == 3600);
  assert(planMove(3, 0, 2, 4, 1600, 1, 0).pulses == 3600);
}
