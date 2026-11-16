import sqlite3
import unittest
from uuid import uuid4
from unittest.mock import patch

from bench import dispatch, initialize, rehearse, wifi_jog


class BenchTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        initialize(self.db)
        self.key = str(uuid4())

    def test_two_clicks_one_charge_one_send(self):
        calls = []
        for replay in (False, True):
            doc = rehearse(self.db, self.key)
            self.assertEqual(doc["balanceAfterRoll"], 19)
            result = dispatch(self.db, doc, lambda key: calls.append(key) or "pulses finished")
            self.assertEqual(result["replay"], replay)
            self.assertEqual(result["target"], 2)
        self.assertEqual(calls, [self.key])

    def test_lost_reply_preserves_debit_and_suppresses_resend(self):
        def disconnect(key):
            raise TimeoutError("lost reply")
        doc = rehearse(self.db, self.key)
        self.assertIn("Unconfirmed", dispatch(self.db, doc, disconnect)["detail"])
        self.assertTrue(dispatch(self.db, rehearse(self.db, self.key), self.fail)["replay"])

    def test_empty_wallet(self):
        self.db.execute("UPDATE wallet SET balance=0")
        self.db.commit()
        with self.assertRaises(ValueError):
            rehearse(self.db, self.key)
        self.assertEqual(self.db.execute("SELECT count(*) FROM rehearsal").fetchone()[0], 0)

    @patch("bench.urlopen")
    def test_wifi_protocol(self, http):
        http.return_value.__enter__.return_value.read.side_effect = [
            b"SLOTTY BENCH JOG V1", b"queued", b"pulses finished"]
        self.assertEqual(wifi_jog("test", self.key), "pulses finished")
        self.assertEqual([c.args[0].get_method() for c in http.call_args_list], ["GET","POST","GET"])
