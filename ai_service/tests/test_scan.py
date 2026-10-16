"""Garbage model and combined civic scan: pure merge logic plus real calls."""
from pathlib import Path

import pytest

from ai_service.config.settings import ROAD_SAMPLE, SAMPLE
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
        assert set(body["models"]) == {"road", "garbage"}
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
