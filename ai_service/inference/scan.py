"""Run every configured hosted civic model over one frame and merge the findings."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np

from ai_service.config.settings import SCAN_KINDS
from ai_service.inference.detector import Detector, detections as coco_detections
from ai_service.inference.roboflow_detector import RoboflowDetector, RoboflowError

# The road suggestion may be auto-filed after a countdown. Garbage suggestions
# require human review because the current model also detects non-waste objects.
AUTO_FILE_FLOOR = 0.50

# Every public garbage model tested fires on photographs of people: the current
# one reached 0.91 on a street scene, higher than any true garbage detection.
# Raising the threshold cannot separate them, so garbage boxes lying on top of a
# person are suppressed using the local COCO model, where "person" is reliable.
# The road model showed no such confusion and is left ungated.
PERSON_CONFIDENCE = 0.35
PERSON_OVERLAP = 0.45
# Kinds whose boxes are discarded when they land on a person. Only the garbage
# model earns this: the pothole models are left ungated for the reason given in
# partition_by_people, and people and vehicles are never gated against people.
GATED_KINDS = frozenset({"garbage"})
# Models whose findings are reported but may not drive a complaint on their own.
# kuwait-potholes/1 scored 0.70 pothole on a garbage pile and 0.46 on fly-tipping,
# above the auto-file floor and unopposed, which would file a pothole against the
# roads department for a sanitation problem. It stays a second opinion: its boxes
# only count once another model agrees on the same category.
CORROBORATION_REQUIRED = frozenset({"pothole_kw"})
# The hosted human model contributes to the gate alongside the local COCO model.
PERSON_KIND = "human"


def covered_fraction(box: list[float], regions: list[list[float]]) -> float:
    """Largest fraction of `box` covered by any single region."""
    left, top, right, bottom = box
    area = max(0.0, right - left) * max(0.0, bottom - top)
    if area <= 0:
        return 0.0
    best = 0.0
    for other in regions:
        overlap_w = max(0.0, min(right, other[2]) - max(left, other[0]))
        overlap_h = max(0.0, min(bottom, other[3]) - max(top, other[1]))
        best = max(best, overlap_w * overlap_h / area)
    return best


def partition_by_people(
    detections: list[dict[str, Any]], persons: list[list[float]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split garbage boxes lying on a person out of the kept findings.

    Only the garbage model is gated. No pothole model is, because road damage is
    underfoot: a pedestrian standing on a pothole would otherwise erase it. The
    extra pothole models do fire on people photos, but every such hit measured
    on the sample set fell below AUTO_FILE_FLOOR, so none can auto-file.
    """
    kept, suppressed = [], []
    for det in detections:
        if persons and det["model_kind"] in GATED_KINDS:
            overlap = covered_fraction(det["xyxy"], persons)
            if overlap >= PERSON_OVERLAP:
                suppressed.append(
                    {**det, "suppressed_by": "person", "person_overlap": round(overlap, 2)}
                )
                continue
        kept.append(det)
    kept.sort(key=lambda d: -d["confidence"])
    return kept, suppressed


class CivicScanner:
    """Fan one frame out to every configured hosted model concurrently."""

    def __init__(
        self,
        confidence: float,
        person_detector: Detector | None = None,
        kinds: tuple[str, ...] = SCAN_KINDS,
    ):
        self.confidence = confidence
        self.detectors = {
            kind: RoboflowDetector(kind=kind, confidence=confidence) for kind in kinds
        }
        # Reuse the already-loaded local model rather than a second copy.
        self.person_detector = person_detector

    def local_person_boxes(self, image: np.ndarray) -> list[list[float]]:
        """Person boxes from the local COCO model, where "person" is reliable."""
        if self.person_detector is None:
            return []
        try:
            result = self.person_detector.predict(image, confidence=PERSON_CONFIDENCE)
        except (ValueError, RuntimeError):
            # Gating is a safety net; never fail the whole scan because of it.
            return []
        return [
            d["xyxy"] for d in coco_detections(result)
            if d["class_name"] == "person"
        ]

    def scan(self, image: np.ndarray) -> dict[str, Any]:
        # One network call per model plus local CPU inference; running them
        # together keeps per-frame latency close to the slowest single call.
        with ThreadPoolExecutor(max_workers=len(self.detectors) + 1) as pool:
            people = pool.submit(self.local_person_boxes, image)
            futures = {kind: pool.submit(d.predict, image) for kind, d in self.detectors.items()}
            reports, errors = {}, {}
            for kind, future in futures.items():
                try:
                    reports[kind] = future.result()
                except RoboflowError as exc:
                    errors[kind] = str(exc)
            persons = people.result()

        if not reports:
            raise RoboflowError("; ".join(f"{k}: {v}" for k, v in errors.items()))

        found = [d for report in reports.values() for d in report["detections"]]
        # The hosted human model is a second source of people for the gate, so a
        # person the local COCO model missed still protects against a false
        # garbage box. Its own boxes are not gated: they are the gate.
        persons = persons + [
            d["xyxy"] for d in reports.get(PERSON_KIND, {}).get("detections", [])
        ]
        detections, suppressed = partition_by_people(found, persons)

        any_report = next(iter(reports.values()))
        return {
            "source": "roboflow-serverless",
            "confidence_threshold": self.confidence,
            "image": any_report["image"],
            "models": {kind: report["model_id"] for kind, report in reports.items()},
            "model_errors": errors or None,
            "server_time_ms": round(sum(r["server_time_ms"] for r in reports.values()), 1),
            "people_detected": len(persons),
            "suppressed": suppressed,
            "detections": detections,
            "suggestion": suggest(detections),
        }


def corroborated(actionable: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop second-opinion findings no other model agrees with.

    A model in CORROBORATION_REQUIRED keeps its box in the response either way;
    this only decides whether it may become a complaint.
    """
    confirmed = {
        d.get("civic_category") for d in actionable
        if d.get("model_kind") not in CORROBORATION_REQUIRED
    }
    return [
        d for d in actionable
        if d.get("model_kind") not in CORROBORATION_REQUIRED
        or d.get("civic_category") in confirmed
    ]


def suggest(detections: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the single strongest actionable finding, or None.

    Only detections carrying a civic_category qualify, so road cracks, people
    and vehicles are shown to the user but never turned into a complaint.
    """
    actionable = corroborated([
        d for d in detections
        if d.get("civic_category") and d["confidence"] >= AUTO_FILE_FLOOR
    ])
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
        "requires_review": category == "garbage",
    }
