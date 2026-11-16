"""Single-laptop bench bridge. Default mode requires no hardware or credentials."""
import argparse
import json
import sqlite3
import time
import webbrowser
from contextlib import closing
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
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
    return {"roll": {"id": key, "won": True, "slot": 3, "deliveryState": "hardware_pending"},
            "balanceAfterRoll": balance}


def wifi_jog(host, key):
    def request(path, post=False):
        req = Request(f"http://{host}{path}", method="POST" if post else "GET",
                      headers={"X-Slotty-Bench": "1"})
        with urlopen(req, timeout=6) as response:
            return response.read(128).decode()
    if request("/identity") != "SLOTTY BENCH JOG V1":
        raise ValueError("Unexpected device identity")
    request("/jog?id=" + key, True)
    for _ in range(12):
        detail = request("/receipt?id=" + key)
        if detail == "pulses finished" or detail.startswith("driver error on channel "):
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
        detail = send(str(UUID(doc["roll"]["id"])))
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
    parser.add_argument("--esp", help="Wi-Fi address of SlottyWifiJog, e.g. 192.168.4.1")
    parser.add_argument("--db", type=Path, default=HERE / "slotty-bench.sqlite")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    with closing(sqlite3.connect(args.db)) as db, HTTPServer(("127.0.0.1", 8765), Handler) as server:
        initialize(db)
        server.db = db
        server.mode = "ESP32 Wi-Fi jog" if args.esp else "Simulated shafts"
        server.send_jog = (lambda key: wifi_jog(args.esp, key)) if args.esp else (lambda key: "Simulated three jogs")
        print(ORIGIN, server.mode, args.db, flush=True)
        if not args.no_browser:
            webbrowser.open(ORIGIN)
        server.serve_forever()
