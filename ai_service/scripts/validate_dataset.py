"""Validate configured YOLO sources and write a self-contained visual report."""
import argparse
from datetime import datetime, timezone
from pathlib import Path

from ai_service.dataset_tools.pipeline import DEFAULT_MANIFEST, inspect, write_report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_MANIFEST.parents[1] / "datasets")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or DEFAULT_MANIFEST.parents[1] / "runs" / ("dataset-validation-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    try:
        _, records, report = inspect(args.manifest, args.inventory.resolve())
        output.mkdir(parents=True, exist_ok=False)
        write_report(output, report, records)
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Validation could not complete: {exc}\n")
    print(f"Validated images: {len(records)}; errors: {len(report['errors'])}")
    for name, stats in report["summary"]["classes"].items():
        print(f"{name}: {stats['images']} images, {stats['instances']} objects")
    print(f"Report: {output.resolve() / 'report.html'}")
    if report["errors"]:
        for error in report["errors"]:
            print(f"ERROR: {error}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
