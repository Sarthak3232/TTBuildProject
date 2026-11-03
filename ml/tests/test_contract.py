import asyncio
import base64
from io import BytesIO
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from app.main import create_app
from app.inference.routes import AdmissionGate, read_frame
from app.inference.images import decode_jpeg
from starlette.requests import Request

TOKEN = "test-only-internal-token-0123456789"
CLASSIFY = "/v1/focus/classify"
CALIBRATE = "/v1/focus/calibration-observation"


def jpeg(size=(160, 120), *, dark=False, format="JPEG"):
    with Image.new("RGB", size) as image:
        if not dark:
            image.putdata([(50, 50, 50) if (x // 10 + y // 10) % 2 else (180, 180, 180)
                           for y in range(size[1]) for x in range(size[0])])
        with BytesIO() as buffer:
            image.save(buffer, format=format)
            return buffer.getvalue()


def headers(sequence=1, session="test-session"):
    calibration = {"v": 1, "screen": {"yaw": 0, "pitch": 0}, "book": {"yaw": 0, "pitch": -45},
                   "yawToleranceDeg": 25, "pitchToleranceDeg": 25}
    return {
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "image/jpeg",
        "X-Study-Session": session, "X-Frame-Sequence": str(sequence),
        "X-Calibration-Id": "test-calibration", "X-Request-Id": f"request-{sequence}",
        "X-Calibration": base64.urlsafe_b64encode(json.dumps(calibration).encode()).decode().rstrip("="),
    }


class FakePipeline:
    def __init__(self):
        self.count = 1

    def detect(self, image):
        point = SimpleNamespace(x=0.5, y=0.5, z=0.0)
        matrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, -40], [0, 0, 0, 1]]
        return (
            SimpleNamespace(face_landmarks=[[point] * 478 for _ in range(self.count)],
                            facial_transformation_matrixes=[matrix] * self.count),
            SimpleNamespace(pose_landmarks=[]),
        )


class FakeRuntime:
    ready = False
    model_version = "test-model-v1"

    def __init__(self):
        self.pipeline = FakePipeline()
        self.calls = 0
        self.error = None

    def start(self):
        self.ready = True

    async def close(self):
        self.ready = False

    async def process(self, session_id, operation, *, timeout=3):
        self.calls += 1
        if self.error:
            raise self.error
        return operation(self.pipeline)


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("ML_INTERNAL_TOKEN", TOKEN)
    runtime = FakeRuntime()
    with TestClient(create_app(lambda: runtime)) as client:
        yield client, runtime


def test_classify_contract_and_no_raw_features(service):
    client, runtime = service
    response = client.post(CLASSIFY, headers=headers(), content=jpeg())
    assert response.status_code == 200
    data = response.json()
    assert data["state"] == "compatible"
    assert data["reason"] == "calibrated_screen"
    assert data["sessionId"] == "test-session" and data["sequence"] == 1
    assert data["modelVersion"] == "test-model-v1" and data["ruleVersion"]
    assert data["processingMs"] >= 0 and data["observedAt"].endswith("Z")
    assert set(data) == {"sessionId", "sequence", "observedAt", "state", "reason", "modelVersion", "ruleVersion", "processingMs"}
    assert runtime.calls == 1


def test_calibration_contract_does_not_require_reference_header(service):
    client, _ = service
    metadata = headers()
    metadata.pop("X-Calibration")
    metadata["X-Calibration-Phase"] = "book"
    response = client.post(CALIBRATE, headers=metadata, content=jpeg())
    assert response.status_code == 200
    data = response.json()
    assert data["usable"] is True and data["yaw"] == 0 and data["pitch"] == 0
    assert data["phase"] == "book"
    assert "landmarks" not in response.text


@pytest.mark.parametrize("count,expected", [(0, "away"), (2, "unknown")])
def test_empty_and_multiple_faces(service, count, expected):
    client, runtime = service
    runtime.pipeline.count = count
    response = client.post(CLASSIFY, headers=headers(), content=jpeg())
    assert response.json()["state"] == expected


def test_dark_frame_and_unusable_calibration_never_qualify(service):
    client, _ = service
    assert client.post(CLASSIFY, headers=headers(), content=jpeg(dark=True)).json()["state"] == "unknown"
    metadata = headers(session="calibration-session")
    metadata["X-Calibration-Phase"] = "screen"
    data = client.post(CALIBRATE, headers=metadata, content=jpeg(dark=True)).json()
    assert data["usable"] is False
    assert "yaw" not in data and "pitch" not in data


def test_authentication_precedes_body_consumption(service):
    client, runtime = service
    read = []

    def body():
        read.append(True)
        yield b"private-image-marker"

    metadata = headers()
    metadata.pop("Authorization")
    response = client.post(CLASSIFY, headers=metadata, content=body())
    assert response.status_code == 401
    assert not read and runtime.calls == 0


