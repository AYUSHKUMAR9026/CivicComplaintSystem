"""Proxy to the isolated ai_service computer vision experiment.

Keeps torch/ultralytics out of the backend environment, reuses this app's JWT
auth, and avoids exposing the CV service or the Roboflow key to the browser.
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
import httpx
import logging
import os

from common.auth import get_current_active_user

logger = logging.getLogger("civic.detect")

router = APIRouter(prefix="/api/detect", tags=["Detection"])

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
MAX_BYTES = 10 * 1024 * 1024
# The Roboflow SDK has no request timeout of its own, so bound it here.
REQUEST_TIMEOUT = float(os.getenv("AI_SERVICE_TIMEOUT", "45"))

UNAVAILABLE = (
    "Detection service is not running. Start it with: "
    "ai_service/.venv/Scripts/python.exe -m uvicorn ai_service.app:app --port 8001"
)


@router.get("/health")
async def detection_health(current_user=Depends(get_current_active_user)):
    """Report whether the CV service and the hosted road model are reachable."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{AI_SERVICE_URL}/health")
            response.raise_for_status()
            return {"reachable": True, **response.json()}
    except (httpx.ConnectError, httpx.TimeoutException):
        return {"reachable": False, "detail": UNAVAILABLE}
    except httpx.HTTPError as exc:
        logger.warning(f"Detection health check failed: {exc}")
        return {"reachable": False, "detail": str(exc)}


async def forward_image(path: str, file: UploadFile, confidence: float) -> dict:
    """Forward one image to the CV service, bounding the request time here."""
    if not 0 < confidence <= 1:
        raise HTTPException(422, "confidence must be greater than 0 and at most 1")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image must be at most 10 MiB")
    if not data:
        raise HTTPException(400, "Image is empty")

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{AI_SERVICE_URL}{path}",
                files={"file": (file.filename or "upload.jpg", data, file.content_type or "image/jpeg")},
                data={"confidence": str(confidence)},
            )
    except httpx.ConnectError as exc:
        logger.warning(f"Detection service unreachable at {AI_SERVICE_URL}: {exc}")
        raise HTTPException(503, UNAVAILABLE) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Detection timed out. The hosted model may be cold starting; try again.") from exc

    if response.status_code >= 400:
        # Surface the CV service's own message rather than masking it.
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(response.status_code, detail)
    return response.json()


@router.post("/road")
async def detect_road(
    file: UploadFile = File(...),
    confidence: float = Form(default=0.40),
    current_user=Depends(get_current_active_user),
):
    """Forward an image to the hosted RDD2022 road damage model."""
    return await forward_image("/detect/road", file, confidence)


@router.post("/scan")
async def detect_scan(
    file: UploadFile = File(...),
    confidence: float = Form(default=0.40),
    current_user=Depends(get_current_active_user),
):
    """Run both civic models over one frame, for the live scanner."""
    return await forward_image("/detect/scan", file, confidence)
