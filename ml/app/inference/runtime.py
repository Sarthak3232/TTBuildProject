"""Two independent IMAGE pipelines; no network, image logging, or wallet access.

A timeout stops waiting, not the native MediaPipe call. Its slot remains leased
until that call exits, preventing unsafe reuse or an accumulating work queue.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from importlib.metadata import version
from pathlib import Path

from app.models.fetch import MODEL_DIR, load_manifest, verify_asset


class RuntimeBusy(Exception):
    """The session or the two-slot pool is already processing work."""


class VisionPipeline:
    def __init__(self, model_dir: Path):
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision

        self._resources = ExitStack()
        try:
            self.face = self._resources.enter_context(
                vision.FaceLandmarker.create_from_options(
                    vision.FaceLandmarkerOptions(
                        base_options=python.BaseOptions(model_asset_path=str(model_dir / "face_landmarker.task")),
                        running_mode=vision.RunningMode.IMAGE,
                        num_faces=2,
                        min_face_detection_confidence=0.5,
                        min_face_presence_confidence=0.5,
                        output_facial_transformation_matrixes=True,
                        output_face_blendshapes=False,
                    )
                )
            )
            self.pose = self._resources.enter_context(
                vision.PoseLandmarker.create_from_options(
                    vision.PoseLandmarkerOptions(
                        base_options=python.BaseOptions(model_asset_path=str(model_dir / "pose_landmarker_lite.task")),
                        running_mode=vision.RunningMode.IMAGE,
                        min_pose_detection_confidence=0.5,
                        min_pose_presence_confidence=0.5,
                        output_segmentation_masks=False,
                    )
                )
            )
        except BaseException:
            self._resources.close()
            raise

    def detect(self, image):
        # Raw results remain internal; public classification comes in T040/T041.
        return self.face.detect(image), self.pose.detect(image)

    def close(self) -> None:
        self._resources.close()


class InferenceRuntime:
    def __init__(self, model_dir: Path = MODEL_DIR):
        self.model_dir = model_dir
        self.model_version: str | None = None
        self.ready = False
        self._pipelines = []
        self._resources = ExitStack()
        self._available = asyncio.Queue(maxsize=2)
        self._sessions: set[str] = set()
        self._executor: ThreadPoolExecutor | None = None

    def _verify_assets(self) -> str:
        manifest = load_manifest()
        if version("mediapipe") != manifest["runtime"]["mediapipe"]:
            raise ValueError("MediaPipe runtime does not match model manifest")
        for asset in [manifest["license_asset"], *manifest["models"]]:
            verify_asset(self.model_dir / asset["filename"], asset)
        return manifest["model_version"]

    def _create_pipeline(self):
        return VisionPipeline(self.model_dir)

    def start(self) -> None:
        if self.ready or self._pipelines:
            raise RuntimeError("Runtime instances can only be started once")
        self.model_version = self._verify_assets()
        try:
            for _ in range(2):
                pipeline = self._create_pipeline()
                self._resources.callback(pipeline.close)
                self._pipelines.append(pipeline)
                self._available.put_nowait(pipeline)
            self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="studbot-vision")
            self.ready = True
        except BaseException:
            self._resources.close()
            raise

    async def infer(self, session_id: str, image, *, timeout: float = 3):
        return await self.process(session_id, lambda pipeline: pipeline.detect(image), timeout=timeout)

    async def process(self, session_id: str, operation, *, timeout: float = 3):
        """Lease before decoding/processing; reject work instead of queuing it."""
        if not self.ready:
            raise RuntimeError("Models unavailable")
        if session_id in self._sessions:
            raise RuntimeBusy("Session already has an outstanding frame")
        try:
            pipeline = self._available.get_nowait()
        except asyncio.QueueEmpty:
            raise RuntimeBusy("Inference capacity reached") from None
        self._sessions.add(session_id)

        def release(future):
            # Retrieve failures even when a timed-out/cancelled caller has left.
            if not future.cancelled():
                future.exception()
            self._sessions.discard(session_id)
            self._available.put_nowait(pipeline)

        try:
            future = asyncio.get_running_loop().run_in_executor(self._executor, operation, pipeline)
        except BaseException:
            self._sessions.discard(session_id)
            self._available.put_nowait(pipeline)
            raise
        future.add_done_callback(release)
        return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)

    async def close(self) -> None:
        self.ready = False
        # Drain native calls before closing their model handles.
        if self._executor is not None:
            await asyncio.to_thread(self._executor.shutdown, wait=True)
            self._executor = None
        self._resources.close()
