"""DEVELOPMENT ONLY: local webcam/API harness. Never records images or video.

Run explicitly: uv run --directory ml python -m devtools.webcam
Nothing opens a camera on import. This is not the browser client, a study timer,
a formal accuracy benchmark, or production calibration/session orchestration.
"""

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from getpass import getpass
import json
import os
import re
import time
from uuid import uuid4

import httpx

from app.auth import configured_token
from app.inference.orientation import Calibration, CalibrationSample, Orientation, calibration_reference
from devtools.evaluation import Evaluation

WINDOW = "DEV ONLY - Studbot webcam harness - NO RECORDING"


class HarnessError(Exception):
    """A safe, user-facing message without payloads or credentials."""


class StatusFeedback:
    """Basic harness only: console transitions and optional Windows tones."""

    TONES = {"compatible": 1000, "away": 400, "unknown": 650}

    def __init__(self, audio=False, beep=None):
        self.last_status = None
        self.last_state = None
        self.started = time.monotonic()
        self.executor = None
        self.future = None
        self.beep = None
        if audio:
            if beep is None:
                try:
                    import winsound
                except ImportError:
                    raise HarnessError("Audio tones require Windows; omit --audio for console output") from None
                beep = winsound.Beep
            self.beep = beep
            self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="studbot-dev-audio")

    def update(self, status):
        if status == self.last_status:
            return
        self.last_status = status
        print(f"[+{time.monotonic() - self.started:.1f}s] {status}", flush=True)
        state = status.split(" - ", 1)[0]
        if state not in self.TONES:
            self.last_state = None
            return
        if state != self.last_state and self.executor is not None:
            if self.future is None or self.future.done():
                self.future = self.executor.submit(self._play, self.TONES[state])
        self.last_state = state

    def _play(self, frequency):
        try:
            self.beep(frequency, 150)
        except (RuntimeError, OSError):
            print("Audio unavailable; console feedback remains active.", flush=True)

    def close(self):
        if self.executor is not None:
            self.executor.shutdown(wait=True, cancel_futures=True)


class CalibrationFlow:
    def __init__(self, model_version: str, rule_version: str):
        self.versions = (model_version, rule_version)
        self.generation = 0
        self.reset()

    def reset(self):
        self.generation += 1
        self.calibration_id = str(uuid4())
        self.mode = "screen_prompt"
        self.samples = []
        self.screen = None
        self.calibration = None
        self.calibrated_at = None
        self.last_result_at = None
        self.status = "Face screen; press S to begin screen calibration"

    @property
    def can_sample(self):
        return self.mode in ("screen", "book", "classify")

    def start_screen(self):
        self.reset()
        self.mode = "screen"
        self.status = "Hold screen-facing position for 5 usable seconds"

    def start_book(self):
        if self.mode == "book_prompt":
            self.mode = "book"
            self.samples = []
            self.status = "Hold normal reading/writing position for 5 usable seconds"

    def error(self, message):
        self.samples = []
        self.status = "unknown - " + message

    def expire(self, now):
        if self.calibrated_at is not None and now - self.calibrated_at >= 24 * 60 * 60:
            self.reset()
            self.status = "Calibration expired; press S to recalibrate"

    def receive(self, data, captured_at, generation):
        if generation != self.generation:
            return  # A reset makes a pending response obsolete.
        versions = (data.get("modelVersion"), data.get("ruleVersion"))
        if versions != self.versions:
            self.versions = versions
            self.reset()
            self.status = "Service model/rules changed; press S to recalibrate"
            return
        if self.mode in ("screen", "book"):
            if data.get("phase") != self.mode or data.get("usable") is not True:
                self.error("view unverifiable; adjust lighting/position and hold still")
                return
            orientation = Orientation(data["yaw"], data["pitch"])
            if self.samples and captured_at - self.samples[-1].seconds > 3:
                self.samples = []
            self.samples.append(CalibrationSample(captured_at, orientation))
            span = captured_at - self.samples[0].seconds
            self.status = f"{self.mode}: {len(self.samples)} usable samples, {min(span, 5):.1f}/5 seconds"
            if len(self.samples) >= 4 and span >= 5:
                reference = calibration_reference(self.samples)
                self.samples = []
                if self.mode == "screen":
                    self.screen = reference
                    self.mode = "book_prompt"
                    self.status = "Now face book/notebook; press B for book calibration"
                else:
                    self.calibration = Calibration(self.screen, reference)
                    self.calibrated_at = captured_at
                    self.mode = "classify"
                    self.status = "Calibrated; waiting for first classification"
        elif self.mode == "classify":
            state, reason = data.get("state"), data.get("reason")
            if state not in ("compatible", "away", "unknown") or not isinstance(reason, str) or not re.fullmatch(r"[a-z_]{1,80}", reason):
                raise ValueError("Unexpected classification response")
            self.last_result_at = captured_at
            self.status = f"{state} - {reason}"


