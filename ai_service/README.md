# Phase 1: YOLO11 setup and real inference

Dataset preparation is now available separately: see [DATASETS.md](DATASETS.md)
for validation, explicit source mappings, leakage-aware splits, and visual reports.
Real labeled civic datasets have not yet been added. No training runs are started.

Custom transfer-learning tooling is available in [training/README.md](training/README.md),
including a check-only CLI, explicit training/resume commands, and a Google Colab
notebook. Training remains blocked until genuine dataset validation passes.

This is an isolated experiment alongside the existing React/Vite frontend,
FastAPI/SQLAlchemy backend, and PostgreSQL database. The backend already has
LLM-assisted complaint assessment in `backend/complaint/assessment.py`; this
module adds computer vision without changing that assessment, complaint routes,
database, frontend, Docker configuration, or backend dependencies.

**The pretrained `yolo11n.pt` model detects 80 COCO object categories** such as
people, cars, and buses. It has not been custom trained to detect potholes,
street garbage, overflowing garbage bins, or faulty streetlights. A detected
bottle or traffic light does not establish a garbage problem or lighting fault.
No training, civic classification, or complaint integration occurs in Phase 1.

## Files

| Location | Purpose |
| --- | --- |
| `requirements.txt` | Python 3.11 dependency versions |
| `.venv/` | Separate local Python environment (ignored) |
| `config/settings.py` | Paths, image size, confidence defaults |
| `datasets/samples/`, `datasets/raw/` | Demo photo and future local data (ignored) |
| `weights/` | Downloaded pretrained model (ignored) |
| `training/` | Documentation placeholder for future training |
| `inference/detector.py` | Shared model loading, CPU/CUDA selection, box serialization |
| `scripts/download_assets.py` | Downloads official weights and demo image, preserves existing files |
| `scripts/detect_image.py` | Local image inference and saved results |
| `app.py` | Independent experimental FastAPI application |
| `tests/test_smoke.py` | Real model/CPU inference, fallback selection, API checks |
| `runs/` | Timestamped annotated images and JSON (ignored) |

## Install (Windows PowerShell)

Run all commands from the **repository root**, not from `backend/` or `ai_service/`.
Use Python 3.11, matching the existing project's `.python-version` intent.
No activation is needed when using the environment's Python explicitly.

```powershell
py -3.11 -m venv ai_service/.venv
ai_service/.venv/Scripts/python.exe -m pip install --upgrade pip
# CPU build is sufficient for the nano model and works without an NVIDIA GPU.
ai_service/.venv/Scripts/python.exe -m pip install torch==2.9.0 torchvision==0.24.0 --index-url https://download.pytorch.org/whl/cpu
ai_service/.venv/Scripts/python.exe -m pip install -r ai_service/requirements.txt
ai_service/.venv/Scripts/python.exe -m pip check
```

If Python 3.11 is missing and you have `uv`, use this in place of the first line:

```powershell
$env:UV_CACHE_DIR="$PWD/ai_service/.cache/uv"
$env:UV_PYTHON_INSTALL_DIR="$PWD/ai_service/.python"
uv venv --python 3.11 ai_service/.venv
```

`uv` downloads a Python 3.11 interpreter if needed. If that environment has no
pip, install packages using `uv pip install --python ai_service/.venv/Scripts/python.exe`
instead of `ai_service/.venv/Scripts/python.exe -m pip install` in the commands
above. The pip upgrade command can be omitted with `uv`.

Linux/macOS: create with `python3.11 -m venv ai_service/.venv` and substitute
`ai_service/.venv/bin/python` for every Windows interpreter path. On macOS,
install torch/torchvision from the default package index rather than the CPU
index. On Linux servers, OpenCV may need OS libraries `libgl1` and `libglib2.0-0`.

