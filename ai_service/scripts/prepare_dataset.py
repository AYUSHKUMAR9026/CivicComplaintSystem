"""Combine, explicitly remap and group-split validated YOLO detection datasets."""
import argparse
from pathlib import Path

from ai_service.dataset_tools.pipeline import DEFAULT_MANIFEST, prepare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_MANIFEST.parents[1] / "datasets/prepared")
    args = parser.parse_args()
    try:
        report = prepare(args.manifest, args.output)
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Preparation stopped: {exc}\n")
    for split, stats in report["splits"].items():
        print(f"{split}: {stats['images']} images, {stats['objects']} objects")
    for warning in report["warnings"]:
        print(f"WARNING: {warning}")
    print(f"Report: {args.output.resolve() / 'report.html'}")
    print(f"Ready for training (coverage check only): {report['ready_for_training']}")


if __name__ == "__main__":
    main()
