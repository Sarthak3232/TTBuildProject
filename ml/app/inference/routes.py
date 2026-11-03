"""Private one-process inference API. Next owns verified-user rate limits,
durable replay protection, calibration expiry, and ownership checks. This
service additionally bounds per-session requests and retains sequence counters
for up to 4096 session IDs per process lifetime; it rejects new IDs at capacity
rather than silently forgetting replay state. Run a single Uvicorn worker.
"""

import asyncio
import base64
import binascii
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.requests import ClientDisconnect

from app.auth import require_internal_token
from app.inference.images import MAX_FRAME_BYTES, FrameInputError, analyze_jpeg
from app.inference.orientation import Calibration, Orientation, RULE_VERSION, classify
from app.inference.runtime import RuntimeBusy

router = APIRouter(prefix="/v1/focus", dependencies=[Depends(require_internal_token)])


class AdmissionGate:
    def __init__(self):
        self.active: set[str] = set()
        self.history: dict[str, tuple[int, deque]] = {}

    @contextmanager
    def admit(self, session: str, sequence: int):
        if session in self.active:
            raise HTTPException(429, "Session already has an outstanding frame")
        if len(self.active) >= 2:
            raise HTTPException(503, "Inference capacity reached")
        previous, requests = self.history.get(session, (-1, deque()))
        if sequence <= previous:
            raise HTTPException(409, "Replayed or out-of-order frame")
        if session not in self.history and len(self.history) >= 4096:
            raise HTTPException(503, "Session capacity reached")
        now = time.monotonic()
        while requests and requests[0] <= now - 1:
            requests.popleft()
        if len(requests) >= 2:
            raise HTTPException(429, "Frame rate exceeded", headers={"Retry-After": "1"})
        # Accepted sequence numbers stay consumed even if upload/inference fails.
        requests.append(now)
        self.history[session] = (sequence, requests)
        self.active.add(session)
        try:
            yield
        finally:
            self.active.discard(session)


def identifier(request: Request, header: str) -> str:
    value = request.headers.get(header, "")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", value):
        raise HTTPException(422, "Missing or invalid request metadata")
    return value


def calibration_header(request: Request) -> Calibration:
    encoded = request.headers.get("X-Calibration", "")
    if len(encoded) > 2048:
        raise HTTPException(413, "Calibration header exceeds limit")
    try:
        if not encoded or not re.fullmatch(r"[A-Za-z0-9_-]+={0,2}", encoded):
            raise ValueError
        raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
        value = json.loads(raw)
        if set(value) != {"v", "screen", "book", "yawToleranceDeg", "pitchToleranceDeg"}:
            raise ValueError
        if type(value["v"]) is not int or value["v"] != 1:
            raise ValueError
        if any(type(value[key]) not in (float, int) or value[key] != 25 for key in ("yawToleranceDeg", "pitchToleranceDeg")):
            raise ValueError
        if any(set(value[key]) != {"yaw", "pitch"} for key in ("screen", "book")):
            raise ValueError
        return Calibration(Orientation(**value["screen"]), Orientation(**value["book"]))
    except (ValueError, TypeError, KeyError, UnicodeError, binascii.Error, RecursionError):
        raise HTTPException(422, "Invalid calibration header") from None


async def read_frame(request: Request) -> bytes:
    length = request.headers.get("Content-Length")
    if length is not None:
        if not re.fullmatch(r"[0-9]{1,12}", length):
            raise HTTPException(422, "Invalid content length")
        if int(length) > MAX_FRAME_BYTES:
            raise HTTPException(413, "JPEG body exceeds 256 KiB")
    data = bytearray()
    try:
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_FRAME_BYTES:
                raise HTTPException(413, "JPEG body exceeds 256 KiB")
            data.extend(chunk)
        return bytes(data)
    finally:
        data.clear()


async def handle_frame(request: Request, *, calibrating: bool):
    runtime = request.app.state.runtime
    if runtime is None or not runtime.ready:
        raise HTTPException(503, "Inference unavailable")
    if request.headers.get("Content-Type", "").lower().strip() != "image/jpeg":
        raise HTTPException(415, "Expected raw image/jpeg")
    if request.headers.get("Content-Encoding", "identity").lower() != "identity":
        raise HTTPException(415, "Content encoding is not supported")
    session = identifier(request, "X-Study-Session")
    identifier(request, "X-Calibration-Id")
    identifier(request, "X-Request-Id")
    sequence_value = request.headers.get("X-Frame-Sequence", "")
    if not re.fullmatch(r"0|[1-9][0-9]{0,15}", sequence_value) or int(sequence_value) > 2**53 - 1:
        raise HTTPException(422, "Invalid frame sequence")
    sequence = int(sequence_value)
    phase = request.headers.get("X-Calibration-Phase")
    if calibrating and phase not in ("screen", "book"):
        raise HTTPException(422, "Expected screen or book calibration phase")
    calibration = None if calibrating else calibration_header(request)
    payload = None
    started = time.monotonic()
    try:
        with request.app.state.frame_gate.admit(session, sequence):
            async with asyncio.timeout(3):
                payload = await read_frame(request)
                # Capture bytes by value; a late native call retains its own
                # bounded input until it exits, even if the HTTP request times out.
                observation = await runtime.process(
                    session, lambda pipeline, data=payload: analyze_jpeg(pipeline, data)
                )
            common = {
                "sessionId": session, "sequence": sequence,
                "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "modelVersion": runtime.model_version, "ruleVersion": RULE_VERSION,
                "processingMs": round((time.monotonic() - started) * 1000, 3),
            }
            if calibrating:
                usable = (observation.image_usable and observation.face_count == 1
                          and observation.orientation is not None and not observation.ambiguous)
                result = {**common, "usable": usable, "phase": phase}
                if usable:
                    result.update(yaw=observation.orientation.yaw, pitch=observation.orientation.pitch)
                return result
            classification = classify(observation, calibration)
            return {**common, "state": classification.state, "reason": classification.reason}
    except HTTPException:
        raise
    except FrameInputError as error:
        raise HTTPException(error.status_code, str(error)) from None
    except RuntimeBusy:
        raise HTTPException(429, "Inference worker is still busy") from None
    except ClientDisconnect:
        raise HTTPException(400, "Upload disconnected") from None
    except Exception:
        # Never return/log raw exception details or tracebacks with image locals.
        raise HTTPException(503, {"state": "unknown", "reason": "inference_unavailable"}) from None
    finally:
        payload = None


@router.post("/classify")
async def classify_frame(request: Request):
    return await handle_frame(request, calibrating=False)


@router.post("/calibration-observation")
async def calibration_observation(request: Request):
    return await handle_frame(request, calibrating=True)
