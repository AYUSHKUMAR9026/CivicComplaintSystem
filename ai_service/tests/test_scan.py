"""Garbage model and combined civic scan: pure merge logic plus real calls."""
from pathlib import Path

import pytest

from ai_service.config.settings import ROAD_SAMPLE, SAMPLE, SCAN_KINDS
from ai_service.inference import roboflow_detector as rf
from ai_service.inference import scan as sc

GARBAGE_SAMPLE = Path(__file__).resolve().parents[1] / "datasets/samples/garb_dump.jpg"


def test_garbage_classes_are_reported_not_invented():
    # The publisher ships classes as bare digits, so no label may be guessed.
    assert rf.describe_garbage_class("8") == "Garbage (type 8)"
    assert rf.describe_garbage_class("14") == "Garbage (type 14)"


def test_every_garbage_class_is_actionable_garbage():
    assert rf.garbage_category("0") == "garbage"
    assert rf.garbage_category("13") == "garbage"


def test_road_cracks_are_reported_but_not_actionable():
    assert rf.road_category("D40") == "pothole"
    for crack in ("D00", "D10", "D20"):
        assert rf.road_category(crack) is None


def test_detection_uses_the_spec_it_is_given():
    prediction = {"x": 50, "y": 50, "width": 20, "height": 20, "confidence": 0.9, "class": "8"}
    result = rf.detection(prediction, 200, 200, rf.GARBAGE_SPEC)
    assert result["civic_category"] == "garbage"
    assert result["class_name"] == "Garbage (type 8)"
    assert result["is_pothole"] is False
    assert result["model_kind"] == "garbage"


def test_context_models_label_from_the_spec_not_the_class_code():
    # Each is single-purpose, so the published code carries no extra meaning.
    assert rf.describe_human_class("0") == "Person"
    # The vehicle model publishes both "vehicle" and the bare digit "9".
    assert rf.describe_vehicle_class("vehicle") == "Vehicle"
    assert rf.describe_vehicle_class("9") == "Vehicle"
    # kuwait-potholes/1 publishes its class as a dataset export string.
    assert rf.describe_pothole_class("pot-pot - v1 2024-07-10 6-48am") == "Pothole"
    assert rf.describe_pothole_class("pothole") == "Pothole"


def test_people_and_vehicles_are_never_actionable():
    # A pedestrian or a parked car is not a civic defect, so neither may file.
    assert rf.context_category("0") is None
    assert rf.context_category("vehicle") is None
    assert rf.pothole_category("pothole") == "pothole"


def test_every_configured_scan_kind_has_a_spec():
    from ai_service.config.settings import SCAN_KINDS

    assert set(SCAN_KINDS) <= set(rf.SPECS)
    assert {"human", "car", "pothole_kw", "pothole_alt"} <= set(rf.SPECS)


def test_a_person_detection_cannot_become_a_suggestion():
    people = [
        {"civic_category": None, "confidence": 0.93, "class_name": "Person"},
        {"civic_category": None, "confidence": 0.87, "class_name": "Vehicle"},
    ]
    assert sc.suggest(people) is None


def test_unknown_kind_is_rejected():
    with pytest.raises(ValueError):
        rf.RoboflowDetector(kind="streetlight")


def test_suggestion_ignores_cracks_entirely():
    cracks = [
        {"civic_category": None, "confidence": 0.95, "class_name": "Longitudinal crack"},
        {"civic_category": None, "confidence": 0.88, "class_name": "Alligator crack"},
    ]
    assert sc.suggest(cracks) is None


def test_suggestion_respects_the_auto_file_floor():
    weak = [{"civic_category": "garbage", "confidence": sc.AUTO_FILE_FLOOR - 0.01, "class_name": "Garbage (type 2)"}]
    assert sc.suggest(weak) is None
    strong = [{"civic_category": "garbage", "confidence": sc.AUTO_FILE_FLOOR, "class_name": "Garbage (type 2)"}]
    assert sc.suggest(strong)["civic_category"] == "garbage"


def test_suggestion_picks_the_strongest_category_and_counts_it():
    detections = [
        {"civic_category": "garbage", "confidence": 0.90, "class_name": "Garbage (type 2)"},
        {"civic_category": "garbage", "confidence": 0.70, "class_name": "Garbage (type 8)"},
        {"civic_category": "pothole", "confidence": 0.60, "class_name": "Pothole"},
    ]
    suggestion = sc.suggest(detections)
    assert suggestion["civic_category"] == "garbage"
    assert suggestion["count"] == 2
    assert suggestion["class_names"] == ["Garbage (type 2)", "Garbage (type 8)"]
    assert suggestion["requires_review"] is True


