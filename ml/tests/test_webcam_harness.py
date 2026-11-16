from io import BytesIO
from types import SimpleNamespace

import httpx
import numpy as np
from PIL import Image
import pytest

from devtools.webcam import CalibrationFlow, HarnessError, LocalService, StatusFeedback, encode_frame, run_camera


def valid_sample(phase, **overrides):
    return {"usable": True, "yaw": 0, "pitch": -40 if phase == "book" else 0,
            "phase": phase, "modelVersion": "test-model", "ruleVersion": "test-rule", **overrides}


def test_two_pose_calibration_then_reset():
    flow = CalibrationFlow("test-model", "test-rule")
    assert not flow.can_sample
    flow.start_screen()
    generation = flow.generation
    for t in range(6):
        flow.receive(valid_sample("screen"), t, generation)
    assert flow.mode == "book_prompt" and not flow.can_sample
    flow.start_book()
    for t in range(6):
        flow.receive(valid_sample("book"), t + 10, generation)
    assert flow.mode == "classify"
    assert flow.calibration.book.pitch == -40
    previous = flow.calibration_id
    flow.reset()
    assert flow.calibration is None and flow.calibration_id != previous
    flow.receive(valid_sample("book"), 20, generation)
    assert flow.mode == "screen_prompt"


def test_unusable_sample_and_long_gap_restart_calibration():
    flow = CalibrationFlow("test-model", "test-rule")
    flow.start_screen()
    flow.receive(valid_sample("screen"), 0, flow.generation)
    flow.receive(valid_sample("screen", usable=False), 1, flow.generation)
    assert not flow.samples
    flow.receive(valid_sample("screen"), 2, flow.generation)
    flow.receive(valid_sample("screen"), 10, flow.generation)
    assert len(flow.samples) == 1 and flow.mode == "screen"


def test_model_change_invalidates_calibration():
    flow = CalibrationFlow("test-model", "test-rule")
    flow.start_screen()
    flow.receive(valid_sample("screen", modelVersion="changed-model"), 0, flow.generation)
    assert flow.mode == "screen_prompt" and flow.calibration is None


def test_frame_encoding_bounds_and_channel_order():
    import cv2

    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    frame[:, :, 2] = 255  # OpenCV BGR: red.
    payload = encode_frame(frame, cv2)
    assert len(payload) <= 256 * 1024
    with Image.open(BytesIO(payload)) as image:
        assert image.width <= 640 and image.height <= 480
        r, g, b = image.getpixel((0, 0))
        assert r > 240 and g < 10 and b < 10


def test_local_service_auth_sequence_and_calibration_headers():
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(200, json={"sessionId": request.headers["X-Study-Session"],
                                         "sequence": int(request.headers["X-Frame-Sequence"]),
                                         "usable": True, "yaw": 0, "pitch": 0})

    with httpx.Client(base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(respond)) as client:
        service = LocalService(client, "test-token")
        service.send(b"synthetic-jpeg", 1, "calibration", "screen", None)
        assert seen[0].headers["Authorization"] == "Bearer test-token"
        assert seen[0].headers["X-Calibration-Phase"] == "screen"
        assert "X-Calibration" not in seen[0].headers
        assert seen[0].content == b"synthetic-jpeg"


def test_network_errors_do_not_disclose_payloads_or_credentials():
    def respond(request):
        return httpx.Response(401, text="sensitive response body")

    with httpx.Client(base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(respond)) as client:
        service = LocalService(client, "sensitive-token")
        with pytest.raises(HarnessError) as error:
            service.send(b"private-image", 1, "calibration", "screen", None)
        assert str(error.value) == "HTTP 401: check the shared service token"


def test_basic_feedback_prints_transitions_and_tones_only_on_state_changes(capsys):
    tones = []
    feedback = StatusFeedback(audio=True, beep=lambda frequency, duration: tones.append((frequency, duration)))
    try:
        feedback.update("compatible - calibrated_screen")
        feedback.future.result(timeout=2)
        feedback.update("compatible - calibrated_screen")
        feedback.update("compatible - calibrated_book")
        feedback.update("away - outside_calibrated_positions")
        feedback.future.result(timeout=2)
        feedback.update("unknown - unusable_image")
        feedback.future.result(timeout=2)
    finally:
        feedback.close()
    assert tones == [(1000, 150), (400, 150), (650, 150)]
    output = capsys.readouterr().out
    assert output.count("calibrated_screen") == 1
    assert "calibrated_book" in output and "unusable_image" in output


@pytest.mark.parametrize("mode", ["quit", "read_failure", "unavailable", "display_failure"])
def test_camera_cleanup_without_opening_real_camera(mode):
    class FakeCamera:
        released = False

        def isOpened(self):
            return mode != "unavailable"

        def read(self):
            return mode != "read_failure", np.zeros((120, 160, 3), dtype=np.uint8)

        def release(self):
            self.released = True

    camera = FakeCamera()
    destroyed = []

    def display(*args):
        if mode == "display_failure":
            raise RuntimeError("GUI failed")

    cv = SimpleNamespace(
        VideoCapture=lambda index: camera, namedWindow=lambda *args: None,
        WINDOW_NORMAL=0, FONT_HERSHEY_SIMPLEX=0, LINE_AA=0,
        putText=lambda *args: None, imshow=display, waitKey=lambda delay: ord("q"),
        getWindowProperty=lambda *args: 1, WND_PROP_VISIBLE=0,
        destroyAllWindows=lambda: destroyed.append(True),
    )
    flow = CalibrationFlow("test-model", "test-rule")
    if mode == "quit":
        run_camera(None, flow, cv, 0)
    else:
        with pytest.raises((HarnessError, RuntimeError)):
            run_camera(None, flow, cv, 0)
    assert camera.released and destroyed
