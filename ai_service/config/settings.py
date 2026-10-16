import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
WEIGHTS = ROOT / "weights" / "yolo11n.pt"
SAMPLE = ROOT / "datasets" / "samples" / "bus.jpg"
ROAD_SAMPLE = ROOT / "datasets" / "samples" / "road_glendish.jpg"
RUNS = ROOT / "runs"
CONFIDENCE = 0.25
IMAGE_SIZE = 640

# Keep generated Ultralytics settings within the isolated service.
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".ultralytics"))
# Ultralytics checks whether the parent exists before choosing its settings path.
Path(os.environ["YOLO_CONFIG_DIR"]).expanduser().mkdir(parents=True, exist_ok=True)

# --- Roboflow hosted inference ---
# Share the repository-root .env so the isolated service has one config source.
# The API key is a secret: it is read from the environment only and is never
# written to this file, committed, or exposed to the frontend.
load_dotenv(ROOT.parent / ".env")

ROBOFLOW_API_URL = os.getenv("ROBOFLOW_API_URL", "https://serverless.roboflow.com").rstrip("/")
ROBOFLOW_MODEL_ID = os.getenv("ROBOFLOW_MODEL_ID", "potholes-scbcq/1")
# garbage-d6vgh/1 was chosen over garbage-jciga/1: the latter scored 0.54 on a
# plain road photo, higher than most of its true positives.
ROBOFLOW_GARBAGE_MODEL_ID = os.getenv("ROBOFLOW_GARBAGE_MODEL_ID", "garbage-d6vgh/1")
# Context models. Neither a person nor a vehicle is a civic defect, so these are
# drawn for the citizen but carry no civic_category and can never be auto-filed.
# The human model also feeds the person gate in inference/scan.py, where it
# supplements the local COCO model: on the 20-image sample set it fired on every
# people photo and on no road or pothole photo.
ROBOFLOW_HUMAN_MODEL_ID = os.getenv("ROBOFLOW_HUMAN_MODEL_ID", "humans-v0nq1/1")
ROBOFLOW_CAR_MODEL_ID = os.getenv("ROBOFLOW_CAR_MODEL_ID", "cars-blxk2/2")
# Two extra pothole opinions alongside potholes-scbcq/1. Measured on the sample
# set: scbcq alone missed montreal and small; these two cover them. Each hosted
# model is a separate billed call per frame, so the active set is configurable.
ROBOFLOW_POTHOLE_KW_MODEL_ID = os.getenv("ROBOFLOW_POTHOLE_KW_MODEL_ID", "kuwait-potholes/1")
ROBOFLOW_POTHOLE_ALT_MODEL_ID = os.getenv(
    "ROBOFLOW_POTHOLE_ALT_MODEL_ID", "potholes-detection-j3w8s/1"
)
# Hosted road-damage model scores are low on close-up photos; see inference/roboflow_detector.py.
ROBOFLOW_CONFIDENCE = float(os.getenv("ROBOFLOW_CONFIDENCE", "0.40"))

# Kinds /detect/scan fans out to. Every entry costs one hosted call per frame,
# so trim this to cut spend; the names must exist in inference/roboflow_detector.SPECS.
SCAN_KINDS = tuple(
    k.strip() for k in os.getenv(
        "ROBOFLOW_SCAN_KINDS", "road,garbage,human,car,pothole_kw,pothole_alt"
    ).split(",") if k.strip()
)


def roboflow_api_key() -> str:
    """Read the secret at call time so imports never require configuration."""
    return os.getenv("ROBOFLOW_API_KEY", "").strip()
