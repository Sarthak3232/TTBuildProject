"""Single-laptop bench bridge. Default mode requires no hardware or credentials."""
import argparse
import json
import sqlite3
import time
import webbrowser
from contextlib import closing
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID

from bridge import map_roll

ORIGIN = "http://127.0.0.1:8765"
HERE = Path(__file__).resolve().parent


def initialize(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS wallet(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
        INSERT OR IGNORE INTO wallet VALUES(1, 20);
        CREATE TABLE IF NOT EXISTS rehearsal(id TEXT PRIMARY KEY, balance INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS jogs(event TEXT PRIMARY KEY, target INTEGER, detail TEXT);
    """)


def rehearse(db, key):
    key = str(UUID(key))
    with db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT balance FROM rehearsal WHERE id=?", (key,)).fetchone()
        if row is None:
            if not db.execute("UPDATE wallet SET balance=balance-1 WHERE balance>0").rowcount:
                raise ValueError("The rehearsal wallet is empty.")
            balance, = db.execute("SELECT balance FROM wallet").fetchone()
            db.execute("INSERT INTO rehearsal VALUES (?,?)", (key, balance))
        else:
            balance, = row
    return {"roll": {"id": key, "won": True, "slot": 1, "deliveryState": "hardware_pending"},
            "balanceAfterRoll": balance}


def wifi_jog(host, key, target):
    deadline = time.monotonic() + 110
    def request(path, post=False):
        req = Request(f"http://{host}{path}", method="POST" if post else "GET",
                      headers={"X-Slotty-Bench": "1"})
        try:
            with urlopen(req, timeout=min(90, max(0.01, deadline - time.monotonic()))) as response:
                return response.read(128).decode()
        except HTTPError as error:
            error.close()
            raise
    if request("/identity") != "SLOTTY WIFI REELS V4":
        raise ValueError("Unexpected device identity")
    request(f"/spin?id={key}&target={target}", True)
    while time.monotonic() < deadline:
        detail = request("/receipt?id=" + key)
        if detail == "pulses finished":
            return "Unconfirmed: legacy receipt covers reel pulses only"
        if detail == "sequence finished" or detail == "reels finished; drawer unavailable" or detail.startswith("failed") or detail == "unconfirmed":
            return detail
        time.sleep(0.2)
    raise TimeoutError("No terminal pulse receipt")


def dispatch(db, doc, send):
    event, target = map_roll(doc)
    with db:
        claimed = db.execute("INSERT OR IGNORE INTO jogs VALUES (?,?,?)",
                             (event, target, "Unconfirmed; already claimed")).rowcount
        if not claimed:
            old, detail = db.execute("SELECT target,detail FROM jogs WHERE event=?", (event,)).fetchone()
            if old != target:
                raise ValueError("Conflicting target for saved event")
            return {"event": event, "target": target, "detail": detail, "replay": True}
    try:
        detail = send(str(UUID(doc["roll"]["id"])), target)
    except (OSError, ValueError) as exc:
        detail = f"Unconfirmed: {exc}"
    with db:
        db.execute("UPDATE jogs SET detail=? WHERE event=?", (detail, event))
    return {"event": event, "target": target, "detail": detail, "replay": False}


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body, mime="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self.reply(200, HERE.joinpath("bench.html").read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/state":
            balance, = self.server.db.execute("SELECT balance FROM wallet").fetchone()
            self.reply(200, {"mode": self.server.mode, "balance": balance})
        else:
            self.reply(404, {})

    def do_POST(self):
        origin = self.headers.get("Origin")
        if (self.headers.get("Host") != "127.0.0.1:8765" or
                self.headers.get("Content-Type") != "application/json" or
                (self.path == "/committed" and origin is not None) or
                (self.path == "/rehearse" and origin != ORIGIN)):
            return self.reply(403, {})
        try:
            size = int(self.headers.get("Content-Length", 0))
            if not 0 < size < 16384:
                raise ValueError("Invalid request size")
            doc = json.loads(self.rfile.read(size))
            if self.path == "/rehearse":
                doc = rehearse(self.server.db, doc["id"])
            elif self.path != "/committed":
                return self.reply(404, {})
            receipt = dispatch(self.server.db, doc, self.server.send_jog)
            print(self.server.mode, receipt, flush=True)
            self.reply(200, {**receipt, "mode": self.server.mode})
        except (ValueError, KeyError, TypeError, AttributeError, sqlite3.Error) as exc:
            self.reply(400, {"error": str(exc)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    transport = parser.add_mutually_exclusive_group()
    transport.add_argument("--mock-esp", action="store_true", help="Use explicitly mocked HTTP receiver on localhost:8766")
    transport.add_argument("--esp", help="Wi-Fi address of SlottyWifiJog V4, e.g. 192.168.4.1")
    parser.add_argument("--db", type=Path, default=None)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if args.mock_esp:
        args.esp = "127.0.0.1:8766"
    if args.db is None:
        args.db = HERE / ("slotty-mock-http.sqlite" if args.mock_esp else "slotty-physical.sqlite" if args.esp else "slotty-bench.sqlite")
    with closing(sqlite3.connect(args.db)) as db, HTTPServer(("127.0.0.1", 8765), Handler) as server:
        initialize(db)
        server.db = db
        server.mode = "MOCK ESP32 HTTP; no hardware" if args.mock_esp else "ESP32 Wi-Fi symbol positioning" if args.esp else "Simulated shafts"
        server.send_jog = (lambda key, target: wifi_jog(args.esp, key, target)) if args.esp else (lambda key, target: f"Simulated labels {([1, 2, 4] if target == 4 else [target + 1] * 3)}")
        print(ORIGIN, server.mode, args.db, flush=True)
        if not args.no_browser:
            webbrowser.open(ORIGIN)
        server.serve_forever()
