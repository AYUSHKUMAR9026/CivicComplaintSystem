"""Validate local YOLO detection splits without invoking Ultralytics downloads."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import yaml

from ai_service.dataset_tools.pipeline import (
    CLASSES, EXTENSIONS, Record, image_info, parse_labels, split_records, summarize,
)


def validate_training_data(data: Path, allow_empty_labels: bool = False):
    data = data.resolve()
    metadata = yaml.safe_load(data.read_text(encoding="utf-8-sig"))
    if not isinstance(metadata, dict):
        raise ValueError("data.yaml must contain a mapping")
    names = metadata.get("names")
    if isinstance(names, list):
        names = dict(enumerate(names))
    if not isinstance(names, dict) or {str(k): v for k, v in names.items()} != dict(zip(("0", "1", "2"), CLASSES)):
        raise ValueError("data.yaml names must be 0: pothole, 1: garbage, 2: overflowing_bin")
    if metadata.get("nc", 3) != 3:
        raise ValueError("data.yaml nc must equal 3")
    if "download" in metadata:
        raise ValueError("Remove the data.yaml download field; only existing local datasets are accepted")
    root = Path(metadata.get("path") or data.parent)
    if not root.is_absolute():
        root = data.parent / root
    root = root.resolve()
    manifest_file = root / "split_manifest.json"
    entries = {}
    if manifest_file.exists():
        if not (root / "PREPARATION_COMPLETE").is_file():
            raise ValueError("Prepared dataset has no PREPARATION_COMPLETE marker")
        rows = json.loads(manifest_file.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            raise ValueError("split_manifest.json must be a list")
        for entry in rows:
            key = entry["image"]
            if key in entries:
                raise ValueError(f"Duplicate split manifest entry: {key}")
            entries[key] = entry
    errors, warnings, records, actual_splits, signatures, seen = [], [], [], {}, [], set()
    capture_splits, pixel_boxes = {}, {}
    if not manifest_file.exists():
        warnings.append("No split manifest: capture/video grouping cannot be verified. Use the dataset preparation pipeline.")
    normalized = {"nc": 3, "names": dict(enumerate(CLASSES))}
    for split in ("train", "val", "test"):
        values = metadata.get(split)
        if values is None:
            if split != "test":
                errors.append(f"Missing required {split} split")
            continue
        values = values if isinstance(values, list) else [values]
        split_paths = []
        split_start = len(records)
        if not values:
            errors.append(f"{split} has no image directories")
        for value in values:
            if not isinstance(value, str) or not value.strip() or "://" in value:
                errors.append(f"{split}: use local image directories, not URLs")
                continue
            directory = (root / value).resolve()
            if not directory.is_dir():
                errors.append(f"Missing {split} image directory: {directory}")
                continue
            # Match Ultralytics' images -> labels convention for both layouts.
            image_parents = [p for p in (directory, *directory.parents) if p.name == "images"]
            if not image_parents:
                errors.append(f"{directory}: expected an images/ directory paired with labels/")
                continue
            image_root = image_parents[0]
            label_root = image_root.parent / "labels"
            labels_dir = label_root / directory.relative_to(image_root)
            if not labels_dir.is_dir():
                errors.append(f"Missing labels directory: {labels_dir}")
                continue
            split_paths.append(str(directory))
            images = sorted(p for p in directory.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSIONS)
            stems = [p.relative_to(directory).with_suffix("").as_posix().casefold() for p in images]
            if len(set(stems)) != len(stems):
                errors.append(f"{directory}: ambiguous image stems share one annotation")
            stem_set = set(stems)
            for label in labels_dir.rglob("*.txt"):
                if label.relative_to(labels_dir).with_suffix("").as_posix().casefold() not in stem_set:
                    errors.append(f"Missing image for annotation: {label}")
            for image in images:
                try:
                    resolved = image.resolve()
                    if resolved in seen:
                        raise ValueError("Image is assigned more than once or occurs in multiple splits")
                    seen.add(resolved)
                    if not resolved.is_relative_to(root):
                        raise ValueError("Image path escapes dataset root")
                    relative = image.relative_to(root).as_posix()
                    label = label_root / image.relative_to(image_root).with_suffix(".txt")
                    if not label.is_file() or not label.resolve().is_relative_to(root):
                        raise ValueError(f"Missing or out-of-root annotation: {label}")
                    boxes, issues = parse_labels(label, dict(zip(("0", "1", "2"), CLASSES)), allow_empty_labels)
                    if issues:
                        raise ValueError("; ".join(issues))
                    width, height, pixel_hash, dhash = image_info(image)
                    file_hash = hashlib.sha256(image.read_bytes()).hexdigest()
                    entry = entries.get(relative)
                    group = f"independent:{relative}"
                    if manifest_file.exists():
                        if entry is None or entry.get("split") != split:
                            raise ValueError("Image/split disagrees with split_manifest.json")
                        if entry.get("label") != label.relative_to(root).as_posix():
                            raise ValueError("Annotation path disagrees with split manifest")
                        if entry.get("file_sha256") != file_hash or entry.get("pixel_sha256") != pixel_hash:
                            raise ValueError("Image contents changed since dataset preparation")
                        if not entry.get("component") or not entry.get("capture_group"):
                            raise ValueError("Prepared image is missing capture/component metadata")
                        capture = entry["capture_group"]
                        if capture in capture_splits and capture_splits[capture] != split:
                            raise ValueError("Declared capture group crosses split boundaries")
                        capture_splits[capture] = split
                        group = "prepared:" + entry["component"]
                    box_signature = sorted(tuple(round(v, 6) for v in box) for box in boxes)
                    if pixel_hash in pixel_boxes and pixel_boxes[pixel_hash] != box_signature:
                        raise ValueError("Identical pixels have conflicting annotations")
                    pixel_boxes[pixel_hash] = box_signature
                    actual_splits[len(records)] = split
                    records.append(Record(image, label, "prepared", relative, boxes, group, pixel_hash, dhash, width, height))
                    signatures.append((split, relative, file_hash, hashlib.sha256(label.read_bytes()).hexdigest(), group,
                                       entry.get("capture_group") if entry else None))
                except (OSError, ValueError) as exc:
                    errors.append(f"{image}: {exc}")
        normalized[split] = split_paths[0] if len(split_paths) == 1 else split_paths
        stats = summarize(records[split_start:])
        if not stats["images"]:
            errors.append(f"{split} split is empty")
        missing = [name for name, counts in stats["classes"].items() if counts["missing"]]
        if missing:
            if split in {"train", "val"}:
                errors.append(f"{split} is missing object classes: {', '.join(missing)}")
            else:
                warnings.append(f"test is missing classes: {', '.join(missing)}")
        low = [name for name, counts in stats["classes"].items() if counts["underrepresented"]]
        if low:
            warnings.append(f"{split} has underrepresented classes: {', '.join(low)}; training quality is not established")
    if entries and set(entries) != {r.relative_image for r in records}:
        errors.append("Split manifest and validated image inventory differ; re-prepare the dataset")
    if records:
        _, _, links = split_records(records, 42, 6)
        crossing = [link for link in links if actual_splits[link["a"]] != actual_splits[link["b"]]]
        if crossing:
            errors.append(f"Split leakage: {len(crossing)} capture/exact/perceptual links cross split boundaries")
    report = {
        "data_yaml": str(data), "dataset_root": str(root), "errors": errors, "warnings": warnings,
        "summary": summarize(records),
        "splits": {s: summarize([r for i, r in enumerate(records) if actual_splits[i] == s]) for s in ("train", "val", "test")},
        "fingerprint": hashlib.sha256(json.dumps(sorted(signatures)).encode()).hexdigest(),
        "leakage_check": "declared prepared components, exact decoded pixels and dHash radius 6",
    }
    if errors:
        raise ValueError("Dataset validation failed:\n" + "\n".join(errors))
    return normalized, report
