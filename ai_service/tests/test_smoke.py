"""Real integration smoke tests. Missing weights/sample fail rather than skip."""
import json

from ai_service.config.settings import SAMPLE
from ai_service.inference.detector import Detector, detections, select_device

import cv2
import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient


def test_device_selection(monkeypatch):
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    assert select_device() == "cpu"
    assert select_device("cuda") == "cpu"
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    assert select_device() == "0"
    assert select_device("cpu") == "cpu"


def test_real_cpu_inference():
    image = cv2.imread(str(SAMPLE))
    assert image is not None, "Run python -m ai_service.scripts.download_assets first"
    assert isinstance(image, np.ndarray)
    detector = Detector("cpu")
    assert detector.device == "cpu"
    assert len(detector.model.names) == 80
    result = detector.predict(image)
    assert result.orig_shape == image.shape[:2]
    boxes = detections(result)
    assert boxes, "Official bus demo photo should yield at least one COCO detection"
    for box in boxes:
        assert 0 <= box["class_id"] < 80
        assert 0 <= box["confidence"] <= 1
        assert len(box["xyxy"]) == 4
    json.dumps(boxes, allow_nan=False)
    with pytest.raises(ValueError):
        detector.predict(image, confidence=0)


def test_api_real_inference():
    from ai_service.app import app

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.post("/detect", files={"file": ("bus.jpg", SAMPLE.read_bytes(), "image/jpeg")})
        assert response.status_code == 200
        assert response.json()["detections"]
        assert client.post("/detect", files={"file": ("bad.jpg", b"invalid")}).status_code == 400
        assert client.post("/detect", files={"file": ("empty.jpg", b"")}).status_code == 400
        assert client.post("/detect", files={"file": ("large.jpg", b"x" * (10 * 1024 * 1024 + 1))}).status_code == 413
