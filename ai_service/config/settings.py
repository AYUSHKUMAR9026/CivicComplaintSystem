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
# Hosted road-damage model scores are low on close-up photos; see inference/roboflow_detector.py.
ROBOFLOW_CONFIDENCE = float(os.getenv("ROBOFLOW_CONFIDENCE", "0.40"))


def roboflow_api_key() -> str:
    """Read the secret at call time so imports never require configuration."""
    return os.getenv("ROBOFLOW_API_KEY", "").strip()
