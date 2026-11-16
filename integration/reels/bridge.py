"""Offline reel display prototype. Python 3.10+, standard library only."""
import argparse
import json
import sqlite3
import sys
import time
from contextlib import closing
from pathlib import Path
from uuid import UUID


def map_roll(document):
    """Read the single-roll response from PR 11 GET /api/rolls?id=..."""
    roll = document["roll"]
    roll_id = UUID(roll["id"])
    won, slot = roll["won"], roll["slot"]
    if won is True and type(slot) is int and 1 <= slot <= 4:
        state, target = "hardware_pending", slot - 1
    elif won is False and slot is None:
        state, target = "not_applicable", 4
    else:
        raise ValueError("inconsistent stored win/slot")
    if roll["deliveryState"] != state:
        raise ValueError("inconsistent stored deliveryState")
    return f"reel-display:{roll_id}", target


class Simulator:
    """Exclusive one-reel mock serial session. Motion finishes on a later tick."""

    def __init__(self, mode="normal"):
        self.mode = mode
        self.homed = False
        self.position = None
        self.commands = []
        self.reply = None
        self.motion = None

    def write_line(self, line):
        self.commands.append(line)
        if self.motion:
            self.reply = "ERR busy"
        elif line == "home":
            self.reply, self.motion = "OK homing", ("home", 0)
        elif self.homed and line in {f"spin {i}" for i in range(8)}:
            if self.mode == "reject-spin":
                self.reply = "ERR busy"
            else:
                self.reply, self.motion = "OK spinning", ("spin", int(line[-1]))
        else:
            self.reply = "ERR invalid target or unhomed reel"

    def read_line(self, remaining):
        if self.reply is not None:
            line, self.reply = self.reply, None
            return line
        if self.motion:
            op, self.position = self.motion
            self.motion = None
            self.homed = True
            if op != "spin" or self.mode != "drop-done":
                return "DONE " + op
        # Advance the simulated idle interval to the read deadline.
        raise TimeoutError("completion deadline expired")


class Rejected(Exception):
    pass


def command(port, line, timeout):
    deadline = time.monotonic() + timeout
    port.write_line(line)
    expected = "DONE " + line.split()[0]
    while (remaining := deadline - time.monotonic()) > 0:
        response = port.read_line(remaining)
        if response == expected:
            return
        if response == "ERR" or response.startswith("ERR "):
            raise Rejected(response)
    raise TimeoutError("completion deadline expired")


def deliver(document, database, port, timeout=30):
    event, target = map_roll(document)
    with closing(sqlite3.connect(database)) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS displays (
            event TEXT PRIMARY KEY, target INTEGER NOT NULL,
            status TEXT NOT NULL, detail TEXT NOT NULL)""")
        with db:
            inserted = db.execute("""INSERT INTO displays VALUES (?, ?, 'inflight',
                'Claimed; completion unconfirmed. Do not resend.') ON CONFLICT(event) DO NOTHING""",
                (event, target)).rowcount
            if not inserted:
                old, status, detail = db.execute(
                    "SELECT target, status, detail FROM displays WHERE event=?", (event,)
                ).fetchone()
                if old != target:
                    raise ValueError("existing event has a different stored outcome")
                return dict(eventId=event, target=target, status=status, detail=detail, replay=True)
        # Claim is durable before any command. A crash leaves an unresolved claim.
        try:
            command(port, "home", timeout)
            command(port, f"spin {target}", timeout)
            status, detail = "completed", "DONE spin"
        except Rejected as exc:
            status, detail = "failed", str(exc)
        except OSError as exc:  # Includes TimeoutError and disconnects.
            status, detail = "unconfirmed", str(exc)
        with db:
            db.execute("UPDATE displays SET status=?, detail=? WHERE event=?", (status, detail, event))
    return dict(eventId=event, target=target, status=status, detail=detail, replay=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roll", type=Path, help="saved single-roll GET JSON")
    parser.add_argument("--db", required=True, help="persistent local mock delivery ledger")
    parser.add_argument("--mode", choices=("normal", "reject-spin", "drop-done"), default="normal")
    args = parser.parse_args()
    port = Simulator(args.mode)
    try:
        result = deliver(json.loads(args.roll.read_text(encoding="utf-8-sig")), args.db, port)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2
    print(json.dumps({**result, "simulatedCommands": port.commands}))
    return 0 if result["status"] == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
