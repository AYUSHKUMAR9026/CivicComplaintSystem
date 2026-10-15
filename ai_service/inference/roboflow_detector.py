"""Roboflow-hosted civic defect inference, parallel to the local YOLO detector.

Two hosted models are used, each with its own class vocabulary:

* road (potholes-scbcq/1) emits RDD2022 codes. Only D40 is a pothole;
  D00/D10/D20 are crack types, so a crack is never relabelled as a pothole.
* garbage (garbage-d6vgh/1) publishes its classes as the bare digits 0-14 --
  the dataset author never named them. Detections are therefore reported as
  garbage with the raw subtype id preserved, and no label is invented.

civic_category is the only field the complaint flow acts on. It is set solely
for unambiguous findings, so cracks are reported but never auto-filed.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import numpy as np
from inference_sdk import InferenceConfiguration, InferenceHTTPClient

from ai_service.config.settings import (
    ROBOFLOW_API_URL,
    ROBOFLOW_CONFIDENCE,
    ROBOFLOW_GARBAGE_MODEL_ID,
    ROBOFLOW_MODEL_ID,
    roboflow_api_key,
)

# RDD2022 taxonomy (arxiv.org/pdf/2209.08538). D40 is labelled "pothole" in
# practice but originally covers rutting, bumps, potholes and separation.
RDD_CLASS_LABELS = {
    "D00": "Longitudinal crack",
    "D01": "Longitudinal crack (construction joint)",
    "D10": "Transverse crack",
    "D11": "Transverse crack (construction joint)",
    "D20": "Alligator crack",
    "D40": "Pothole",
    "D43": "Crosswalk blur",
    "D44": "White line blur",
    "D50": "Manhole",
}
POTHOLE_CODES = frozenset({"D40"})


class RoboflowError(RuntimeError):
    """Raised for missing configuration or a failed hosted inference call."""


def describe_class(code: str) -> str:
    """Translate a known RDD code; unknown codes keep their raw code verbatim."""
    return RDD_CLASS_LABELS.get(code, code)


def road_category(code: str) -> str | None:
    """Only an explicit pothole is actionable; cracks are reported, not filed."""
    return "pothole" if code in POTHOLE_CODES else None


def describe_garbage_class(code: str) -> str:
    """The published classes are unnamed digits, so state the subtype, not a guess."""
    return f"Garbage (type {code})" if code.isdigit() else f"Garbage ({code})"


def garbage_category(code: str) -> str:
    return "garbage"


@dataclass(frozen=True)
class ModelSpec:
    key: str
    model_id: str
    scope: str
    label: Callable[[str], str]
    category: Callable[[str], str | None]


ROAD_SPEC = ModelSpec(
    key="road",
    model_id=ROBOFLOW_MODEL_ID,
    scope=(
        "RDD2022 road damage model: D40=pothole, D00/D10/D20=crack types. "
        "Detects road surface damage only; not garbage or streetlights."
    ),
    label=describe_class,
    category=road_category,
)
GARBAGE_SPEC = ModelSpec(
    key="garbage",
    model_id=ROBOFLOW_GARBAGE_MODEL_ID,
    scope=(
        "Garbage identification model with 15 unnamed classes (0-14). Subtype "
        "ids are reported verbatim because the publisher provides no class names."
    ),
    label=describe_garbage_class,
    category=garbage_category,
)
SPECS = {ROAD_SPEC.key: ROAD_SPEC, GARBAGE_SPEC.key: GARBAGE_SPEC}


class RoboflowDetector:
    def __init__(
        self,
        kind: str = "road",
        confidence: float = ROBOFLOW_CONFIDENCE,
        api_url: str = ROBOFLOW_API_URL,
        model_id: str | None = None,
    ):
        if kind not in SPECS:
            raise ValueError(f"kind must be one of {sorted(SPECS)}")
        if not 0 < confidence <= 1:
            raise ValueError("confidence must be greater than 0 and at most 1")
        api_key = roboflow_api_key()
        if not api_key:
            raise RoboflowError(
                "ROBOFLOW_API_KEY is not set. Add it to the repository-root .env "
                "(see .env.example); it must never be hardcoded or sent to the browser."
            )
        self.spec = SPECS[kind]
        self.kind = kind
        self.model_id = model_id or self.spec.model_id
        self.confidence = confidence
        self.api_url = api_url
        # The SDK exposes no per-request HTTP timeout, so callers (the backend
        # proxy) must bound the request themselves.
        # api_key_transport="header" sends Authorization: Bearer, keeping the
        # secret out of the query string and server access logs (SDK >= 1.5.0).
        self.client = InferenceHTTPClient(api_url=api_url, api_key=api_key).configure(
            InferenceConfiguration(
                api_key_transport="header",
                confidence_threshold=confidence,
            )
        )

    def predict(self, source: str | Path | np.ndarray) -> dict[str, Any]:
        """Run hosted inference on a local path, URL, or decoded BGR image."""
        if isinstance(source, Path):
            if not source.is_file():
                raise RoboflowError(f"Image does not exist: {source}")
            source = str(source)
        elif isinstance(source, np.ndarray):
            if source.ndim != 3 or source.shape[2] != 3:
                raise RoboflowError("Expected a decoded BGR image with three channels")
        elif not isinstance(source, str) or not source.strip():
            raise RoboflowError("source must be a file path, URL, or decoded image")
        try:
            raw = self.client.infer(source, model_id=self.model_id)
        except Exception as exc:  # SDK wraps HTTP, auth and transport errors
            raise RoboflowError(f"Hosted inference failed ({type(exc).__name__}): {exc}") from exc
        return self.normalize(raw)

    def normalize(self, raw: dict[str, Any]) -> dict[str, Any]:
        image = raw.get("image") or {}
        width, height = image.get("width"), image.get("height")
        return {
            "model_id": raw.get("resolved_model", {}).get("model_id", self.model_id),
            "model_kind": self.kind,
            "source": "roboflow-serverless",
            "confidence_threshold": self.confidence,
            "image": {"width": width, "height": height},
            "inference_id": raw.get("inference_id"),
            "server_time_ms": round(raw.get("time", 0.0) * 1000, 1),
            "scope": self.spec.scope,
            "detections": [
                detection(p, width, height, self.spec) for p in raw.get("predictions", [])
            ],
        }


def detection(
    prediction: dict[str, Any],
    width: int | None,
    height: int | None,
    spec: ModelSpec = ROAD_SPEC,
) -> dict[str, Any]:
    """Convert Roboflow's centre-based pixel box to clamped [l, t, r, b]."""
    x, y = float(prediction["x"]), float(prediction["y"])
    w, h = float(prediction["width"]), float(prediction["height"])
    left, top, right, bottom = x - w / 2, y - h / 2, x + w / 2, y + h / 2
    if width and height:
        left, right = max(0.0, left), min(float(width), right)
        top, bottom = max(0.0, top), min(float(height), bottom)
    code = str(prediction.get("class", ""))
    category = spec.category(code)
    return {
        "class_code": code,
        "class_name": spec.label(code),
        "model_kind": spec.key,
        "civic_category": category,
        "is_pothole": category == "pothole",
        "confidence": float(prediction["confidence"]),
        "xyxy": [round(v, 2) for v in (left, top, right, bottom)],
    }
