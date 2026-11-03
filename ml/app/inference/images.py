"""Bounded JPEG decoding and provisional quality checks, entirely in memory.

Quality defaults (mean luminance 20..235, standard deviation >=8, minimum
64-pixel sides) are conservative prototype heuristics requiring evaluation.
They cannot prove an unobstructed view or camera liveness. No EXIF rotation or
mirroring is applied: callers must supply upright, unmirrored canvas pixels.
"""

from io import BytesIO

import numpy as np
from PIL import Image, ImageStat, UnidentifiedImageError

from app.inference.orientation import Observation, observation_from_results

MAX_FRAME_BYTES = 256 * 1024


class FrameInputError(ValueError):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.status_code = status_code


def decode_jpeg(payload: bytes):
    """Return RGB pixels or None for poor quality, with no model execution."""
    if not payload or len(payload) > MAX_FRAME_BYTES:
        raise FrameInputError("Invalid JPEG body size", 413 if payload else 422)
    try:
        with BytesIO(payload) as buffer:
            with Image.open(buffer, formats=["JPEG"]) as source:
                width, height = source.size
                if width > 640 or height > 480:
                    raise FrameInputError("JPEG exceeds 640x480 dimensions", 413)
                source.load()
                with source.convert("RGB") as rgb:
                    with rgb.convert("L") as gray:
                        with gray.resize((64, 48)) as sample:
                            stats = ImageStat.Stat(sample)
                            usable = (width >= 64 and height >= 64
                                      and 20 <= stats.mean[0] <= 235 and stats.stddev[0] >= 8)
                    return np.array(rgb, dtype=np.uint8) if usable else None
    except FrameInputError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        # Do not expose codec messages, metadata, payloads, or native errors.
        raise FrameInputError("Invalid or corrupt JPEG") from None


def analyze_jpeg(pipeline, payload: bytes) -> Observation:
    """Runs inside a leased inference worker; never writes images to disk."""
    pixels = decode_jpeg(payload)
    if pixels is None:
        return Observation(False, 0)
    image = None
    try:
        import mediapipe as mp

        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=pixels)
        face, pose = pipeline.detect(image)
        return observation_from_results(face, pose, image_usable=True)
    finally:
        image = None
        pixels.fill(0)
