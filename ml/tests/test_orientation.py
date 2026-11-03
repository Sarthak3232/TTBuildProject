import math
from types import SimpleNamespace

import pytest

from app.inference.orientation import (
    Calibration,
    CalibrationSample,
    Observation,
    Orientation,
    calibration_reference,
    classify,
    observation_from_results,
    orientation_from_matrix,
)


def rotation(yaw=0, pitch=0, roll=0, scale=1):
    # Independently construct R = Ry(yaw) Rx(pitch) Rz(roll).
    y, p, r = map(math.radians, (yaw, pitch, roll))
    cy, sy, cp, sp, cr, sr = math.cos(y), math.sin(y), math.cos(p), math.sin(p), math.cos(r), math.sin(r)
    rows = [
        [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp],
        [cp * sr, cp * cr, -sp],
        [-sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp],
    ]
    return [[scale * value for value in row] + [0] for row in rows] + [[0, 0, 0, 1]]


@pytest.mark.parametrize("yaw,pitch,roll,scale", [(0, 0, 0, 1), (35, -40, 0, 1), (-60, 25, 30, 2), (179, 0, 15, 0.5)])
def test_head_angles_ignore_translation_scale_and_roll(yaw, pitch, roll, scale):
    matrix = rotation(yaw, pitch, roll, scale)
    matrix[0][3], matrix[1][3], matrix[2][3] = 10, -5, -40
    result = orientation_from_matrix(matrix)
    assert result.yaw == pytest.approx(yaw)
    assert result.pitch == pytest.approx(pitch)


@pytest.mark.parametrize("matrix", [[], [[0] * 4] * 4, [[float('nan')] * 4] * 4, [[1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]])
def test_invalid_transform_is_rejected(matrix):
    with pytest.raises(ValueError):
        orientation_from_matrix(matrix)


@pytest.fixture
def calibration():
    return Calibration(screen=Orientation(0, 0), book=Orientation(0, -45))


@pytest.mark.parametrize("yaw,pitch,expected", [(0, 0, "compatible"), (0, -45, "compatible"), (25, 25, "compatible"), (25.01, 0, "away"), (60, 0, "away"), (0, 40, "away")])
def test_screen_book_and_inclusive_threshold(calibration, yaw, pitch, expected):
    result = classify(Observation(True, 1, Orientation(yaw, pitch)), calibration)
    assert result.state == expected


def test_yaw_difference_wraps_at_180():
    calibration = Calibration(Orientation(179, 0), Orientation(179, -45))
    assert classify(Observation(True, 1, Orientation(-179, 0)), calibration).state == "compatible"


@pytest.mark.parametrize("observation,expected", [
    (Observation(False, 0), "unknown"),
    (Observation(True, 0), "away"),
    (Observation(True, 0, body_present=True), "unknown"),
    (Observation(True, 1), "unknown"),
    (Observation(True, 2, Orientation(0, 0)), "unknown"),
    (Observation(True, 0, ambiguous=True), "unknown"),
])
def test_unverifiable_views_never_qualify(calibration, observation, expected):
    assert classify(observation, calibration).state == expected


def test_missing_calibration_cannot_qualify():
    assert classify(Observation(True, 1, Orientation(0, 0)), None).state == "unknown"


def test_calibration_requires_time_span_and_four_samples():
    with pytest.raises(ValueError):
        calibration_reference([CalibrationSample(t, Orientation(0, 0)) for t in [0, 2, 5]])
    with pytest.raises(ValueError):
        calibration_reference([CalibrationSample(t, Orientation(0, 0)) for t in [0, 1, 2, 3]])
    reference = calibration_reference([CalibrationSample(t, Orientation(yaw, pitch)) for t, yaw, pitch in [(0, 1, -40), (1, 0, -42), (3, 2, -44), (5, 20, -46)]])
    assert reference == Orientation(1.5, -43)


def test_calibration_wraparound_and_out_of_order_samples():
    samples = [CalibrationSample(t, Orientation(yaw, 0)) for t, yaw in [(0, 179), (1, -179), (3, 178), (5, -178)]]
    assert abs(calibration_reference(samples).yaw) == 180
    with pytest.raises(ValueError):
        calibration_reference(list(reversed(samples)))


@pytest.mark.parametrize("yaw,pitch", [(float('nan'), 0), (0, float('inf')), (181, 0), (0, 91)])
def test_invalid_angles_are_rejected(yaw, pitch):
    with pytest.raises(ValueError):
        Orientation(yaw, pitch)


def landmark(presence=1, visibility=1):
    return SimpleNamespace(x=0.5, y=0.5, z=0, presence=presence, visibility=visibility)


def test_mediapipe_adapter_extracts_orientation_without_retaining_landmarks(calibration):
    face = SimpleNamespace(face_landmarks=[[landmark() for _ in range(478)]], facial_transformation_matrixes=[rotation(0, -45)])
    pose = SimpleNamespace(pose_landmarks=[])
    observation = observation_from_results(face, pose, image_usable=True)
    assert observation.orientation.pitch == pytest.approx(-45)
    assert classify(observation, calibration).state == "compatible"
    assert not hasattr(observation, "landmarks")


def test_malformed_face_and_unreliable_body_are_unknown(calibration):
    face = SimpleNamespace(face_landmarks=[[landmark()]], facial_transformation_matrixes=[rotation()])
    pose = SimpleNamespace(pose_landmarks=[])
    assert classify(observation_from_results(face, pose, image_usable=True), calibration).state == "unknown"
    face.face_landmarks = []
    face.facial_transformation_matrixes = []
    pose.pose_landmarks = [[landmark(0.1, 0.1) for _ in range(33)]]
    assert classify(observation_from_results(face, pose, image_usable=True), calibration).state == "unknown"


def test_no_detection_is_not_proof_of_usable_empty_scene(calibration):
    face = SimpleNamespace(face_landmarks=[], facial_transformation_matrixes=[])
    pose = SimpleNamespace(pose_landmarks=[])
    assert classify(observation_from_results(face, pose, image_usable=False), calibration).state == "unknown"
    assert classify(observation_from_results(face, pose, image_usable=True), calibration).state == "away"
