"""Development-only, label-only evaluation. No image or per-frame persistence."""

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4

STATES = ("compatible", "away", "unknown")
# Stable scenario names and expected per-frame labels, selected by the operator.
SCENARIOS = {
    "screen": ("1: screen study", "compatible"),
    "book": ("2: book reading", "compatible"),
    "writing": ("3: writing", "compatible"),
    "turn_away": ("4: sustained turn-away", "away"),
    "empty_chair": ("5: empty chair", "away"),
    "short_glance": ("6: during a turned-away glance", "away"),
    "low_light": ("7: unverifiable low light/occlusion", "unknown"),
    "glasses": ("8: screen study wearing glasses", "compatible"),
    "multiple_people": ("9: multiple visible faces", "unknown"),
}
RESULTS_DIR = Path(__file__).resolve().parent / "results"


@dataclass(frozen=True)
class Ticket:
    scenario: str
    epoch: int
    captured_at: float
    generation: int


class Evaluation:
    def __init__(self, model_version, rule_version):
        self.versions = (model_version, rule_version)
        self.active = None
        self.epoch = 0
        self.settle_until = 0
        self.counts = {scenario: dict.fromkeys(STATES, 0) for scenario in SCENARIOS}
        self.failures = dict.fromkeys(SCENARIOS, 0)
        self.discarded = 0
        self.version_changed = False

    def select(self, scenario, now):
        if scenario not in SCENARIOS:
            raise ValueError("Unknown evaluation scenario")
        if self.version_changed:
            return  # Restart evaluation to assess a different version.
        self.epoch += 1
        self.active = scenario
        self.settle_until = now + 2

    def pause(self):
        self.epoch += 1
        self.active = None

    def ticket(self, now, generation):
        if self.active is None or now < self.settle_until or self.version_changed:
            return None
        return Ticket(self.active, self.epoch, now, generation)

    def _current(self, ticket):
        if ticket is None:
            return False
        if ticket.epoch != self.epoch or ticket.scenario != self.active:
            self.discarded += 1
            return False
        return True

    def record(self, ticket, data, now):
        if not self._current(ticket):
            return
        if (data.get("modelVersion"), data.get("ruleVersion")) != self.versions:
            self.discarded += 1
            self.version_changed = True
            self.pause()
            return
        if now - ticket.captured_at > 3 or data.get("state") not in STATES:
            self.failures[ticket.scenario] += 1
            return
        # Select only the label; discard all other response fields.
        self.counts[ticket.scenario][data["state"]] += 1

    def failure(self, ticket):
        if self._current(ticket):
            self.failures[ticket.scenario] += 1

    def display(self, now):
        if self.version_changed:
            return "EVAL stopped: versions changed; restart for a new report"
        if self.active is None:
            return "EVAL paused | 1-9: select scenario | 0: pause scoring"
        total = sum(self.counts[self.active].values())
        settling = " | settling" if now < self.settle_until else ""
        return f"EVAL {SCENARIOS[self.active][0]} | {total}/10+ predictions{settling}"

    def summary(self):
        matrix = {expected: dict.fromkeys(STATES, 0) for expected in STATES}
        failures_by_class = dict.fromkeys(STATES, 0)
        scenarios = {}
        for scenario, (_, expected) in SCENARIOS.items():
            counts = self.counts[scenario]
            for predicted in STATES:
                matrix[expected][predicted] += counts[predicted]
            failures_by_class[expected] += self.failures[scenario]
            scenarios[scenario] = {
                "expected": expected, "predictions": dict(counts),
                "successful_predictions": sum(counts.values()),
                "request_failures": self.failures[scenario],
                "minimum_predictions_met": sum(counts.values()) >= 10,
            }
        metrics = {}
        for state in STATES:
            actual = sum(matrix[state].values())
            predicted = sum(matrix[row][state] for row in STATES)
            tp = matrix[state][state]
            metrics[state] = {
                "precision": tp / predicted if predicted else None,
                "recall": tp / actual if actual else None,
                "f1": 2 * tp / (actual + predicted) if actual + predicted else None,
            }
        recalls = [metrics[state]["recall"] for state in ("compatible", "away")]
        balanced = sum(recalls) / 2 if all(value is not None for value in recalls) else None
        operational = []
        for state in ("compatible", "away"):
            attempts = sum(matrix[state].values()) + failures_by_class[state]
            operational.append(matrix[state][state] / attempts if attempts else None)
        balanced_operational = sum(operational) / 2 if all(value is not None for value in operational) else None
        total = sum(sum(counts.values()) for counts in self.counts.values())
        failures = sum(self.failures.values())
        complete = all(row["minimum_predictions_met"] for row in scenarios.values())
        return {
            "schema_version": 1,
            "model_version": self.versions[0], "rule_version": self.versions[1],
            "provenance": "Live development webcam; operator-selected scenario labels; no footage retained",
            "formal_evaluation_status": "not_assessed",
            "limitations": [
                "Single development run; not independent, held-out, or population-level validation",
                "Adjacent frames are correlated; scenario labels are operator supplied",
                "No study-time, stale-credit, five-second grace, or two-second resume validation",
            ],
            "confusion_matrix": matrix, "per_class_metrics": metrics,
            "balanced_accuracy_compatible_away": balanced,
            "balanced_operational_accuracy_compatible_away": balanced_operational,
            "unknown_scenario_accuracy": metrics["unknown"]["recall"],
            "successful_predictions": total, "request_failures": failures,
            "prediction_coverage": total / (total + failures) if total + failures else None,
            "discarded_results": self.discarded,
            "scenarios": scenarios, "coverage_complete": complete,
            "local_target_met": complete and balanced is not None and balanced >= 0.9 and not self.version_changed,
        }

    def save(self, directory=RESULTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc)
        path = directory / f"evaluation-{now.strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}.json"
        report = {**self.summary(), "generated_at_utc": now.isoformat()}
        with path.open("x", encoding="utf-8") as stream:
            json.dump(report, stream, indent=2, allow_nan=False)
            stream.write("\n")
        return path
