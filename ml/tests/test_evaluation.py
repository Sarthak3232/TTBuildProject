import json

import pytest

from devtools.evaluation import Evaluation, SCENARIOS


def response(state="compatible", **changes):
    return {"state": state, "modelVersion": "model-v1", "ruleVersion": "rules-v1", **changes}


def test_settling_and_label_change_discard_pending_result():
    evaluation = Evaluation("model-v1", "rules-v1")
    evaluation.select("screen", 0)
    assert evaluation.ticket(1, 1) is None
    ticket = evaluation.ticket(2, 1)
    evaluation.select("book", 3)
    evaluation.record(ticket, response(), 3)
    assert evaluation.summary()["successful_predictions"] == 0
    assert evaluation.summary()["discarded_results"] == 1


def test_unknown_predictions_are_errors_for_verifiable_scenarios():
    evaluation = Evaluation("model-v1", "rules-v1")
    for scenario, state in [("screen", "unknown"), ("turn_away", "away"), ("low_light", "unknown")]:
        evaluation.select(scenario, 0)
        evaluation.record(evaluation.ticket(2, 1), response(state), 2.1)
    summary = evaluation.summary()
    assert summary["balanced_accuracy_compatible_away"] == 0.5
    assert summary["confusion_matrix"]["compatible"]["unknown"] == 1
    assert summary["unknown_scenario_accuracy"] == 1
    assert not summary["coverage_complete"] and not summary["local_target_met"]


def test_failures_reported_separately_and_reduce_operational_accuracy():
    evaluation = Evaluation("model-v1", "rules-v1")
    evaluation.select("screen", 0)
    evaluation.record(evaluation.ticket(2, 1), response(), 2.1)
    evaluation.failure(evaluation.ticket(3, 1))
    evaluation.select("turn_away", 4)
    evaluation.record(evaluation.ticket(6, 1), response("away"), 6.1)
    summary = evaluation.summary()
    assert summary["balanced_accuracy_compatible_away"] == 1
    assert summary["balanced_operational_accuracy_compatible_away"] == 0.75
    assert summary["prediction_coverage"] == pytest.approx(2 / 3)
    assert summary["request_failures"] == 1


def test_stale_and_version_changed_results_never_improve_accuracy():
    evaluation = Evaluation("model-v1", "rules-v1")
    evaluation.select("screen", 0)
    evaluation.record(evaluation.ticket(2, 1), response(), 6)
    evaluation.record(evaluation.ticket(7, 1), response(modelVersion="other-model"), 7.1)
    summary = evaluation.summary()
    assert summary["successful_predictions"] == 0
    assert summary["request_failures"] == 1
    assert summary["discarded_results"] == 1
    assert evaluation.active is None


def test_complete_local_run_requires_every_declared_scenario():
    evaluation = Evaluation("model-v1", "rules-v1")
    for scenario, (_, expected) in SCENARIOS.items():
        evaluation.select(scenario, 0)
        for i in range(10):
            evaluation.record(evaluation.ticket(2 + i, 1), response(expected), 2.1 + i)
    summary = evaluation.summary()
    assert summary["coverage_complete"] and summary["local_target_met"]
    assert summary["formal_evaluation_status"] == "not_assessed"
    assert summary["balanced_accuracy_compatible_away"] == 1


def test_saved_report_contains_only_aggregate_allowlisted_data(tmp_path):
    evaluation = Evaluation("model-v1", "rules-v1")
    evaluation.select("screen", 0)
    evaluation.record(evaluation.ticket(2, 1), response(image="private-image", landmarks=[1, 2], token="secret"), 2.1)
    path = evaluation.save(tmp_path)
    report = json.loads(path.read_text(encoding="utf-8"))
    assert report["successful_predictions"] == 1
    text = path.read_text(encoding="utf-8")
    assert all(secret not in text for secret in ("private-image", "landmarks", "secret", "token"))
    assert "records" not in report and "samples" not in report


def test_empty_run_has_no_accuracy_claim():
    report = Evaluation("model-v1", "rules-v1").summary()
    assert report["balanced_accuracy_compatible_away"] is None
    assert report["prediction_coverage"] is None
    assert not report["local_target_met"]


def test_evaluation_cli_saves_report_without_opening_camera(tmp_path, monkeypatch):
    from devtools import webcam

    monkeypatch.setenv("ML_INTERNAL_TOKEN", "test-only-token-01234567890123456789")
    monkeypatch.setattr("sys.argv", ["webcam", "--evaluate"])
    monkeypatch.setattr(webcam.LocalService, "readiness", lambda self: {
        "modelVersion": "model-v1", "ruleVersion": "rules-v1",
    })

    def fake_camera(service, flow, cv, camera_index, evaluation):
        # The real camera loop is never invoked by this test.
        evaluation.select("screen", 0)
        evaluation.record(evaluation.ticket(2, flow.generation), response(), 2.1)

    original_save = Evaluation.save
    monkeypatch.setattr(webcam, "run_camera", fake_camera)
    monkeypatch.setattr(Evaluation, "save", lambda self: original_save(self, tmp_path))
    webcam.main()
    reports = list(tmp_path.glob("*.json"))
    assert len(reports) == 1
    assert json.loads(reports[0].read_text())["successful_predictions"] == 1
