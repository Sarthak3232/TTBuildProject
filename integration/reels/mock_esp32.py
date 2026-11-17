"""MOCK ESP32 HTTP receiver. No USB, GPIO, Wi-Fi radio or motors are accessed."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit
from uuid import UUID


class MockDevice(BaseHTTPRequestHandler):
    def reply(self, code, text):
        self.send_response(code)
        self.end_headers()
        self.wfile.write(text.encode())

    def do_GET(self):
        route = urlsplit(self.path)
        if route.path == "/identity":
            return self.reply(200, "SLOTTY WIFI REELS V4")
        if route.path == "/receipt":
            key = parse_qs(route.query).get("id", [""])[0]
            record = self.server.events.get(key)
            if record:
                return self.reply(200, record[1])
        self.reply(404, "unknown mock event")

    def do_POST(self):
        route = urlsplit(self.path)
        args = parse_qs(route.query)
        try:
            key = args["id"][0]
            if str(UUID(key)) != key:
                raise ValueError("invalid event")
            target = int(args["target"][0])
            if target not in range(5):
                raise ValueError("invalid target")
        except (KeyError, ValueError):
            return self.reply(400, "invalid mock request")
        if route.path != "/spin" or self.headers.get("X-Slotty-Bench") != "1":
            return self.reply(403, "invalid mock command")
        old = self.server.events.get(key)
        if old:
            if old[0] != target:
                return self.reply(409, "event conflict")
            print("MOCK duplicate suppressed", key, flush=True)
            return self.reply(200, old[1])
        if self.server.mode == "reject":
            return self.reply(409, "MOCK device rejected movement")
        status = "unconfirmed" if self.server.mode == "unconfirmed" else "sequence finished"
        if target in (1, 2, 3) and self.server.mode != "unconfirmed":
            status = "reels finished; drawer unavailable"
        if target == 0 and self.server.mode == "drawer-fail":
            status = "failed drawer startup after reel motion"
        self.server.events[key] = (target, status)
        if not hasattr(self.server, "actions"):
            self.server.actions = []
        steps = ["reels"] if target == 4 else [
            "reels", f"drawer {target + 1} open", "stop", "dwell 6000 ms",
            f"drawer {target + 1} close", "stop"]
        if target in (1, 2, 3):
            steps = ["reels", "drawer unavailable"]
        if status.startswith("failed"):
            steps = ["reels", "drawer startup failed"]
        self.server.actions.append((key, steps))
        print("MOCK sequence", steps, flush=True)
        labels = [1, 2, 4] if target == 4 else [target + 1] * 3
        print("MOCK ONLY", key, "labels", labels, "receipt", status, flush=True)
        self.reply(202, "queued")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["normal", "reject", "unconfirmed", "drawer-fail"], default="normal")
    args = parser.parse_args()
    with HTTPServer(("127.0.0.1", 8766), MockDevice) as server:
        server.events = {}
        server.mode = args.mode
        print("MOCK ESP32 ONLY on 127.0.0.1:8766; mode", args.mode, flush=True)
        server.serve_forever()
