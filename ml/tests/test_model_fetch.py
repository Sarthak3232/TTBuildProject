import hashlib
from io import BytesIO

import pytest

from app.models.fetch import fetch_asset, load_manifest


def asset_for(content: bytes) -> dict:
    return {
        "filename": "example.task",
        "url": "https://storage.googleapis.com/mediapipe-models/example/1/example.task",
        "size_bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def test_verified_download_and_cached_recheck(tmp_path, monkeypatch):
    content = b"verified model"
    calls = []

    def open_download(url, timeout):
        calls.append(url)
        return BytesIO(content)

    monkeypatch.setattr("app.models.fetch.urlopen", open_download)
    asset = asset_for(content)
    destination = fetch_asset(asset, tmp_path)
    assert destination.read_bytes() == content
    assert fetch_asset(asset, tmp_path) == destination
    assert calls == [asset["url"]]


@pytest.mark.parametrize("received", [b"bad model data", b"short", b"oversized model data"])
def test_corrupt_download_never_installs_or_leaves_partial(tmp_path, monkeypatch, received):
    monkeypatch.setattr("app.models.fetch.urlopen", lambda *a, **kw: BytesIO(received))
    with pytest.raises(ValueError):
        fetch_asset(asset_for(b"verified model"), tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_interrupted_download_cleans_partial_file(tmp_path, monkeypatch):
    class BrokenDownload(BytesIO):
        def read(self, size=-1):
            raise OSError("connection interrupted")

    monkeypatch.setattr("app.models.fetch.urlopen", lambda *a, **kw: BrokenDownload())
    with pytest.raises(OSError, match="interrupted"):
        fetch_asset(asset_for(b"verified model"), tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_corrupt_cached_asset_is_rejected_without_network(tmp_path, monkeypatch):
    destination = tmp_path / "example.task"
    destination.write_bytes(b"corrupt")

    def unexpected_network(*args, **kwargs):
        pytest.fail("cached corruption must be reported without downloading")

    monkeypatch.setattr("app.models.fetch.urlopen", unexpected_network)
    with pytest.raises(ValueError):
        fetch_asset(asset_for(b"verified model"), tmp_path)
    assert destination.read_bytes() == b"corrupt"


def test_manifest_rejects_unreviewed_license(tmp_path):
    import json

    manifest = load_manifest()
    manifest["models"][0]["license"] = "unreviewed"
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="license"):
        load_manifest(path)
