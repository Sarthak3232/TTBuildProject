"""Opt-in native inference check; no camera, personal images, or fake runtime."""

import base64
from io import BytesIO
import json

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
import pytest

from app.inference.images import decode_jpeg
from app.inference.orientation import RULE_VERSION
from app.main import create_app
from app.models.fetch import load_manifest

pytestmark = pytest.mark.model_smoke


def test_real_models_serve_a_synthetic_frame(monkeypatch):
    # Use only the manifest's default directory; an inherited local override
    # must not hide missing or invalid fetched assets.
    monkeypatch.delenv("ML_MODEL_DIR", raising=False)
    token = "ci-only-internal-token-not-a-production-secret"
    monkeypatch.setenv("ML_INTERNAL_TOKEN", token)
    manifest = load_manifest()

    with Image.new("RGB", (160, 120), (50, 50, 50)) as image:
        draw = ImageDraw.Draw(image)
        for y in range(0, 120, 10):
            for x in range(0, 160, 10):
                if (x // 10 + y // 10) % 2:
                    draw.rectangle((x, y, x + 9, y + 9), fill=(180, 180, 180))
        with BytesIO() as buffer:
            image.save(buffer, format="JPEG")
            payload = buffer.getvalue()

    # A flat/dark fixture would return before native inference, giving false
    # confidence that the real models and their shared libraries can execute.
    pixels = decode_jpeg(payload)
    assert pixels is not None
    pixels.fill(0)

    calibration = {
        "v": 1,
        "screen": {"yaw": 0, "pitch": 0},
        "book": {"yaw": 0, "pitch": -45},
        "yawToleranceDeg": 25,
        "pitchToleranceDeg": 25,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "image/jpeg",
        "X-Study-Session": "ci-model-smoke",
        "X-Frame-Sequence": "1",
        "X-Calibration-Id": "ci-calibration",
        "X-Request-Id": "ci-request-1",
        "X-Calibration": base64.urlsafe_b64encode(
            json.dumps(calibration).encode()
        ).decode().rstrip("="),
    }

    app = create_app()
    with TestClient(app) as client:
        assert client.get("/health/live").status_code == 200
        readiness = client.get("/health/ready")
        assert readiness.status_code == 200, readiness.text
        assert readiness.json() == {
            "ready": True,
            "modelVersion": manifest["model_version"],
            "ruleVersion": RULE_VERSION,
        }
        assert client.post("/v1/focus/classify", content=payload).status_code == 401

        response = client.post("/v1/focus/classify", headers=headers, content=payload)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["state"] == "away"
        assert data["reason"] == "no_person_detected"
        assert data["sessionId"] == "ci-model-smoke"
        assert data["sequence"] == 1
        assert data["modelVersion"] == manifest["model_version"]
        assert data["ruleVersion"] == RULE_VERSION
        assert data["processingMs"] >= 0
        assert set(data) == {
            "sessionId", "sequence", "observedAt", "state", "reason",
            "modelVersion", "ruleVersion", "processingMs",
        }

    assert not app.state.runtime.ready
