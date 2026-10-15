"""Explicitly initiated training; model and checkpoint loads occur after preflight."""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

from ai_service.config.settings import ROOT, WEIGHTS
from ai_service.training.preflight import validate_training_data


def runtime_options(args, torch_module, saved=None):
    saved = saved or {}
    for key, default in (("epochs", 50), ("imgsz", 640), ("seed", 42)):
        supplied = getattr(args, key)
        if key in saved and supplied is not None and supplied != saved[key]:
            raise ValueError(f"Resume preserves original {key}={saved[key]}; start a new run to change it")
    device = args.device
    if device == "cpu" or not torch_module.cuda.is_available():
        selected = "cpu"
    else:
        selected = "0" if device in {"auto", "cuda"} else device.removeprefix("cuda:")
        if int(selected) >= torch_module.cuda.device_count():
            raise ValueError(f"CUDA device {selected} is unavailable")
    batch = args.batch if args.batch is not None else saved.get("batch", 8)
    options = {
        "epochs": saved.get("epochs", args.epochs if args.epochs is not None else 50),
        "imgsz": saved.get("imgsz", args.imgsz if args.imgsz is not None else 640),
        "seed": saved.get("seed", args.seed if args.seed is not None else 42),
        "batch": min(batch, 2) if selected == "cpu" else batch,
        "device": selected, "workers": 0,
        "amp": False, "cache": False, "deterministic": True,
        "val": True, "plots": True, "save": True, "save_period": 1,
        "patience": 0, "pretrained": True,
    }
    return options


class Tee:
    def __init__(self, console, log):
        self.console, self.log = console, log

    def write(self, value):
        self.log.write(value)
        self.log.flush()
        return self.console.write(value)

    def flush(self):
        self.console.flush()
        self.log.flush()

    def isatty(self):
        return False


def apply_resume_policy(namespace, overrides):
    # Upstream restores original absolute paths. Replace only validated local
    # paths/runtime options, preserving checkpoint optimizer/scheduler state.
    for key in ("data", "project", "name", "save_dir", "exist_ok", "epochs", "seed",
                "device", "batch", "imgsz", "workers", "amp", "cache", "deterministic",
                "val", "plots", "save", "save_period", "patience"):
        if key in overrides:
            setattr(namespace, key, overrides[key])


def backend_dependencies():
    """Import the installed training API without constructing/training a model."""
    from ultralytics import YOLO, settings, __version__
    from ultralytics.models.yolo.detect import DetectionTrainer
    from ultralytics.utils import LOGGER

    return YOLO, DetectionTrainer, LOGGER, settings, __version__