def test_pothole_suggestion_can_use_countdown():
    suggestion = sc.suggest([
        {"civic_category": "pothole", "confidence": 0.8, "class_name": "Pothole"}
    ])
    assert suggestion["requires_review"] is False


def test_kuwait_cannot_file_a_pothole_on_its_own():
    """A garbage pile scored 0.70 pothole on kuwait-potholes/1, unopposed."""
    alone = [{
        "civic_category": "pothole", "confidence": 0.70,
        "class_name": "Pothole", "model_kind": "pothole_kw",
    }]
    assert sc.suggest(alone) is None


def test_kuwait_counts_once_another_model_agrees():
    agreed = [
        {"civic_category": "pothole", "confidence": 0.96,
         "class_name": "Pothole", "model_kind": "pothole_kw"},
        {"civic_category": "pothole", "confidence": 0.83,
         "class_name": "Pothole", "model_kind": "pothole_alt"},
    ]
    suggestion = sc.suggest(agreed)
    # The corroborated second opinion is still allowed to be the strongest.
    assert suggestion["civic_category"] == "pothole"
    assert suggestion["confidence"] == 0.96
    assert suggestion["count"] == 2


def test_corroboration_is_per_category_not_blanket():
    # Garbage elsewhere in the frame must not licence a lone kuwait pothole.
    mixed = [
        {"civic_category": "garbage", "confidence": 0.80,
         "class_name": "Garbage (type 8)", "model_kind": "garbage"},
        {"civic_category": "pothole", "confidence": 0.90,
         "class_name": "Pothole", "model_kind": "pothole_kw"},
    ]
    assert sc.suggest(mixed)["civic_category"] == "garbage"


def test_a_lone_mainline_pothole_model_still_files():
    # Only kuwait needs a second opinion; the others are unaffected.
    for kind in ("road", "pothole_alt"):
        lone = [{"civic_category": "pothole", "confidence": 0.77,
                 "class_name": "Pothole", "model_kind": kind}]
        assert sc.suggest(lone)["civic_category"] == "pothole", kind


def box(left, top, right, bottom, kind="garbage", confidence=0.9):
    return {
        "xyxy": [left, top, right, bottom], "model_kind": kind,
        "confidence": confidence, "civic_category": kind, "class_name": f"{kind} box",
    }


def test_covered_fraction_measures_the_box_not_the_region():
    # A person box far larger than the garbage box still yields full coverage.
    assert sc.covered_fraction([10, 10, 20, 20], [[0, 0, 100, 100]]) == 1.0
    assert sc.covered_fraction([0, 0, 10, 10], [[0, 0, 5, 10]]) == 0.5
    assert sc.covered_fraction([0, 0, 10, 10], [[50, 50, 60, 60]]) == 0.0
    assert sc.covered_fraction([0, 0, 10, 10], []) == 0.0


def test_covered_fraction_takes_the_best_single_region_and_survives_empty_boxes():
    regions = [[0, 0, 2, 10], [0, 0, 7, 10]]
    assert sc.covered_fraction([0, 0, 10, 10], regions) == 0.7
    # A degenerate box has no area to cover, so it must not divide by zero.
    assert sc.covered_fraction([5, 5, 5, 5], [[0, 0, 10, 10]]) == 0.0


def test_garbage_lying_on_a_person_is_suppressed_with_its_evidence():
    person = [[0, 0, 100, 100]]
    kept, suppressed = sc.partition_by_people([box(10, 10, 50, 50)], person)
    assert kept == []
    assert suppressed[0]["suppressed_by"] == "person"
    assert suppressed[0]["person_overlap"] == 1.0


def test_garbage_clear_of_a_person_is_kept():
    # The real false positives that survive gating sit away from every person.
    kept, suppressed = sc.partition_by_people([box(800, 0, 1000, 160)], [[0, 400, 300, 760]])
    assert suppressed == []
    assert len(kept) == 1


