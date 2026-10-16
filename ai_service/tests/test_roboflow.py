"""Roboflow integration: pure box/label logic plus one real hosted call."""
import pytest

from ai_service.config.settings import ROAD_SAMPLE
from ai_service.inference import roboflow_detector as rf


def test_known_rdd_codes_translate():
    assert rf.describe_class("D40") == "Pothole"
    assert rf.describe_class("D00") == "Longitudinal crack"
    assert rf.describe_class("D20") == "Alligator crack"


def test_unknown_code_is_never_guessed():
    assert rf.describe_class("D99") == "D99"


def test_only_d40_counts_as_pothole():
    prediction = {"x": 100, "y": 100, "width": 50, "height": 40, "confidence": 0.9}
    assert rf.detection({**prediction, "class": "D40"}, 640, 480)["is_pothole"] is True
    assert rf.detection({**prediction, "class": "D00"}, 640, 480)["is_pothole"] is False


def test_centre_box_converts_to_corners():
    prediction = {"x": 100, "y": 200, "width": 40, "height": 60, "confidence": 0.5, "class": "D40"}
    assert rf.detection(prediction, 640, 480)["xyxy"] == [80.0, 170.0, 120.0, 230.0]


def test_box_is_clamped_to_image_bounds():
    prediction = {"x": 10, "y": 10, "width": 60, "height": 60, "confidence": 0.5, "class": "D40"}
    assert rf.detection(prediction, 640, 480)["xyxy"] == [0.0, 0.0, 40.0, 40.0]


def test_missing_api_key_raises_clear_error(monkeypatch):
    monkeypatch.setenv("ROBOFLOW_API_KEY", "")
    with pytest.raises(rf.RoboflowError, match="ROBOFLOW_API_KEY"):
        rf.RoboflowDetector()


def test_rejects_out_of_range_confidence():
    with pytest.raises(ValueError):
        rf.RoboflowDetector(confidence=0)


def test_live_hosted_inference_finds_the_pothole():
    """Real serverless call: requires ROBOFLOW_API_KEY and network access."""
    if not ROAD_SAMPLE.is_file():
        pytest.fail(f"Missing road sample {ROAD_SAMPLE}; cannot verify hosted inference")
    report = rf.RoboflowDetector(confidence=0.40).predict(ROAD_SAMPLE)
    assert report["model_id"] == "potholes-scbcq/1"
    assert report["image"] == {"width": 1024, "height": 768}
    potholes = [d for d in report["detections"] if d["is_pothole"]]
    assert potholes, f"Expected a D40 detection, got {report['detections']}"
    assert potholes[0]["confidence"] > 0.5


def test_api_road_endpoint_real_inference():
    """Exercises /detect/road against the hosted model with a real upload."""
    from fastapi.testclient import TestClient

    from ai_service.app import app

    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["road_model"]["available"] is True
        assert health["road_model"]["model_id"] == "potholes-scbcq/1"

        upload = {"file": ("road.jpg", ROAD_SAMPLE.read_bytes(), "image/jpeg")}
        response = client.post("/detect/road", files=upload, data={"confidence": "0.4"})
        assert response.status_code == 200
        body = response.json()
        assert any(d["is_pothole"] for d in body["detections"])
        assert body["image"] == {"width": 1024, "height": 768}

        assert client.post("/detect/road", files=upload, data={"confidence": "0"}).status_code == 422
        assert client.post("/detect/road", files={"file": ("e.jpg", b"")}).status_code == 400
        assert client.post("/detect/road", files={"file": ("b.jpg", b"notanimage")}).status_code == 400