class LocalService:
    def __init__(self, client: httpx.Client, token: str):
        self.client = client
        self.token = token
        self.session_id = "dev-" + str(uuid4())

    def readiness(self):
        try:
            response = self.client.get("/health/ready")
            if response.status_code != 200:
                raise HarnessError("Service is not ready; check models and ML_INTERNAL_TOKEN")
            data = response.json()
            if data.get("ready") is not True or not all(isinstance(data.get(key), str) for key in ("modelVersion", "ruleVersion")):
                raise HarnessError("Restart the service with the current classifier code")
            return data
        except (httpx.HTTPError, ValueError):
            raise HarnessError("Cannot reach a ready local service; start Uvicorn first") from None

    def send(self, payload, sequence, calibration_id, phase, calibration):
        headers = {
            "Authorization": "Bearer " + self.token, "Content-Type": "image/jpeg",
            "X-Study-Session": self.session_id, "X-Frame-Sequence": str(sequence),
            "X-Calibration-Id": calibration_id, "X-Request-Id": str(uuid4()),
        }
        if phase is not None:
            path = "/v1/focus/calibration-observation"
            headers["X-Calibration-Phase"] = phase
        else:
            path = "/v1/focus/classify"
            value = {"v": 1, "screen": vars(calibration.screen), "book": vars(calibration.book),
                     "yawToleranceDeg": 25, "pitchToleranceDeg": 25}
            headers["X-Calibration"] = base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
        try:
            response = self.client.post(path, headers=headers, content=payload)
            if response.status_code == 401:
                raise HarnessError("HTTP 401: check the shared service token")
            if response.status_code != 200:
                raise HarnessError(f"HTTP {response.status_code}: frame unavailable")
            data = response.json()
            if data.get("sessionId") != self.session_id or data.get("sequence") != sequence:
                raise HarnessError("Mismatched frame response; result discarded")
            return data
        except httpx.HTTPError:
            raise HarnessError("Local service request failed or timed out") from None
        except (ValueError, AttributeError):
            raise HarnessError("Invalid response from local service") from None


def encode_frame(frame, cv):
    height, width = frame.shape[:2]
    if not width or not height:
        raise HarnessError("Camera returned an empty frame")
    scale = min(1, 640 / width, 480 / height)
    resized = cv.resize(frame, (max(1, int(width * scale)), max(1, int(height * scale))))
    for quality in (80, 65, 50):
        ok, encoded = cv.imencode(".jpg", resized, [cv.IMWRITE_JPEG_QUALITY, quality])
        if ok and encoded.nbytes <= 256 * 1024:
            return encoded.tobytes()
    raise HarnessError("Could not encode a JPEG within the 256 KiB limit")


def run_camera(service, flow, cv, camera_index, evaluation=None, feedback=None):
    camera = None
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="studbot-dev-http")
    pending = None
    next_sample = 0
    sequence = 0
    try:
        camera = cv.VideoCapture(camera_index)
        if not camera.isOpened():
            raise HarnessError("Cannot open camera; check permissions or try --camera 1")
        cv.namedWindow(WINDOW, cv.WINDOW_NORMAL)
        while True:
            ok, frame = camera.read()
            if not ok:
                raise HarnessError("Camera stopped returning frames")
            now = time.monotonic()
            previous_generation = flow.generation
            flow.expire(now)
            if evaluation is not None and previous_generation != flow.generation:
                evaluation.pause()
            if pending is not None and pending[0].done():
                future, captured_at, generation, ticket = pending
                pending = None
                try:
                    data = future.result()
                    flow.receive(data, captured_at, generation)
                    if evaluation is not None:
                        if generation != flow.generation:
                            if (data.get("modelVersion"), data.get("ruleVersion")) != evaluation.versions:
                                evaluation.version_changed = True
                            evaluation.pause()
                        evaluation.record(ticket, data, now)
                except HarnessError as error:
                    if evaluation is not None:
                        evaluation.failure(ticket)
                    if "HTTP 401" in str(error):
                        raise
                    if generation == flow.generation:
                        flow.error(str(error))
                except (ValueError, KeyError, TypeError, AttributeError):
                    if evaluation is not None:
                        evaluation.failure(ticket)
                    if generation == flow.generation:
                        flow.error("invalid observation response")
            status = flow.status
            if flow.last_result_at is not None and now - flow.last_result_at > 3 and flow.mode == "classify":
                status = "unknown - waiting for a fresh result"
            if feedback is not None and evaluation is None:
                feedback.update(status)
            # Annotate a separate preview; uploaded pixels contain no overlays.
            preview = frame.copy()
            lines = ["DEV ONLY | NO RECORDING | no timer or tokens", "S: screen  B: book  R: reset  Q/Esc: quit", status]
            if evaluation is not None:
                lines.append(evaluation.display(now))
            for index, line in enumerate(lines):
                cv.putText(preview, line, (10, 25 + index * 25), cv.FONT_HERSHEY_SIMPLEX,
                           0.5, (0, 255, 0), 1, cv.LINE_AA)
            cv.imshow(WINDOW, preview)
            key = cv.waitKey(10) & 0xFF
            if key in (ord("q"), ord("Q"), 27) or cv.getWindowProperty(WINDOW, cv.WND_PROP_VISIBLE) < 1:
                break
            if key in (ord("s"), ord("S")):
                flow.start_screen()
                if evaluation is not None:
                    evaluation.pause()
            elif key in (ord("b"), ord("B")):
                flow.start_book()
            elif key in (ord("r"), ord("R")):
                flow.reset()
                if evaluation is not None:
                    evaluation.pause()
            elif evaluation is not None and key == ord("0"):
                evaluation.pause()
            elif evaluation is not None and ord("1") <= key <= ord("9") and flow.mode == "classify":
                from devtools.evaluation import SCENARIOS

                evaluation.select(list(SCENARIOS)[key - ord("1")], now)
            if flow.can_sample and pending is None and now >= next_sample:
                next_sample = now + 1
                try:
                    payload = encode_frame(frame, cv)
                except HarnessError as error:
                    flow.error(str(error))
                    continue
                sequence += 1
                phase = flow.mode if flow.mode in ("screen", "book") else None
                future = executor.submit(service.send, payload, sequence, flow.calibration_id, phase, flow.calibration)
                ticket = evaluation.ticket(now, flow.generation) if evaluation is not None and phase is None else None
                pending = (future, now, flow.generation, ticket)
                payload = None
    finally:
        try:
            if camera is not None:
                camera.release()
        finally:
            try:
                cv.destroyAllWindows()
            finally:
                # Camera closes immediately; finish at most one bounded HTTP call.
                executor.shutdown(wait=True, cancel_futures=True)


