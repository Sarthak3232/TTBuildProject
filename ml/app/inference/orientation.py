"""Calibrated orientation rules, not a learned attention/learning detector.

MediaPipe's canonical-to-detected face transform supplies the head's forward
axis (third column). Yaw is atan2(x, z); pitch is atan2(-y, hypot(x, z)), in
degrees. Calibration and classification must use the same unmirrored image
convention. Translation, uniform positive scale, and rotation about that axis
do not affect its direction.

The caller must independently assess image usability. An empty detection alone
does not establish good lighting or an unobstructed camera. Model thresholds
are applied by VisionPipeline; MediaPipe does not return a per-face confidence
score here. No timing, persistence, camera access, or reward logic lives here.
"""

from dataclasses import dataclass
import math
from statistics import median
from typing import Literal, Sequence

RULE_VERSION = "orientation-v1"
TOLERANCE_DEG = 25.0
PRESENCE_THRESHOLD = 0.5


def finite_number(value) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


@dataclass(frozen=True)
class Orientation:
    yaw: float
    pitch: float

    def __post_init__(self):
        if not finite_number(self.yaw) or not -180 <= self.yaw <= 180:
            raise ValueError("Yaw must be finite degrees in [-180, 180]")
        if not finite_number(self.pitch) or not -90 <= self.pitch <= 90:
            raise ValueError("Pitch must be finite degrees in [-90, 90]")


@dataclass(frozen=True)
class Calibration:
    screen: Orientation
    book: Orientation

    def __post_init__(self):
        if not isinstance(self.screen, Orientation) or not isinstance(self.book, Orientation):
            raise ValueError("Both screen and book orientations are required")


@dataclass(frozen=True)
class CalibrationSample:
    seconds: float
    orientation: Orientation

    def __post_init__(self):
        if not finite_number(self.seconds) or self.seconds < 0:
            raise ValueError("Sample time must be finite nonnegative seconds")
        if not isinstance(self.orientation, Orientation):
            raise ValueError("Calibration sample requires a usable orientation")


@dataclass(frozen=True)
class Observation:
    image_usable: bool
    face_count: int
    orientation: Orientation | None = None
    body_present: bool = False
    ambiguous: bool = False

    def __post_init__(self):
        if type(self.face_count) is not int or self.face_count < 0:
            raise ValueError("Invalid face count")
        if any(type(flag) is not bool for flag in (self.image_usable, self.body_present, self.ambiguous)):
            raise ValueError("Usability/presence flags must be booleans")
        if self.orientation is not None and not isinstance(self.orientation, Orientation):
            raise ValueError("Invalid orientation")


@dataclass(frozen=True)
class Classification:
    state: Literal["compatible", "away", "unknown"]
    reason: str
    rule_version: str = RULE_VERSION


def angular_difference(angle: float, reference: float) -> float:
    return (angle - reference + 180) % 360 - 180


def calibration_reference(samples: Sequence[CalibrationSample]) -> Orientation:
    """Aggregate usable samples from one pose; never retain their imagery.

    This stateless helper is for tests/application coordinators. The trusted
    caller supplies monotonic observation times, filters unusable observations,
    manages screen/book phases, and invalidates expired/changed calibrations.
    """
    if len(samples) < 4:
        raise ValueError("At least four usable samples are required per pose")
    if any(right.seconds <= left.seconds for left, right in zip(samples, samples[1:])):
        raise ValueError("Calibration sample times must increase")
    if samples[-1].seconds - samples[0].seconds < 5:
        raise ValueError("Calibration must span at least five seconds per pose")
    anchor = samples[0].orientation.yaw
    yaw = median(anchor + angular_difference(sample.orientation.yaw, anchor) for sample in samples)
    return Orientation((yaw + 180) % 360 - 180, median(sample.orientation.pitch for sample in samples))


