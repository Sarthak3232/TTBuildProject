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

RULE_VERSION = "forward-down-v2"
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
    rejection_reasons: tuple[str, ...] = ()

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
    if observation.ambiguous:
        return Classification("unknown", "ambiguous_observation")
    if observation.face_count == 0 and observation.orientation is None:
        if observation.body_present:
            return Classification("unknown", "face_unverifiable")
        return Classification("away", "no_person_detected")
    if observation.orientation is None:
        return Classification("unknown", "orientation_unverifiable")
    if calibration is None:
        return Classification("unknown", "calibration_required")
    # One continuous forward/downward range; a deeply lowered head does not
    # have to remain close to a face-derived book calibration angle.
    if (abs(angular_difference(observation.orientation.yaw, calibration.screen.yaw)) <= 35
            and -90 <= observation.orientation.pitch <= calibration.screen.pitch + 25):
        return Classification("compatible", "looking_down" if observation.orientation.pitch < calibration.screen.pitch - 15 else "looking_forward")
    return Classification("away", "outside_calibrated_positions")


def _finite_landmark(point) -> bool:
    return all(finite_number(getattr(point, axis, None)) for axis in ("x", "y", "z"))


def _reliable(point) -> bool:
    return _finite_landmark(point) and all(
        finite_number(getattr(point, field, None)) and PRESENCE_THRESHOLD <= getattr(point, field) <= 1
        for field in ("presence", "visibility")
    )


def _pose_orientation(body) -> Orientation | None:
    """Coarse posture fallback, using only visible head and shoulder points.

    This is a reading-posture heuristic, not a gaze or identity estimate.
    A lowered head with visible ears can qualify without a full face mesh.
    """
    left, right = body[11], body[12]
    width = abs(left.x - right.x)
    if width < 0.12 or not all(_reliable(body[i]) for i in (7, 8)):
        return None
    ear_left, ear_right = body[7], body[8]
    ear_span = abs(ear_left.x - ear_right.x)
    if ear_span < width * 0.15:
        return None
    # Relative ear depth detects sideways head rotation even when the nose is
    # hidden. Reject implausible ear/head locations relative to the shoulders.
    yaw = math.degrees(math.atan2(ear_left.z - ear_right.z, ear_span))
    head_x = (ear_left.x + ear_right.x) / 2
    shoulder_x = (left.x + right.x) / 2
    shoulder_y = (left.y + right.y) / 2
    head_y = (ear_left.y + ear_right.y) / 2
    if abs(head_x - shoulder_x) > width * 0.65 or not -0.2 <= (shoulder_y - head_y) / width <= 1.5:
        return None
    if _reliable(body[0]):
        nose = body[0]
        yaw = math.degrees(math.atan2(nose.x - head_x, ear_span / 2))
        pitch = -math.degrees(math.atan2(nose.y - head_y, ear_span))
    else:
        # Both ears must remain visible. A head lowered toward the shoulders
        # supplies a coarse down posture; shoulders alone never qualify.
        if (shoulder_y - head_y) / width > 0.6:
            return None
        pitch = -45.0
    return Orientation(max(-180, min(180, yaw)), max(-90, min(90, pitch)))


def observation_from_results(face, pose, *, image_usable: bool) -> Observation:
    """Reduce MediaPipe results to transient aggregate features only.

    Select a prominent centered subject; bystanders do not invalidate the view.
    Both shoulders and visible head landmarks are needed for the pose fallback.
    """
    faces = face.face_landmarks
    bodies = pose.pose_landmarks
    body_present = False
    reasons = []
    ambiguous = False
    # Follow the prominent person at the desk, not every bystander. This uses
    # position/scale, not facial identity; another person taking the same seat
    # cannot be distinguished by this prototype.
    candidates = [body for body in bodies if len(body) == 33
                  and all(_reliable(body[i]) for i in (11, 12))
                  and 0.2 <= (body[11].x + body[12].x) / 2 <= 0.8
                  and abs(body[11].x - body[12].x) >= 0.12]
    body = max(candidates, key=lambda points: abs(points[11].x - points[12].x)
               - 0.3 * abs((points[11].x + points[12].x) / 2 - 0.5), default=None)
    body_present = body is not None
    if bodies and body is None:
        ambiguous = True
        reasons.append("shoulders_unreliable")
    orientation = None
    if not faces:
        reasons.append("face_not_detected")
    face_candidates = []
    for index, points in enumerate(faces):
        if not points or not all(_finite_landmark(point) for point in points):
            continue
        center_x = (min(point.x for point in points) + max(point.x for point in points)) / 2
        center_y = (min(point.y for point in points) + max(point.y for point in points)) / 2
        if body is not None:
            shoulder_x = (body[11].x + body[12].x) / 2
            shoulder_y = (body[11].y + body[12].y) / 2
            width = abs(body[11].x - body[12].x)
            if abs(center_x - shoulder_x) > width * 0.65 or not shoulder_y - width * 1.5 <= center_y <= shoulder_y + width * 0.2:
                continue
        elif not 0.2 <= center_x <= 0.8:
            continue
        score = max(point.x for point in points) - min(point.x for point in points) - 0.3 * abs(center_x - 0.5)
        face_candidates.append((score, index))
    if face_candidates:
        _, index = max(face_candidates)
        points = faces[index]
        matrices = face.facial_transformation_matrixes
        if len(points) != 478 or index >= len(matrices):
            ambiguous = True
            if len(points) != 478:
                reasons.append("incomplete_face_landmarks")
            if index >= len(matrices):
                reasons.append("face_transform_missing")
        else:
            try:
                orientation = orientation_from_matrix(matrices[index])
            except ValueError:
                ambiguous = True
                reasons.append("face_orientation_unreliable")
    if orientation is None and body is not None:
        orientation = _pose_orientation(body)
        if orientation is not None:
            ambiguous = False
            reasons = []
    if orientation is not None and body_present:
        ambiguous = False
    return Observation(image_usable, len(faces), orientation, body_present, ambiguous, tuple(reasons))


def calibration_diagnostics(observation: Observation) -> dict:
    """Aggregate rejection reasons only; no images or landmark coordinates."""
    reasons = list(observation.rejection_reasons)
    if not observation.image_usable and not reasons:
        reasons.append("image_unusable")
    if observation.image_usable:
        if observation.face_count == 0 and observation.orientation is None and "face_not_detected" not in reasons:
            reasons.append("face_not_detected")
        elif observation.face_count == 1 and observation.orientation is None and not reasons:
            reasons.append("face_orientation_unreliable")
        if observation.ambiguous and not reasons:
            reasons.append("ambiguous_observation")
    return {
        "faceCount": observation.face_count,
        "bodyPresent": observation.body_present,
        "orientationAvailable": observation.orientation is not None,
        "imageUsable": observation.image_usable,
        "reasons": reasons,
    }
