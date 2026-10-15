"""Run both hosted civic models over one frame and merge the findings."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np

from ai_service.inference.roboflow_detector import RoboflowDetector, RoboflowError

# Auto-filing acts on this, so keep it above the range where the road model
# produced crack/pothole confusion in testing.
AUTO_FILE_FLOOR = 0.50


class CivicScanner:
    """Fan one frame out to the road and garbage models concurrently."""

    def __init__(self, confidence: float):
        self.confidence = confidence
        self.detectors = {
            kind: RoboflowDetector(kind=kind, confidence=confidence)
            for kind in ("road", "garbage")
        }

    def scan(self, image: np.ndarray) -> dict[str, Any]:
        # Two independent network calls; running them in parallel roughly halves
        # the per-frame latency that the live scanner sees.
        with ThreadPoolExecutor(max_workers=len(self.detectors)) as pool:
            futures = {kind: pool.submit(d.predict, image) for kind, d in self.detectors.items()}
            reports, errors = {}, {}
            for kind, future in futures.items():
                try:
                    reports[kind] = future.result()
                except RoboflowError as exc:
                    errors[kind] = str(exc)

        if not reports:
            raise RoboflowError("; ".join(f"{k}: {v}" for k, v in errors.items()))

        detections = [d for report in reports.values() for d in report["detections"]]
        detections.sort(key=lambda d: -d["confidence"])
        any_report = next(iter(reports.values()))
        return {
            "source": "roboflow-serverless",
            "confidence_threshold": self.confidence,
            "image": any_report["image"],
            "models": {kind: report["model_id"] for kind, report in reports.items()},
            "model_errors": errors or None,
            "server_time_ms": round(sum(r["server_time_ms"] for r in reports.values()), 1),
            "detections": detections,
            "suggestion": suggest(detections),
        }


def suggest(detections: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the single strongest actionable finding, or None.

    Only detections carrying a civic_category qualify, so road cracks are shown
    to the user but never turned into a complaint suggestion.
    """
    actionable = [
        d for d in detections
        if d.get("civic_category") and d["confidence"] >= AUTO_FILE_FLOOR
    ]
    if not actionable:
        return None
    best = max(actionable, key=lambda d: d["confidence"])
    category = best["civic_category"]
    same = [d for d in actionable if d["civic_category"] == category]
    return {
        "civic_category": category,
        "confidence": best["confidence"],
        "count": len(same),
        "class_names": sorted({d["class_name"] for d in same}),
    }
