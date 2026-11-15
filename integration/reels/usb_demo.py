"""Send a stored roll over USB to the no-motion SlottyUsbDemo sketch."""
import argparse
import json
import time
from pathlib import Path

import serial
from bridge import deliver

HERE = Path(__file__).resolve().parent


class UsbDemo:
    def __init__(self, connection):
        self.connection = connection

    def write_line(self, line):
        print("Laptop -> ESP32:", line, flush=True)
        self.connection.write((line + "\n").encode("ascii"))

    def read_line(self, remaining):
        self.connection.timeout = remaining
        raw = self.connection.read_until(b"\n", size=256)
        if not raw.endswith(b"\n"):
            raise TimeoutError("missing complete USB reply")
        line = raw.decode("ascii", errors="replace").strip()
        print("ESP32 -> laptop:", line, flush=True)
        if line.startswith("SIM "):
            return line[4:]
        if line.startswith("ERR"):
            return line
        return ""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", default="COM3")
    parser.add_argument("--db", required=True)
    parser.add_argument("--roll", type=Path, default=HERE / "example-win.json")
    args = parser.parse_args()
    document = json.loads(args.roll.read_text(encoding="utf-8-sig"))
    with serial.Serial(args.port, 115200, timeout=0.5, write_timeout=2) as connection:
        # Opening a USB-UART connection can reset an ESP32.
        time.sleep(2)
        connection.reset_input_buffer()
        port = UsbDemo(connection)
        port.write_line("status")
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if connection.readline().strip() == b"READY SLOTTY USB SIM V1":
                break
        else:
            raise SystemExit("Upload SlottyUsbDemo first. No roll was claimed.")
        for check in ("Delivery", "Replay check"):
            result = deliver(document, args.db, port, timeout=5)
            print(check, "(simulated motion):", json.dumps(result))
            if result["status"] != "completed":
                return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as error:
        raise SystemExit(str(error))
