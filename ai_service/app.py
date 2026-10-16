"""Local-only experimental API, independent of the existing backend."""
from contextlib import asynccontextmanager

from ai_service.config.settings import (
    ROBOFLOW_CONFIDENCE,
    ROBOFLOW_GARBAGE_MODEL_ID,
    ROBOFLOW_MODEL_ID,
)
from ai_service.inference.detector import Detector, detections
from ai_service.inference.roboflow_detector import RoboflowDetector, RoboflowError
from ai_service.inference.scan import CivicScanner

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.detector = Detector()
    # The hosted detector needs an API key. Keep startup working without one so
    # the local COCO endpoint stays usable; /detect/road then reports why.
    try:
        app.state.roboflow = RoboflowDetector(kind="road")
        app.state.scanner = CivicScanner(confidence=ROBOFLOW_CONFIDENCE)
        app.state.roboflow_error = None
    except (RoboflowError, ValueError) as exc:
        app.state.roboflow = None
        app.state.scanner = None
        app.state.roboflow_error = str(exc)
    yield


app = FastAPI(title="Civic Eye - YOLO11 and hosted road damage experiment", lifespan=lifespan)


async def read_upload(file: UploadFile) -> np.ndarray:
    """Apply the same size, decode and pixel guards to every upload."""
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image must be at most 10 MiB")
    if not data:
        raise HTTPException(400, "Image is empty")
    try:
        image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    except cv2.error as exc:
        raise HTTPException(400, "Cannot decode image") from exc
    if image is None:
        raise HTTPException(400, "Cannot decode image")
    if image.shape[0] * image.shape[1] > MAX_PIXELS:
        raise HTTPException(413, "Image must be at most 20 megapixels")
    return image


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": "yolo11n.pt",
        "device": app.state.detector.device,
        "road_model": {
            "model_id": ROBOFLOW_MODEL_ID,
            "garbage_model_id": ROBOFLOW_GARBAGE_MODEL_ID,
            "available": app.state.roboflow is not None,
            "default_confidence": ROBOFLOW_CONFIDENCE,
            "error": app.state.roboflow_error,
        },
    }


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    image = await read_upload(file)
    result = await run_in_threadpool(app.state.detector.predict, image)
    return {
        "model": "yolo11n.pt", "device": app.state.detector.device,
        "scope": "Pretrained COCO objects only; no custom civic defect training",
        "detections": detections(result),
    }


@app.post("/detect/road")
async def detect_road(file: UploadFile = File(...), confidence: float = Form(default=ROBOFLOW_CONFIDENCE)):
    """Hosted RDD2022 road damage inference. Only class D40 is a pothole."""
    if app.state.roboflow is None:
        raise HTTPException(503, f"Hosted road model unavailable: {app.state.roboflow_error}")
    if not 0 < confidence <= 1:
        raise HTTPException(422, "confidence must be greater than 0 and at most 1")
    image = await read_upload(file)
    detector = app.state.roboflow
    if confidence != detector.confidence:
        # Threshold is fixed per client, so build one for non-default requests.
        try:
            detector = RoboflowDetector(confidence=confidence)
        except RoboflowError as exc:
            raise HTTPException(503, str(exc)) from exc
    try:
        return await run_in_threadpool(detector.predict, image)
    except RoboflowError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/detect/scan")
async def detect_scan(file: UploadFile = File(...), confidence: float = Form(default=ROBOFLOW_CONFIDENCE)):
    """Run the road and garbage models over one frame and merge the findings."""
    if app.state.scanner is None:
        raise HTTPException(503, f"Hosted models unavailable: {app.state.roboflow_error}")
    if not 0 < confidence <= 1:
        raise HTTPException(422, "confidence must be greater than 0 and at most 1")
    image = await read_upload(file)
    scanner = app.state.scanner
    if confidence != scanner.confidence:
        try:
            scanner = CivicScanner(confidence=confidence)
        except RoboflowError as exc:
            raise HTTPException(503, str(exc)) from exc
    try:
        return await run_in_threadpool(scanner.scan, image)
    except RoboflowError as exc:
        raise HTTPException(502, str(exc)) from exc
