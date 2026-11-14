import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.auth import require_internal_token
from app.main import create_app
from app.inference.orientation import RULE_VERSION

TOKEN = "test-only-internal-token-0123456789"


class FakeRuntime:
    ready = False
    model_version = "test-model-v1"

    def start(self):
        self.ready = True

    async def close(self):
        self.ready = False


def test_lifespan_loads_models_and_closes_them(monkeypatch):
    monkeypatch.setenv("ML_INTERNAL_TOKEN", TOKEN)
    runtime = FakeRuntime()
    with TestClient(create_app(lambda: runtime)) as client:
        assert client.get("/health/live").json() == {"status": "alive"}
        response = client.get("/health/ready")
        assert response.status_code == 200
        assert response.json()["modelVersion"] == "test-model-v1"
        assert response.json()["ruleVersion"] == RULE_VERSION
    assert not runtime.ready


def test_missing_configuration_keeps_liveness_but_not_readiness(monkeypatch):
    monkeypatch.delenv("ML_INTERNAL_TOKEN", raising=False)
    with TestClient(create_app()) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 503


def test_failed_model_load_is_unavailable_and_does_not_leak_error(monkeypatch):
    monkeypatch.setenv("ML_INTERNAL_TOKEN", TOKEN)

    class BrokenRuntime(FakeRuntime):
        def start(self):
            raise ValueError("sensitive path or credential")

    with TestClient(create_app(BrokenRuntime)) as client:
        assert client.get("/health/live").status_code == 200
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert "sensitive" not in response.text


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer wrong", "Bearer \u00e9"])
def test_private_dependency_rejects_invalid_credentials(monkeypatch, header):
    monkeypatch.setenv("ML_INTERNAL_TOKEN", TOKEN)
    app = create_app(FakeRuntime)

    @app.get("/test-private", dependencies=[Depends(require_internal_token)])
    def private():
        return {"ok": True}

    with TestClient(app) as client:
        headers = {} if header is None else {b"Authorization": header.encode("utf-8")}
        response = client.get("/test-private", headers=headers)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert client.get("/test-private", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 200


def test_unconfigured_auth_fails_closed(monkeypatch):
    monkeypatch.delenv("ML_INTERNAL_TOKEN", raising=False)
    app = create_app()

    @app.get("/test-private", dependencies=[Depends(require_internal_token)])
    def private():
        return {"ok": True}

    with TestClient(app) as client:
        assert client.get("/test-private", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 503