@pytest.mark.parametrize("body,status", [(b"not-a-jpeg", 422), (jpeg(format="PNG"), 422), (jpeg((641, 480)), 413), (jpeg((480, 641)), 413), (b"x" * (256 * 1024 + 1), 413)])
def test_invalid_images_are_rejected(service, body, status):
    client, _ = service
    response = client.post(CLASSIFY, headers=headers(), content=body)
    assert response.status_code == status


def test_chunked_upload_limit_without_content_length(service):
    client, runtime = service
    response = client.post(CLASSIFY, headers=headers(), content=iter([b"x" * 100000] * 3))
    assert response.status_code == 413 and runtime.calls == 0


@pytest.mark.parametrize("field,value,status", [
    ("Content-Type", "application/json", 415),
    ("X-Calibration", "!bad-base64!", 422),
    ("X-Calibration", "A" * 2049, 413),
    ("X-Frame-Sequence", "-1", 422),
    ("X-Frame-Sequence", "1.5", 422),
    ("X-Study-Session", "", 422),
])
def test_invalid_headers(service, field, value, status):
    client, runtime = service
    metadata = headers()
    metadata[field] = value
    assert client.post(CLASSIFY, headers=metadata, content=jpeg()).status_code == status
    assert runtime.calls == 0


@pytest.mark.parametrize("change", [lambda c: c.update(v=2), lambda c: c["screen"].update(yaw=float("nan")), lambda c: c.update(yawToleranceDeg=180)])
def test_calibration_version_nonfinite_angles_and_threshold_override(service, change):
    client, _ = service
    metadata = headers()
    data = json.loads(base64.urlsafe_b64decode(metadata["X-Calibration"] + "=" * (-len(metadata["X-Calibration"]) % 4)))
    change(data)
    metadata["X-Calibration"] = base64.urlsafe_b64encode(json.dumps(data).encode()).decode()
    assert client.post(CLASSIFY, headers=metadata, content=jpeg()).status_code == 422


def test_replay_out_of_order_and_rate_limit(service):
    client, _ = service
    assert client.post(CLASSIFY, headers=headers(sequence=10), content=jpeg()).status_code == 200
    for sequence in (10, 9):
        assert client.post(CLASSIFY, headers=headers(sequence=sequence), content=jpeg()).status_code == 409
    assert client.post(CLASSIFY, headers=headers(sequence=11), content=jpeg()).status_code == 200
    assert client.post(CLASSIFY, headers=headers(sequence=12), content=jpeg()).status_code == 429


@pytest.mark.parametrize("error", [TimeoutError(), RuntimeError("private-image-marker credential")])
def test_inference_failure_is_sanitized_unavailable_not_compatible(service, error, caplog):
    client, runtime = service
    runtime.error = error
    response = client.post(CLASSIFY, headers=headers(), content=jpeg())
    assert response.status_code == 503
    assert "private-image-marker" not in response.text + caplog.text
    assert TOKEN not in response.text + caplog.text


def test_admission_limits_and_cancellation_cleanup():
    async def scenario():
        gate = AdmissionGate()
        with gate.admit("one", 1):
            with pytest.raises(Exception) as duplicate:
                with gate.admit("one", 2):
                    pass
            assert duplicate.value.status_code == 429
            with gate.admit("two", 1):
                with pytest.raises(Exception) as overload:
                    with gate.admit("three", 1):
                        pass
                assert overload.value.status_code == 503
        assert not gate.active
        with pytest.raises(asyncio.CancelledError):
            with gate.admit("cancelled", 1):
                raise asyncio.CancelledError
        assert not gate.active

    asyncio.run(scenario())


def test_streaming_stops_at_limit_without_consuming_remaining_body():
    async def scenario():
        chunks = iter([b"x" * 100000] * 4)
        consumed = []

        async def receive():
            consumed.append(True)
            return {"type": "http.request", "body": next(chunks), "more_body": True}

        request = Request({"type": "http", "headers": []}, receive=receive)
        with pytest.raises(Exception) as error:
            await read_frame(request)
        assert error.value.status_code == 413
        assert len(consumed) == 3

    asyncio.run(scenario())


def test_native_value_error_is_unavailable_not_invalid_upload(service):
    client, runtime = service

    def broken(image):
        raise ValueError("private-native-error")

    runtime.pipeline.detect = broken
    response = client.post(CLASSIFY, headers=headers(), content=jpeg())
    assert response.status_code == 503
    assert "private-native-error" not in response.text


def test_oversized_dimensions_rejected_before_pixel_decode(monkeypatch):
    payload = jpeg((641, 480))

    def unexpected_decode(*args, **kwargs):
        pytest.fail("Oversized dimensions must be rejected before loading pixels")

    from PIL import JpegImagePlugin
    monkeypatch.setattr(JpegImagePlugin.JpegImageFile, "load", unexpected_decode)
    with pytest.raises(ValueError):
        decode_jpeg(payload)
