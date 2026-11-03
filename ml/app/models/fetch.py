"""From the repository root: uv run --directory ml python -m app.models.fetch.

Downloads are explicit, never performed by the API. Model-card license references
are reviewed metadata; this command verifies the declared license and license text,
not the legal applicability of an arbitrary model. Existing assets are rehashed.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit
from urllib.request import urlopen

MANIFEST_PATH = Path(__file__).with_name("manifest.json")
MODEL_DIR = Path(__file__).resolve().parents[2] / "models"
MAX_ASSET_BYTES = 32 * 1024 * 1024


def validate_asset(asset: dict) -> None:
    filename = asset.get("filename", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", filename):
        raise ValueError("Asset filename must be a plain filename")
    url = urlsplit(asset.get("url", ""))
    if url.scheme != "https" or url.hostname not in {
        "storage.googleapis.com", "www.apache.org"
    }:
        raise ValueError("Asset must use an approved HTTPS source")
    if not re.fullmatch(r"[a-f0-9]{64}", asset.get("sha256", "")):
        raise ValueError("Asset requires a pinned SHA-256")
    size = asset.get("size_bytes")
    if type(size) is not int or not 0 < size <= MAX_ASSET_BYTES:
        raise ValueError("Asset requires a bounded positive byte size")


def load_manifest(path: Path = MANIFEST_PATH) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or not manifest.get("models"):
        raise ValueError("Unsupported or empty model manifest")
    license_asset = manifest["license_asset"]
    if license_asset.get("id") != "Apache-2.0":
        raise ValueError("Unsupported license; review the manifest before fetching")
    for model in manifest["models"]:
        if model.get("license") != license_asset["id"] or not model.get("license_references"):
            raise ValueError("Model requires a reviewed license and references")
    assets = [license_asset, *manifest["models"]]
    for asset in assets:
        validate_asset(asset)
    if len({asset["filename"] for asset in assets}) != len(assets):
        raise ValueError("Asset filenames must be unique")
    return manifest


def verify_asset(path: Path, asset: dict) -> None:
    if path.stat().st_size != asset["size_bytes"]:
        raise ValueError(f"Size mismatch for {path.name}; remove invalid asset and retry")
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != asset["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path.name}; remove invalid asset and retry")


def fetch_asset(asset: dict, output_dir: Path) -> Path:
    validate_asset(asset)
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / asset["filename"]
    if destination.exists():
        verify_asset(destination, asset)
        return destination

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_dir, suffix=".part", delete=False) as target:
            temporary_path = Path(target.name)
            with urlopen(asset["url"], timeout=30) as response:
                total = 0
                while chunk := response.read(min(65536, asset["size_bytes"] - total + 1)):
                    total += len(chunk)
                    if total > asset["size_bytes"]:
                        raise ValueError(f"Download exceeds pinned size for {destination.name}")
                    target.write(chunk)
        verify_asset(temporary_path, asset)
        os.replace(temporary_path, destination)
        return destination
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main() -> None:
    manifest = load_manifest()
    # Verify license text before installing any model bundle.
    for asset in [manifest["license_asset"], *manifest["models"]]:
        path = fetch_asset(asset, MODEL_DIR)
        print(f"Verified {path.name}")


if __name__ == "__main__":
    main()
