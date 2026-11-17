from contextlib import closing
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
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
            result = dispatch(self.db, doc, lambda key, target: calls.append(key) or "sequence finished")
            self.assertEqual(result["replay"], replay)
            self.assertEqual(result["target"], 0)
        self.assertEqual(calls, [self.key])

    def test_lost_reply_preserves_debit_and_suppresses_resend(self):
        def disconnect(key, target):
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
            b"SLOTTY WIFI REELS V4", b"queued", b"sequence finished"]
        self.assertEqual(wifi_jog("test", self.key, 2), "sequence finished")
        self.assertEqual([c.args[0].get_method() for c in http.call_args_list], ["GET","POST","GET"])


class PhysicalProtocolTests(unittest.TestCase):
    def test_saved_target_reaches_http_device_once(self):
        events = []
        receipts = {}
        class MockESP32(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path == "/identity":
                    body = "SLOTTY WIFI REELS V4"
                else:
                    body = "sequence finished"
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body.encode())

            def do_POST(self):
                from urllib.parse import parse_qs, urlsplit
                self.assert_path = urlsplit(self.path)
                args = parse_qs(self.assert_path.query)
                events.append((self.assert_path.path, args))
                receipts[args["id"][0]] = args["target"][0]
                self.send_response(202)
                self.end_headers()
                self.wfile.write(b"queued")

        with HTTPServer(("127.0.0.1", 0), MockESP32) as server:
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                with closing(sqlite3.connect(":memory:")) as db:
                    initialize(db)
                    for slot in range(1, 5):
                        key = str(uuid4())
                        doc = {"roll": {"id": key, "won": True, "slot": slot,
                                        "deliveryState": "hardware_pending"}}
                        send = lambda event, target: wifi_jog(
                            f"127.0.0.1:{server.server_port}", event, target)
                        result = dispatch(db, doc, send)
                        self.assertEqual(result["detail"], "sequence finished")
                        self.assertTrue(dispatch(db, doc, send)["replay"])
                        self.assertEqual(receipts[key], str(slot - 1))
                    key = str(uuid4())
                    doc = {"roll": {"id": key, "won": False, "slot": None,
                                    "deliveryState": "not_applicable"}}
                    dispatch(db, doc, send)
                    self.assertEqual(receipts[key], "4")
                    self.assertEqual(len(events), 5)
                    self.assertTrue(all(path == "/spin" for path, args in events))
            finally:
                server.shutdown()
                worker.join()

    @patch("bench.urlopen")
    def test_unconfirmed_device_receipt_never_becomes_completed(self, http):
        http.return_value.__enter__.return_value.read.side_effect = [
            b"SLOTTY WIFI REELS V4", b"queued", b"unconfirmed"]
        self.assertEqual(wifi_jog("test", str(uuid4()), 0), "unconfirmed")


class MockReceiverTests(unittest.TestCase):
    def test_normal_unconfirmed_and_duplicate_receipts(self):
        from mock_esp32 import MockDevice
        with HTTPServer(("127.0.0.1", 0), MockDevice) as server:
            server.events = {}
            server.mode = "normal"
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            host = f"127.0.0.1:{server.server_port}"
            try:
                key = str(uuid4())
                self.assertEqual(wifi_jog(host, key, 4), "sequence finished")
                self.assertEqual(wifi_jog(host, key, 4), "sequence finished")
                self.assertEqual(len(server.events), 1)
                from urllib.error import HTTPError
                with self.assertRaises(HTTPError):
                    wifi_jog(host, key, 0)
                server.mode = "unconfirmed"
                self.assertEqual(wifi_jog(host, str(uuid4()), 2), "unconfirmed")
                server.mode = "reject"
                with self.assertRaises(HTTPError):
                    wifi_jog(host, str(uuid4()), 1)
                self.assertEqual(len(server.events), 2)
            finally:
                server.shutdown()
                worker.join()


class FullSequenceTests(unittest.TestCase):
    def test_all_drawers_loss_and_partial_failure(self):
        from mock_esp32 import MockDevice
        with HTTPServer(("127.0.0.1", 0), MockDevice) as server:
            server.events = {}
            server.actions = []
            server.mode = "normal"
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            host = f"127.0.0.1:{server.server_port}"
            try:
                for target in range(5):
                    key = str(uuid4())
                    expected = "reels finished; drawer unavailable" if target in (1, 2, 3) else "sequence finished"
                    self.assertEqual(wifi_jog(host, key, target), expected)
                    steps = server.actions[-1][1]
                    if target in (1, 2, 3):
                        self.assertEqual(steps, ["reels", "drawer unavailable"])
                    elif target == 4:
                        self.assertEqual(steps, ["reels"])
                    else:
                        self.assertEqual(steps, ["reels", f"drawer {target + 1} open",
                            "stop", "dwell 6000 ms", f"drawer {target + 1} close", "stop"])
                    count = len(server.actions)
                    self.assertEqual(wifi_jog(host, key, target), expected)
                    self.assertEqual(len(server.actions), count)
                server.mode = "drawer-fail"
                self.assertEqual(wifi_jog(host, str(uuid4()), 0),
                                 "failed drawer startup after reel motion")
                self.assertEqual(server.actions[-1][1], ["reels", "drawer startup failed"])
            finally:
                server.shutdown()
                worker.join()

    @patch("bench.urlopen")
    def test_progress_is_polled_until_complete(self, http):
        http.return_value.__enter__.return_value.read.side_effect = [
            b"SLOTTY WIFI REELS V4", b"queued", b"in progress", b"sequence finished"]
        with patch("bench.time.sleep"):
            self.assertEqual(wifi_jog("test", str(uuid4()), 1), "sequence finished")