def orientation_from_matrix(matrix) -> Orientation:
    """Read a finite 4x4 rigid transform with optional uniform positive scale."""
    try:
        if len(matrix) != 4 or any(len(row) != 4 for row in matrix):
            raise ValueError("Expected a 4x4 face transform")
        rows = [[float(value) for value in row] for row in matrix]
    except (TypeError, OverflowError) as error:
        raise ValueError("Invalid face transform") from error
    if not all(math.isfinite(value) for row in rows for value in row):
        raise ValueError("Nonfinite face transform")
    if any(abs(rows[3][i] - expected) > 1e-4 for i, expected in enumerate((0, 0, 0, 1))):
        raise ValueError("Invalid homogeneous transform")
    columns = [[rows[i][j] for i in range(3)] for j in range(3)]
    lengths = [math.hypot(*column) for column in columns]
    if min(lengths) < 1e-8 or max(lengths) / min(lengths) > 1.05:
        raise ValueError("Degenerate or nonuniform transform")
    axes = [[value / length for value in column] for column, length in zip(columns, lengths)]
    if any(abs(sum(a * b for a, b in zip(axes[i], axes[j]))) > 0.05 for i, j in ((0, 1), (0, 2), (1, 2))):
        raise ValueError("Face transform axes are not orthogonal")
    a, b, c = axes
    determinant = (a[0] * (b[1] * c[2] - b[2] * c[1])
                   - b[0] * (a[1] * c[2] - a[2] * c[1])
                   + c[0] * (a[1] * b[2] - a[2] * b[1]))
    if determinant < 0.95:
        raise ValueError("Reflected or invalid rotation")
    x, y, z = c
    if math.hypot(x, z) < 1e-6:
        raise ValueError("Yaw is ambiguous at vertical orientation")
    return Orientation(math.degrees(math.atan2(x, z)), math.degrees(math.atan2(-y, math.hypot(x, z))))


def classify(observation: Observation, calibration: Calibration | None) -> Classification:
    if not observation.image_usable:
        return Classification("unknown", "unusable_image")
    if observation.face_count > 1:
        return Classification("unknown", "multiple_faces")
    if observation.ambiguous:
        return Classification("unknown", "ambiguous_observation")
    if observation.face_count == 0:
        if observation.body_present:
            return Classification("unknown", "face_unverifiable")
        return Classification("away", "no_person_detected")
    if observation.orientation is None:
        return Classification("unknown", "orientation_unverifiable")
    if calibration is None:
        return Classification("unknown", "calibration_required")
    for name, reference in (("screen", calibration.screen), ("book", calibration.book)):
        if (abs(angular_difference(observation.orientation.yaw, reference.yaw)) <= TOLERANCE_DEG
                and abs(observation.orientation.pitch - reference.pitch) <= TOLERANCE_DEG):
            return Classification("compatible", f"calibrated_{name}")
    return Classification("away", "outside_calibrated_positions")


def _finite_landmark(point) -> bool:
    return all(finite_number(getattr(point, axis, None)) for axis in ("x", "y", "z"))


def observation_from_results(face, pose, *, image_usable: bool) -> Observation:
    """Reduce MediaPipe results to transient aggregate features only.

    Both shoulders must be present/visible for coarse upper-body verification.
    Unreliable detected bodies are ambiguous, rather than an empty-chair claim.
    """
    faces = face.face_landmarks
    bodies = pose.pose_landmarks
    body_present = False
    ambiguous = len(bodies) > 1
    if bodies:
        body = bodies[0]
        if len(body) != 33:
            ambiguous = True
        else:
            def reliable(point):
                return _finite_landmark(point) and all(
                    finite_number(getattr(point, field, None))
                    and PRESENCE_THRESHOLD <= getattr(point, field) <= 1
                    for field in ("presence", "visibility")
                )
            body_present = all(reliable(body[index]) for index in (11, 12))
            ambiguous = ambiguous or not body_present
    orientation = None
    if len(faces) == 1:
        matrices = face.facial_transformation_matrixes
        if len(faces[0]) != 478 or not all(_finite_landmark(point) for point in faces[0]) or len(matrices) != 1:
            ambiguous = True
        else:
            try:
                orientation = orientation_from_matrix(matrices[0])
            except ValueError:
                ambiguous = True
    return Observation(image_usable, len(faces), orientation, body_present, ambiguous)
