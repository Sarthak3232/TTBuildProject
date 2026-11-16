import math
from types import SimpleNamespace

import pytest

from app.inference.orientation import (
    Calibration,
    CalibrationSample,
    Observation,
    Orientation,
    calibration_reference,
    calibration_diagnostics,
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


@pytest.mark.parametrize("yaw,pitch,expected", [(0, 0, "compatible"), (0, -45, "compatible"), (0, -85, "compatible"), (35, 25, "compatible"), (35.01, 0, "away"), (60, 0, "away"), (0, 40, "away")])
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
    (Observation(True, 2, Orientation(0, 0)), "compatible"),
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


def test_diagnostics_distinguish_shoulders_from_face_without_relaxing_rules(calibration):
    face = SimpleNamespace(face_landmarks=[[landmark() for _ in range(478)]], facial_transformation_matrixes=[rotation(0, -45)])
    pose = SimpleNamespace(pose_landmarks=[[landmark(0.1, 0.1) for _ in range(33)]])
    observation = observation_from_results(face, pose, image_usable=True)
    assert classify(observation, calibration).state == "unknown"
    diagnostic = calibration_diagnostics(observation)
    assert diagnostic["orientationAvailable"] is True
    assert diagnostic["faceCount"] == 1
    assert diagnostic["reasons"] == ["shoulders_unreliable"]


def test_diagnostics_distinguish_missing_transform_from_missing_face():
    face = SimpleNamespace(face_landmarks=[[landmark() for _ in range(478)]], facial_transformation_matrixes=[])
    observation = observation_from_results(face, SimpleNamespace(pose_landmarks=[]), image_usable=True)
    assert calibration_diagnostics(observation)["reasons"] == ["face_transform_missing"]


def reading_body(*, center=0.5, width=0.4, nose_visible=False, sideways=False):
    body = [landmark(0, 0) for _ in range(33)]
    for index, x, y, z in [(11, center - width / 2, 0.65, 0), (12, center + width / 2, 0.65, 0),
                            (7, center - width / 5, 0.5, 0.2 if sideways else 0),
                            (8, center + width / 5, 0.5, -0.2 if sideways else 0)]:
        body[index] = SimpleNamespace(x=x, y=y, z=z, presence=1, visibility=1)
    if nose_visible:
        body[0] = SimpleNamespace(x=center, y=0.56, z=-0.1, presence=1, visibility=1)
    return body


def pose_observation(*bodies):
    return observation_from_results(SimpleNamespace(face_landmarks=[], facial_transformation_matrixes=[]),
                                    SimpleNamespace(pose_landmarks=list(bodies)), image_usable=True)


@pytest.mark.parametrize("nose_visible", [False, True])
def test_looking_down_can_qualify_without_face_mesh(calibration, nose_visible):
    observation = pose_observation(reading_body(nose_visible=nose_visible))
    assert observation.face_count == 0
    assert observation.orientation is not None
    assert classify(observation, calibration).state == "compatible"


def test_multiple_people_do_not_pause_the_person_at_the_desk(calibration):
    foreground = reading_body()
    background = reading_body(center=0.85, width=0.15, sideways=True)
    for bodies in [(foreground, background), (background, foreground)]:
        assert classify(pose_observation(*bodies), calibration).state == "compatible"
    # The centered subject left; an off-center bystander cannot keep it running.
    assert classify(pose_observation(background), calibration).state != "compatible"


def test_sideways_pose_and_shoulders_without_head_do_not_qualify(calibration):
    assert classify(pose_observation(reading_body(sideways=True)), calibration).state == "away"
    body = reading_body()
    body[7].visibility = body[8].visibility = 0
    assert classify(pose_observation(body), calibration).state == "unknown"
    assert classify(pose_observation(), calibration).state == "away"
