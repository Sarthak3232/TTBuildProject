import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from unittest.mock import Mock

from bridge import Simulator, deliver, map_roll


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.db = Path(directory.name) / "ledger.sqlite"
        self.doc = json.loads(Path(__file__).with_name("example-win.json").read_text())
        self.port = Simulator()

    def run_event(self, port=None):
        return deliver(self.doc, self.db, self.port if port is None else port)

    def test_each_winning_slot(self):
        for slot in range(1, 5):
            self.doc["roll"]["slot"] = slot
            self.assertEqual(map_roll(self.doc)[1], slot - 1)

    def test_loss(self):
        self.doc["roll"].update(won=False, slot=None, deliveryState="not_applicable")
        self.assertEqual(self.run_event()["status"], "completed")
        self.assertEqual(self.port.commands, ["home", "spin 4"])

    def test_invalid_inputs_never_move(self):
        for fields in ({"slot": 0}, {"slot": 5}, {"slot": True}, {"won": 1},
                       {"won": False}, {"id": "bad"}, {"deliveryState": "not_applicable"}):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                deliver({"roll": {**self.doc["roll"], **fields}}, self.db, self.port)
        self.assertEqual(self.port.commands, [])

    def test_receipt_survives_reopen(self):
        result = self.run_event()
        self.assertEqual((result["status"], self.port.position), ("completed", 2))
        replay = self.run_event(Mock(spec=[]))
        self.assertEqual(replay, {**result, "replay": True})
        self.assertEqual(self.port.commands, ["home", "spin 2"])

    def test_distinct_rolls_get_distinct_events(self):
        first = self.run_event()
        self.doc["roll"]["id"] = "bb02647f-124f-4d54-a06a-355a55a98139"
        self.assertNotEqual(self.run_event()["eventId"], first["eventId"])
        self.assertEqual(self.port.commands.count("spin 2"), 2)

    def test_payload_conflict(self):
        self.run_event()
        self.doc["roll"]["slot"] = 1
        with self.assertRaisesRegex(ValueError, "different stored outcome"):
            self.run_event(Mock(spec=[]))

    def test_rejected_spin_preserves_roll(self):
        original = json.dumps(self.doc)
        result = self.run_event(Simulator("reject-spin"))
        self.assertEqual((result["status"], result["detail"]), ("failed", "ERR busy"))
        self.assertEqual(self.run_event(Mock(spec=[]))["status"], "failed")
        self.assertEqual(json.dumps(self.doc), original)

    def test_lost_done_after_motion(self):
        port = Simulator("drop-done")
        self.assertEqual(self.run_event(port)["status"], "unconfirmed")
        self.assertEqual(port.position, 2)
        self.assertEqual(self.run_event(Mock(spec=[]))["status"], "unconfirmed")

    def test_home_must_finish_before_spin(self):
        port = Mock()
        port.read_line.side_effect = ["OK homing", "DONE spin", TimeoutError("silent")]
        self.assertEqual(self.run_event(port)["status"], "unconfirmed")
        port.write_line.assert_called_once_with("home")

    def test_home_error_stops_spin(self):
        port = Mock()
        port.read_line.return_value = "ERR home sensor did not change state"
        self.assertEqual(self.run_event(port)["status"], "failed")
        port.write_line.assert_called_once_with("home")

    def test_crash_after_claim(self):
        port = Mock()
        port.read_line.side_effect = KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.run_event(port)
        self.assertEqual(self.run_event(Mock(spec=[]))["status"], "inflight")

    def test_concurrent_duplicate(self):
        entered, release = Event(), Event()
        port = Simulator()
        write = port.write_line

        def pause(line):
            entered.set()
            if not release.wait(5):
                raise TimeoutError("test barrier")
            write(line)

        port.write_line = pause
        with ThreadPoolExecutor() as pool:
            worker = pool.submit(self.run_event, port)
            try:
                self.assertTrue(entered.wait(5))
                self.assertEqual(self.run_event(Mock(spec=[]))["status"], "inflight")
            finally:
                release.set()
            self.assertEqual(worker.result()["status"], "completed")
        self.assertEqual(port.commands, ["home", "spin 2"])


if __name__ == "__main__":
    unittest.main()
