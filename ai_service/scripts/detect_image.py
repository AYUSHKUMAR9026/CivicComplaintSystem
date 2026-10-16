"""Detect COCO objects in a local image and save an annotated image plus JSON."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from ai_service.config.settings import CONFIDENCE, RUNS, SAMPLE
from ai_service.inference.detector import Detector, detections

import cv2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SAMPLE)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--confidence", type=float, default=CONFIDENCE)
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error(f"Image does not exist: {args.source}. Run the download_assets module first.")
    image = cv2.imread(str(args.source))
    if image is None:
        parser.error(f"Cannot read image: {args.source}. Run the download_assets module first.")
    if not 0 < args.confidence <= 1:
        parser.error("--confidence must be greater than 0 and at most 1")
    detector = Detector(args.device)
    result = detector.predict(image, args.confidence)
    output = RUNS / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True, exist_ok=False)
    if not cv2.imwrite(str(output / "annotated.jpg"), result.plot()):
        raise OSError("Could not write annotated image")
    report = {
        "model": "yolo11n.pt", "device": detector.device,
        "scope": "Pretrained COCO objects only; no custom civic defect training",
        "detections": detections(result),
    }
    (output / "detections.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Device: {detector.device}; detections: {len(report['detections'])}")
    print(f"Results: {output}")


if __name__ == "__main__":
    main()