def run(args):
    import yaml

    normalized, report = validate_training_data(args.data, args.allow_empty_labels)
    saved = None
    if args.resume:
        checkpoint = args.resume.resolve()
        if checkpoint.name != "last.pt" or checkpoint.parent.name != "weights" or not checkpoint.is_file():
            raise ValueError("--resume must point to an existing run/weights/last.pt")
        output = checkpoint.parent.parent
        saved_file = output / "run.json"
        if not saved_file.is_file():
            raise ValueError("Resume requires this pipeline's run.json beside the weights directory")
        saved = json.loads(saved_file.read_text(encoding="utf-8"))
        if saved["dataset_fingerprint"] != report["fingerprint"]:
            raise ValueError("Dataset images, labels, splits or capture groups changed; resume is blocked")
        if args.output and args.output.resolve() != output:
            raise ValueError("Resume writes into the original checkpoint run directory")
        if args.weights:
            raise ValueError("Use --resume alone; do not supply --weights when resuming")
    else:
        checkpoint = (args.weights or WEIGHTS).resolve()
        output = (args.output or ROOT / "runs" / ("street-issues-yolo11n-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))).resolve()
        if output.exists():
            raise ValueError(f"Output exists; choose a new --output or use --resume: {output}")
    if not checkpoint.is_file() or checkpoint.suffix != ".pt":
        raise ValueError(f"Missing local .pt weights: {checkpoint}. Run the existing download_assets script explicitly first.")
    root = Path(report["dataset_root"])
    if output.is_relative_to(root) or root.is_relative_to(output):
        raise ValueError("Training output must be separate from the dataset directory")
    import torch

    options = runtime_options(args, torch, saved["options"] if saved else None)
    print(json.dumps({"mode": "train" if args.train else "check only", "output": str(output), "options": options, "dataset": report}, indent=2))
    if options["device"] == "cpu":
        print("CPU selected: effective batch capped at 2, workers=0, AMP/cache disabled. Training can be slow.")
    if not args.train:
        print("Preflight passed. No training started. Add --train to initiate training explicitly.")
        return

    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    import numpy as np
    YOLO, DetectionTrainer, LOGGER, settings, ultralytics_version = backend_dependencies()

    settings.update({key: False for key in ("sync", "clearml", "comet", "dvc", "hub", "mlflow", "neptune", "raytune", "tensorboard", "wandb")})
    random.seed(options["seed"])
    np.random.seed(options["seed"])
    torch.manual_seed(options["seed"])
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(options["seed"])
    torch.set_num_threads(min(os.cpu_count() or 1, 4))

    class ValidatedTrainer(DetectionTrainer):
        def check_resume(self, overrides):
            super().check_resume(overrides)
            if self.resume:
                apply_resume_policy(self.args, overrides)

    # No output or model loading occurs until validation and explicit opt-in pass.
    if not saved:
        output.mkdir(parents=True, exist_ok=False)
    data_file = output / "training_data.yaml"
    data_file.write_text(yaml.safe_dump(normalized, sort_keys=False), encoding="utf-8")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    (output / f"preflight-{timestamp}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not saved:
        run_info = {"schema_version": 1, "dataset_fingerprint": report["fingerprint"],
                    "options": options, "initial_weights": str(checkpoint), "classes": normalized["names"],
                    "initial_weights_sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
                    "versions": {"torch": torch.__version__, "ultralytics": ultralytics_version,
                                 "python": sys.version, "numpy": np.__version__}}
        (output / "run.json").write_text(json.dumps(run_info, indent=2), encoding="utf-8")
    train_options = {**options, "data": str(data_file), "project": str(output.parent),
                     "name": output.name, "save_dir": str(output), "exist_ok": True}
    state_file = output / "status.json"

    def status(state, detail=""):
        state_file.write_text(json.dumps({"status": state, "detail": detail, "updated_utc": datetime.now(timezone.utc).isoformat()}), encoding="utf-8")

    import logging
    handler = logging.FileHandler(output / "training.log", encoding="utf-8")
    LOGGER.addHandler(handler)
    try:
        with (output / "console.log").open("a", encoding="utf-8") as log:
            with contextlib.redirect_stdout(Tee(sys.stdout, log)), contextlib.redirect_stderr(Tee(sys.stderr, log)):
                status("running")
                model = YOLO(str(checkpoint), task="detect")
                if saved and (model.ckpt.get("epoch", -1) < 0 or model.ckpt.get("optimizer") is None):
                    raise ValueError("Checkpoint was finalized/stripped and cannot resume; use an interrupted last.pt")
                model.train(trainer=ValidatedTrainer, resume=bool(saved), **train_options)
                # Ultralytics validates each epoch and validates best.pt at completion.
                best, last = output / "weights/best.pt", output / "weights/last.pt"
                if not best.is_file() or not last.is_file():
                    raise RuntimeError("Training returned without expected best.pt and last.pt checkpoints")
                metrics = {k: float(v) for k, v in model.trainer.metrics.items()}
                (output / "validation_metrics.json").write_text(json.dumps(metrics, indent=2, allow_nan=False), encoding="utf-8")
                status("completed")
                print(f"Best custom model: {best}")
    except KeyboardInterrupt:
        status("interrupted", "Resume from weights/last.pt if at least one epoch was saved")
        raise
    except Exception as exc:
        status("failed", str(exc))
        raise
    finally:
        LOGGER.removeHandler(handler)
        handler.close()
