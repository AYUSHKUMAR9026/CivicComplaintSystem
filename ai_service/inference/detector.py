from threading import Lock

from ai_service.config.settings import CONFIDENCE, IMAGE_SIZE, WEIGHTS

import numpy as np
import torch
from ultralytics import YOLO


def select_device(requested: str = "auto") -> str:
    """Use CPU when no CUDA device is available, including explicit CUDA requests."""
    if requested not in {"auto", "cpu", "cuda"}:
        raise ValueError("device must be auto, cpu, or cuda")
    return "0" if requested != "cpu" and torch.cuda.is_available() else "cpu"


class Detector:
    def __init__(self, device: str = "auto"):
        if not WEIGHTS.is_file():
            raise FileNotFoundError(
                f"Missing {WEIGHTS}. Run: python -m ai_service.scripts.download_assets"
            )
        self.device = select_device(device)
        self.model = YOLO(str(WEIGHTS), task="detect")
        self._lock = Lock()

    def predict(self, image: np.ndarray, confidence: float = CONFIDENCE):
        if not 0 < confidence <= 1:
            raise ValueError("confidence must be greater than 0 and at most 1")
        if image is None or image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("Expected a decoded BGR image with three channels")
        # Ultralytics predictors hold mutable state; serialize service requests.
        with self._lock:
            return self.model.predict(
                source=image, device=self.device, conf=confidence,
                imgsz=IMAGE_SIZE, verbose=False, save=False,
            )[0]


def detections(result) -> list[dict]:
    """Serialize actual model boxes; zero detections is a valid result."""
    return [
        {
            "class_id": int(box.cls.item()),
            "class_name": result.names[int(box.cls.item())],
            "confidence": float(box.conf.item()),
            "xyxy": box.xyxy[0].cpu().tolist(),
        }
        for box in result.boxes
    ]
