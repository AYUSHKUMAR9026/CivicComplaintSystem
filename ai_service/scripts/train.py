"""Preflight or explicitly train the three-class YOLO11 nano detector.

From the repository root: python -m ai_service.scripts.train --help
"""
import argparse
import re
from pathlib import Path


def positive(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def seed_value(value):
    number = int(value)
    if not 0 <= number < 2 ** 32:
        raise argparse.ArgumentTypeError("seed must be between 0 and 2^32-1")
    return number


def device_value(value):
    if value not in {"auto", "cpu", "cuda"} and not re.fullmatch(r"(?:cuda:)?\d+", value):
        raise argparse.ArgumentTypeError("use auto, cpu, cuda, or one CUDA index such as 0 or cuda:0")
    return value


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parents[1] / "config/data.yaml", help="Local YOLO data.yaml")
    parser.add_argument("--weights", type=Path, help="Local pretrained .pt file; default ai_service/weights/yolo11n.pt")
    parser.add_argument("--epochs", type=positive, help="Total epochs, default 50; restored on resume")
    parser.add_argument("--batch", type=positive, help="Batch size, default 8; capped at 2 on CPU")
    parser.add_argument("--imgsz", type=positive, help="Image size, default 640; restored on resume")
    parser.add_argument("--device", type=device_value, default="auto")
    parser.add_argument("--seed", type=seed_value, help="Random seed, default 42; restored on resume")
    parser.add_argument("--output", type=Path, help="New output directory; default timestamped street-issues-yolo11n run")
    parser.add_argument("--resume", type=Path, help="Interrupted run/weights/last.pt")
    parser.add_argument("--allow-empty-labels", action="store_true", help="Allow existing empty labels for verified negative images")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--train", action="store_true", help="Explicitly start/resume training after preflight passes")
    mode.add_argument("--check", action="store_true", help="Preflight only (also the default)")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.imgsz is not None and args.imgsz % 32:
        parser.error("--imgsz must be a multiple of 32, for example 640 or 320")
    from ai_service.training.runner import run

    try:
        run(args)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(2, f"Training/preflight stopped: {exc}\n")


if __name__ == "__main__":
    main()
