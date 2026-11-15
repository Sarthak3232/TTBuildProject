"""Loopback-only browser bridge for SlottyUsbDemo. No motor commands before handshake."""
import argparse
import json
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import serial
from bridge import deliver
from usb_demo import UsbDemo

ADDRESS = ("127.0.0.1", 8764)
ORIGIN = "http://127.0.0.1:8764"


class Device:
    def __init__(self, port):
        self.port = port
        self.link = None

    def close(self):
        if self.link:
            self.link.close()
        self.link = None

    def connect(self):
        self.close()
        self.link = serial.Serial(self.port, 115200, timeout=0.5, write_timeout=2)
        try:
            time.sleep(2)
            self.link.reset_input_buffer()
            UsbDemo(self.link).write_line("status")
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                if self.link.readline().strip() == b"READY SLOTTY USB SIM V1":
                    return
            raise OSError("Board did not identify as SlottyUsbDemo. Check the sketch and COM3.")
        except Exception:
            self.close()
            raise


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload, mime="application/json"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" and self.headers.get("Host") == ORIGIN.split("//")[1]:
            self.reply(200, self.server.page, "text/html; charset=utf-8")
        else:
            self.reply(404, {})

    def do_POST(self):
        if self.headers.get("Origin") != ORIGIN or self.headers.get("Host") != ORIGIN.split("//")[1]:
            self.reply(403, {"error":"Open the local demo page."})
            return
        device = self.server.device
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16384:
                raise ValueError("Invalid request size.")
            payload = json.loads(self.rfile.read(length))
            if self.path == "/device/connect":
                device.connect()
                result = {"message": "COM3 connected · ESP32 replied READY SLOTTY USB SIM V1"}
            elif self.path == "/device/deliver":
                if not device.link:
                    raise OSError("Connect COM3 first.")
                result = deliver(payload, self.server.database, UsbDemo(device.link), timeout=5)
                if result["status"] == "unconfirmed":
                    device.close()
            else:
                self.reply(404, {})
                return
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.reply(400, {"error":str(error)})
            return
        self.reply(200, result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--page", type=Path, required=True)
    parser.add_argument("--db", required=True)
    args = parser.parse_args()
    with HTTPServer(ADDRESS, Handler) as server:
        server.page = args.page.read_bytes()
        server.database = args.db
        server.device = Device("COM3")
        print("Slotty USB demo:", ORIGIN, flush=True)
        webbrowser.open(ORIGIN)
        try:
            server.serve_forever()
        finally:
            server.device.close()