def main():
    parser = argparse.ArgumentParser(description="DEVELOPMENT ONLY: local Studbot webcam harness; no recording")
    parser.add_argument("--camera", type=int, default=0, help="Local camera index (default 0)")
    parser.add_argument("--port", type=int, default=8000, help="Local API port (default 8000)")
    parser.add_argument("--evaluate", action="store_true", help="DEV evaluation: score selected scenarios and save aggregate labels/counts on exit")
    parser.add_argument("--audio", action="store_true", help="Basic harness only: Windows state-change tones (high=compatible, low=away, middle=unknown)")
    args = parser.parse_args()
    if args.camera < 0 or not 1 <= args.port <= 65535:
        parser.error("Camera must be nonnegative and port must be 1..65535")
    if args.audio and args.evaluate:
        parser.error("--audio is for the basic harness; omit --evaluate")
    print("DEVELOPMENT ONLY - Studbot webcam harness. No images/video are saved.")
    print("Frames go only to http://127.0.0.1 on the selected port; no browser, timers, or rewards.")
    token = os.getenv("ML_INTERNAL_TOKEN") or getpass("Paste the SAME ML_INTERNAL_TOKEN used by your server (hidden): ")
    if configured_token(token) is None:
        parser.exit(1, "Set a valid shared ML_INTERNAL_TOKEN (32+ ASCII characters) first.\n")
    evaluation = None
    feedback = None
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{args.port}", trust_env=False,
                          follow_redirects=False, timeout=httpx.Timeout(3, connect=1)) as client:
            service = LocalService(client, token)
            ready = service.readiness()
            flow = CalibrationFlow(ready["modelVersion"], ready["ruleVersion"])
            if args.evaluate:
                evaluation = Evaluation(ready["modelVersion"], ready["ruleVersion"])
                print("EVALUATION MODE: after calibration, keys 1-9 select scenarios; 0 pauses scoring.")
                print("On exit, only aggregate labels/counts and versions are saved under devtools/results/.")
            print("Opening webcam preview. Click its window; S starts calibration, Q quits.")
            import cv2

            try:
                if args.evaluate:
                    run_camera(service, flow, cv2, args.camera, evaluation)
                else:
                    feedback = StatusFeedback(audio=args.audio)
                    if args.audio:
                        print("Audio: high=compatible; low=away; middle=unknown. Tones play on state changes.")
                    run_camera(service, flow, cv2, args.camera, feedback=feedback)
            except cv2.error:
                raise HarnessError("Camera/preview failed; check camera access and desktop GUI support") from None
    except HarnessError as error:
        parser.exit(1, str(error) + "\n")
    except KeyboardInterrupt:
        print("Stopped; camera released.")
    finally:
        if feedback is not None:
            feedback.close()
        if evaluation is not None:
            try:
                path = evaluation.save()
                summary = evaluation.summary()
                print(f"Saved aggregate-only evaluation: {path}")
                print(f"Predictions: {summary['successful_predictions']}; request failures: {summary['request_failures']}")
                score = summary["balanced_accuracy_compatible_away"]
                print("Compatible/away balanced accuracy: " + (f"{score:.1%}" if score is not None else "not enough labeled data"))
                print("Formal evaluation: not assessed. See scenario coverage and limitations in the report.")
            except OSError:
                print("Could not save the aggregate evaluation report; no image/video was saved.")


if __name__ == "__main__":
    main()