def test_overlap_below_the_threshold_is_kept():
    # Covers 0.25 of the box, under PERSON_OVERLAP, so a real pile beside a
    # pedestrian is not thrown away.
    kept, suppressed = sc.partition_by_people([box(0, 0, 100, 100)], [[0, 0, 50, 50]])
    assert suppressed == []
    assert len(kept) == 1


def test_no_pothole_model_is_gated_by_a_person():
    # Road damage is underfoot, so a pedestrian standing on a pothole must not
    # erase it, whichever of the three pothole models found it.
    persons = [[0, 0, 100, 100]]
    for kind in ("road", "pothole_kw", "pothole_alt"):
        found = box(0, 0, 100, 100, kind=kind)
        kept, suppressed = sc.partition_by_people([found], persons)
        assert suppressed == [], f"{kind} must not be person-gated"
        assert kept == [found]


def test_people_and_vehicle_boxes_are_not_gated_against_people():
    # The human model is the gate; gating it against itself would empty it.
    persons = [[0, 0, 100, 100]]
    found = [box(10, 10, 50, 50, kind="human"), box(10, 10, 50, 50, kind="car")]
    kept, suppressed = sc.partition_by_people(found, persons)
    assert suppressed == []
    assert len(kept) == 2


def test_road_damage_is_never_gated_by_a_person():
    # A pedestrian standing on a pothole must not erase the pothole.
    pothole = box(0, 0, 100, 100, kind="pothole")
    kept, suppressed = sc.partition_by_people([pothole], [[0, 0, 100, 100]])
    assert suppressed == []
    assert kept == [pothole]


def test_without_people_every_detection_survives_and_is_ranked():
    found = [box(0, 0, 10, 10, confidence=0.4), box(20, 20, 30, 30, confidence=0.8)]
    kept, suppressed = sc.partition_by_people(found, [])
    assert suppressed == []
    assert [d["confidence"] for d in kept] == [0.8, 0.4]


def test_live_people_photo_does_not_become_a_garbage_complaint():
    """The reported bug: a street photo of pedestrians auto-filed as garbage."""
    from ai_service.inference.detector import Detector

    sample = GARBAGE_SAMPLE.parent / "ppl_street.jpg"
    if not sample.is_file():
        pytest.fail(f"Missing people sample {sample}")
    import cv2

    image = cv2.imread(str(sample))
    scanner = sc.CivicScanner(confidence=0.40, person_detector=Detector())
    report = scanner.scan(image)
    assert report["people_detected"] > 0
    assert report["suppressed"], "Expected the garbage boxes on people to be gated"
    # Ungated, this frame peaked at 0.91 garbage, above every true positive.
    assert report["suggestion"] is None


def test_live_garbage_model_detects_a_waste_dump():
    if not GARBAGE_SAMPLE.is_file():
        pytest.fail(f"Missing garbage sample {GARBAGE_SAMPLE}")
    report = rf.RoboflowDetector(kind="garbage", confidence=0.40).predict(GARBAGE_SAMPLE)
    assert report["model_id"] == "garbage-d6vgh/1"
    assert report["detections"], "Expected at least one garbage detection"
    assert all(d["civic_category"] == "garbage" for d in report["detections"])


def test_api_scan_merges_both_models():
    from fastapi.testclient import TestClient

    from ai_service.app import app

    with TestClient(app) as client:
        garbage = client.post(
            "/detect/scan", files={"file": ("g.jpg", GARBAGE_SAMPLE.read_bytes(), "image/jpeg")}
        )
        assert garbage.status_code == 200
        body = garbage.json()
        assert set(body["models"]) == set(SCAN_KINDS)
        assert body["suggestion"]["civic_category"] == "garbage"

        road = client.post(
            "/detect/scan", files={"file": ("r.jpg", ROAD_SAMPLE.read_bytes(), "image/jpeg")}
        )
        assert road.json()["suggestion"]["civic_category"] == "pothole"

        # The bus photo contains no civic defect, so nothing may be suggested.
        clean = client.post("/detect/scan", files={"file": ("b.jpg", SAMPLE.read_bytes(), "image/jpeg")})
        assert clean.json()["suggestion"] is None

        assert client.post(
            "/detect/scan", files={"file": ("g.jpg", GARBAGE_SAMPLE.read_bytes(), "image/jpeg")},
            data={"confidence": "0"},
        ).status_code == 422
        assert client.post("/detect/scan", files={"file": ("e.jpg", b"")}).status_code == 400