For an NVIDIA GPU, install the matching PyTorch 2.9.0/torchvision 0.24.0 CUDA
build using the [official PyTorch instructions](https://pytorch.org/get-started/previous-versions/)
in this environment. Auto selection uses CUDA device 0 only when
`torch.cuda.is_available()` is true; otherwise it uses CPU. `--device cpu`
forces CPU. `--device cuda` also falls back to CPU when CUDA is unavailable;
runtime GPU errors such as insufficient GPU memory remain visible.

## Download and run

Internet is required once to download dependencies, the approximately 5.4 MB
model, and demo photo. Inference then runs locally without API keys.

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.download_assets
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.detect_image --device cpu
```

The demonstration image shows a bus and people, suitable for the pretrained
model. The command prints the chosen device, actual detection count, and output
directory. Open `annotated.jpg` and `detections.json` in that directory beneath
`ai_service/runs/`. Each run creates a new directory. JSON contains class ID,
class name, confidence, and `[left, top, right, bottom]` box coordinates in
original-image pixels. Confidence is a model score, not verified accuracy.

Try your own local image (quote paths containing spaces):

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.detect_image --source "C:/photos/street.jpg" --confidence 0.25
```

Zero detections is valid. No hardcoded boxes, synthetic model results, or
replacement detections are added. Missing weights or invalid images cause a
visible error. Downloads are explicit; importing the module never fetches weights.
If a download fails, check connectivity and rerun. If a `.part` file remains
after a process interruption, remove that partial file before retrying. If an
existing weight/image is corrupt, remove that specific file and download again.

## Smoke test

Download the assets first, then run:

```powershell
ai_service/.venv/Scripts/python.exe -m pytest ai_service/tests -q
```

Tests import PyTorch, OpenCV, Ultralytics, NumPy, and FastAPI, load the real
80-category model, run CPU inference on the demo photo, and exercise the API
with a real upload and malformed/oversized inputs. Device-selection tests
simulate CUDA availability only to check branching; detection tests use the
real model. Missing assets/dependencies fail rather than silently skip. Passing
these tests verifies setup, not civic detection quality.

## Optional local API

After downloading assets:

```powershell
ai_service/.venv/Scripts/python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 8001
```

Open <http://127.0.0.1:8001/docs>, expand `POST /detect`, click **Try it out**,
upload an image and execute. `GET /health` reports the loaded model and device.
The service starts only if weights load successfully. It returns real COCO
detections and a scope notice. It does not write uploaded photos to disk.

This experimental API is bound to localhost and has no authentication. Keep it
local; public deployment and integration are future work. Uploads are limited
to 10 MiB and decoded images to 20 megapixels (the pixel check occurs after
decoding). Port 8001 avoids the existing backend's port 8000. Stop with Ctrl+C.

## Verified local setup (2026-10-15)

The environment was created and dependencies installed using `uv` with Python
3.11.16 and PyTorch 2.9.0+cpu. Dependency compatibility checks passed. The
official model and bus sample downloaded successfully after a transient DNS
failure. All **3 smoke tests passed**. The image CLI ran successfully on CPU
and produced **5 real detections: one bus and four people**, with an annotated
image and JSON under `runs/`. Rerunning the downloader preserved existing assets.

CUDA execution was not tested because the installed PyTorch build is CPU-only;
fallback selection was tested. The test run emitted one third-party Starlette/
AnyIO deprecation warning, with no test failures. The existing application's
full regression suite was not run; its runtime code and dependencies were not
changed. Online documentation browsing was unavailable in this session; the
source links below are provided for reference, and the actual package imports,
model loading, and inference were validated locally.

## Sources and next phase

- [Ultralytics YOLO11 documentation](https://docs.ultralytics.com/models/yolo11/)
- [Official weight release](https://github.com/ultralytics/assets/releases/tag/v8.3.0)
- [Official demo photo](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/assets/bus.jpg)
- [Ultralytics licensing](https://www.ultralytics.com/license): Ultralytics has
  AGPL-3.0 and Enterprise licensing options; the repository's existing MIT
  statement does not relicense third-party code, weights, or demo assets.

Future work requires defining civic labels, collecting and labeling suitable
images, choosing train/validation/test splits, and evaluating a custom model.
Faulty streetlights may also need nighttime or temporal evidence. Those steps
are deliberately outside Phase 1.
