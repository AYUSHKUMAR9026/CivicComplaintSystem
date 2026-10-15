"""Run the hosted Roboflow road damage model on an image; save annotated output.

Mirrors scripts/detect_image.py, but inference runs on Roboflow's serverless API
instead of the local YOLO weights. Requires ROBOFLOW_API_KEY in the root .env.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from ai_service.config.settings import ROAD_SAMPLE, ROBOFLOW_CONFIDENCE, ROBOFLOW_MODEL_ID, RUNS
from ai_service.inference.roboflow_detector import RoboflowDetector, RoboflowError

import cv2

POTHOLE_COLOR = (60, 60, 230)   # BGR red: D40
DAMAGE_COLOR = (40, 180, 230)   # BGR amber: crack classes


def annotate(image, detections):
    for det in detections:
        left, top, right, bottom = (int(round(v)) for v in det["xyxy"])
        color = POTHOLE_COLOR if det["is_pothole"] else DAMAGE_COLOR
        cv2.rectangle(image, (left, top), (right, bottom), color, 2)
        label = f"{det['class_name']} {det['confidence']:.2f}"
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        # Keep the caption inside the frame for boxes touching the top edge.
        base = max(top, text_h + 4)
        cv2.rectangle(image, (left, base - text_h - 4), (left + text_w + 4, base), color, -1)
        cv2.putText(image, label, (left + 2, base - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROAD_SAMPLE, help="local image path")
    parser.add_argument("--confidence", type=float, default=ROBOFLOW_CONFIDENCE)
    parser.add_argument("--model-id", default=ROBOFLOW_MODEL_ID)
    args = parser.parse_args()

    if not args.source.is_file():
        parser.error(f"Image does not exist: {args.source}. Pass --source with a road photo.")
    image = cv2.imread(str(args.source))
    if image is None:
        parser.error(f"Cannot read image: {args.source}")
    if not 0 < args.confidence <= 1:
        parser.error("--confidence must be greater than 0 and at most 1")

    try:
        detector = RoboflowDetector(model_id=args.model_id, confidence=args.confidence)
        report = detector.predict(args.source)
    except RoboflowError as exc:
        parser.error(str(exc))

    output = RUNS / ("roboflow-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    output.mkdir(parents=True, exist_ok=False)
    report["source_image"] = str(args.source)
    if not cv2.imwrite(str(output / "annotated.jpg"), annotate(image, report["detections"])):
        raise OSError("Could not write annotated image")
    (output / "detections.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    potholes = sum(d["is_pothole"] for d in report["detections"])
    print(f"Model: {report['model_id']} (hosted); threshold: {args.confidence}")
    print(f"Detections: {len(report['detections'])} total, {potholes} pothole (D40)")
    for det in report["detections"]:
        print(f"  {det['class_code']} {det['class_name']} {det['confidence']:.3f}")
    print(f"Results: {output}")


if __name__ == "__main__":
    main()
