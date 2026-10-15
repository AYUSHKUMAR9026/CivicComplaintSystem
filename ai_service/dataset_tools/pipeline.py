"""Dataset tools, independent of model loading and training.

Never infer class meaning from a numeric ID or generate absent annotations.
"""
from __future__ import annotations

import base64
import csv
import hashlib
import html
import io
import json
import math
import random
import re
import shutil
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageOps

CLASSES = ("pothole", "garbage", "overflowing_bin")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
SPLITS = ("train", "val", "test")
RATIOS = (0.8, 0.1, 0.1)
DEFAULT_MANIFEST = Path(__file__).resolve().parents[1] / "config/dataset_sources.json"


@dataclass
class Record:
    image: Path
    label: Path
    source: str
    relative_image: str
    boxes: list[tuple[int, float, float, float, float]]
    group: str
    pixel_hash: str
    perceptual_hash: int
    width: int
    height: int


def under(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"Path escapes dataset root: {relative}")
    return path


def image_info(path: Path):
    with Image.open(path) as original:
        if original.getexif().get(274, 1) != 1:
            raise ValueError("EXIF rotation present; verify orientation and labels before importing")
        image = original.convert("RGB")
        image.load()
    width, height = image.size
    digest = hashlib.sha256(f"{width}x{height}:".encode() + image.tobytes()).hexdigest()
    gray = np.asarray(image.convert("L").resize((9, 8), Image.Resampling.LANCZOS))
    bits = gray[:, 1:] > gray[:, :-1]
    dhash = int.from_bytes(np.packbits(bits).tobytes(), "big")
    return width, height, digest, dhash


def parse_labels(path: Path, mapping: dict[str, str], allow_empty: bool):
    boxes, errors = [], []
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    if not any(line.strip() for line in lines) and not allow_empty:
        errors.append("Empty annotation requires allow_empty_labels=true and a verified negative image")
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        parts = line.split()
        try:
            if len(parts) != 5 or not re.fullmatch(r"\d+", parts[0]):
                raise ValueError("Expected: integer_class_id x_center y_center width height (5 fields)")
            key = str(int(parts[0]))
            if key not in mapping:
                raise ValueError(f"Unmapped source class ID {key}")
            x, y, w, h = map(float, parts[1:])
            if not all(math.isfinite(v) for v in (x, y, w, h)):
                raise ValueError("Coordinates must be finite")
            if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1):
                raise ValueError("Coordinates must be normalized; width/height must be positive")
            if min(x - w / 2, y - h / 2) < -1e-6 or max(x + w / 2, y + h / 2) > 1 + 1e-6:
                raise ValueError("Bounding box extends outside image")
            box = (CLASSES.index(mapping[key]), x, y, w, h)
            if box in boxes:
                raise ValueError("Duplicate object annotation")
            boxes.append(box)
        except (ValueError, KeyError) as exc:
            errors.append(f"line {number}: {exc}")
    return boxes, errors


def source_config(source: dict, base: Path):
    for field in ("id", "root", "name", "url", "license", "license_url", "attribution"):
        if (not isinstance(source.get(field), str) or not source[field].strip()
                or "REQUIRED:" in source[field]
                or source[field].strip().lower() in {"unknown", "todo", "tbd", "unspecified", "n/a"}):
            raise ValueError(f"Missing source metadata: {field}")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", source["id"]):
        raise ValueError("Source id must use only letters, digits, underscores, hyphens")
    root = (base / source["root"]).resolve()
    if not root.is_dir():
        raise ValueError(f"Dataset directory does not exist: {root}")
    names, mapping = source.get("class_names", {}), source.get("class_map", {})
    if not names or not isinstance(names, dict) or not isinstance(mapping, dict):
        raise ValueError("class_names and class_map must be explicit nonempty dictionaries")
    if any(not re.fullmatch(r"0|[1-9]\d*", key) for key in names):
        raise ValueError("class_names must use canonical nonnegative integer-string keys")
    if any(not isinstance(name, str) or not name.strip() for name in names.values()):
        raise ValueError("Source class names must be nonempty strings")
    if set(names) != set(mapping) or any(v not in CLASSES for v in mapping.values()):
        raise ValueError("Map every declared source ID explicitly to pothole, garbage, or overflowing_bin")
    yaml_path = source.get("data_yaml")
    if yaml_path:
        metadata = yaml.safe_load(under(root, yaml_path).read_text(encoding="utf-8-sig"))
        actual = metadata.get("names") if isinstance(metadata, dict) else None
        if isinstance(actual, list):
            actual = dict(enumerate(actual))
        if not isinstance(actual, dict) or {str(k): v for k, v in actual.items()} != names:
            raise ValueError("Declared class_names do not match the source data.yaml names")
        if "nc" in metadata and metadata["nc"] != len(names):
            raise ValueError("Source data.yaml nc disagrees with names")
    for filename in source.get("license_files", []):
        if not under(root, filename).is_file():
            raise ValueError(f"Missing license file: {filename}")
    pairs = source.get("pairs")
    if not isinstance(pairs, list) or not pairs:
        raise ValueError("Specify images/labels directory pairs explicitly")
    for pair in pairs:
        for kind in ("images", "labels"):
            if not under(root, pair[kind]).is_dir():
                raise ValueError(f"Missing {kind} directory: {pair[kind]}")
    if not isinstance(source.get("allow_empty_labels", False), bool):
        raise ValueError("allow_empty_labels must be true or false")
    grouping = source.get("grouping", {"mode": "whole_source"})
    if not isinstance(grouping, dict):
        raise ValueError("grouping must be a dictionary")
    if grouping.get("mode") not in {"whole_source", "independent_images", "csv"}:
        raise ValueError("grouping.mode must be whole_source, independent_images, or csv")
    groups = {}
    if grouping["mode"] == "csv":
        with under(root, grouping["file"]).open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != ["image", "group"]:
                raise ValueError("Grouping CSV header must be image,group")
            for row in reader:
                if set(row) != {"image", "group"} or not all(isinstance(v, str) for v in row.values()):
                    raise ValueError("Each grouping CSV row needs exactly one image path and one group ID")
                key = under(root, row["image"]).relative_to(root).as_posix()
                if key in groups or not row["group"].strip():
                    raise ValueError("Grouping CSV contains duplicate paths or an empty group")
                groups[key] = row["group"].strip()
    return root, mapping, grouping, groups


def summarize(records: list[Record]):
    objects = Counter(box[0] for record in records for box in record.boxes)
    images = Counter(c for record in records for c in {box[0] for box in record.boxes})
    maximum = max(objects.values(), default=0)
    return {
        "images": len(records), "objects": sum(objects.values()),
        "classes": {
            name: {
                "images": images[i], "instances": objects[i],
                "missing": objects[i] == 0,
                "underrepresented": objects[i] > 0 and (images[i] < 20 or objects[i] < 0.2 * maximum),
            } for i, name in enumerate(CLASSES)
        },
    }


def inspect(manifest_path: Path, inventory_root: Path | None = None):
    manifest_path = manifest_path.resolve()
    config = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict) or config.get("schema_version") != 1 or not isinstance(config.get("sources"), list):
        raise ValueError("Expected schema_version=1 and a sources list")
    threshold = config.get("near_duplicate_hamming", 6)
    if type(threshold) is not int or not 0 <= threshold <= 16:
        raise ValueError("near_duplicate_hamming must be an integer from 0 to 16")
    if type(config.get("seed", 42)) is not int:
        raise ValueError("seed must be an integer")
    errors, warnings, records, seen, ids = [], [], [], set(), set()
    inventory = []
    if not config["sources"]:
        errors.append("No source datasets configured. The demo image is not civic training data.")
    for source in config["sources"]:
        if not isinstance(source, dict):
            errors.append("Each source must be a configuration dictionary")
            continue
        source_id = source.get("id", "<missing>")
        try:
            if source_id in ids:
                raise ValueError("Source IDs must be unique")
            ids.add(source_id)
            root, mapping, grouping, groups = source_config(source, manifest_path.parent)
            if grouping["mode"] == "whole_source":
                warnings.append(f"{source_id}: entire source kept in one group; supply groups.csv for finer splitting")
            for pair in source["pairs"]:
                images_root, labels_root = under(root, pair["images"]), under(root, pair["labels"])
                images = sorted(p for p in images_root.rglob("*") if p.suffix.lower() in EXTENSIONS and p.is_file())
                labels = sorted(p for p in labels_root.rglob("*") if p.suffix.lower() == ".txt" and p.is_file())
                if not images:
                    warnings.append(f"{source_id}: no images in {images_root}")
                image_stems = Counter(p.relative_to(images_root).with_suffix("").as_posix().casefold() for p in images)
                for label in labels:
                    key = label.relative_to(labels_root).with_suffix("").as_posix().casefold()
                    if key not in image_stems:
                        errors.append(f"Missing image for annotation: {label}")
                for image in images:
                    relative = image.relative_to(images_root)
                    label = labels_root / relative.with_suffix(".txt")
                    inventory.append({"image": str(image), "label": str(label), "source": source_id})
                    try:
                        resolved = image.resolve()
                        if not resolved.is_relative_to(root) or not label.resolve().is_relative_to(root):
                            raise ValueError("Image/annotation symlink escapes source root")
                        if resolved in seen:
                            raise ValueError("Image registered more than once in the manifest")
                        seen.add(resolved)
                        if image_stems[relative.with_suffix("").as_posix().casefold()] > 1:
                            raise ValueError("Ambiguous filenames: multiple images share an annotation stem")
                        if not label.is_file():
                            raise ValueError(f"Missing annotation: {label}")
                        width, height, digest, dhash = image_info(image)
                        boxes, issues = parse_labels(label, mapping, source.get("allow_empty_labels", False))
                        if issues:
                            raise ValueError("; ".join(issues))
                        relative_image = image.relative_to(root).as_posix()
                        if grouping["mode"] == "csv":
                            if relative_image not in groups:
                                raise ValueError("Image is missing from grouping CSV")
                            group = "capture:" + groups[relative_image]
                        elif grouping["mode"] == "whole_source":
                            group = "source:" + source_id
                        else:
                            if re.search(r"(?:frame|video|clip)[_-]?\d", image.stem, re.I):
                                raise ValueError("Possible video frame: use grouping CSV or whole_source")
                            group = f"image:{source_id}:{relative_image}"
                        records.append(Record(image, label, source_id, relative_image, boxes, group, digest, dhash, width, height))
                    except (ValueError, OSError, Image.DecompressionBombError) as exc:
                        errors.append(f"{image}: {exc}")
        except (ValueError, OSError, KeyError, TypeError, yaml.YAMLError) as exc:
            errors.append(f"Source {source_id}: {exc}")
    if inventory_root and inventory_root.is_dir():
        registered = {item["image"] for item in inventory}
        for path in sorted(inventory_root.rglob("*")):
            if path.is_file() and path.suffix.lower() in EXTENSIONS and str(path) not in registered:
                inventory.append({"image": str(path), "source": None, "label": None})
    if not records:
        errors.append("No valid labeled images available; preparation cannot proceed")
    pixel_annotations = {}
    for record in records:
        signature = sorted(tuple(round(v, 6) for v in box) for box in record.boxes)
        if record.pixel_hash in pixel_annotations and pixel_annotations[record.pixel_hash] != signature:
            errors.append(f"Conflicting annotations for identical pixels: {record.image}; reconcile original sources manually")
        pixel_annotations[record.pixel_hash] = signature
    report = {
        "manifest": str(manifest_path), "errors": errors, "warnings": warnings,
        "summary": summarize(records), "inventory": inventory,
        "sources": config["sources"],
        "unregistered_images": sum(item["source"] is None for item in inventory),
        "underrepresentation_rule": "Missing if 0 objects; low if <20 images or <20% of largest class instance count",
    }
    return config, records, report


class HashTree:
    """BK-tree indexes 64-bit dHashes without an unconditional all-pairs scan."""
    def __init__(self):
        self.root = None

    def near_and_add(self, value: int, index: int, threshold: int):
        found = []
        if self.root is None:
            self.root = (value, [index], {})
            return found
        pending = [self.root]
        while pending:
            current, indices, children = pending.pop()
            distance = (value ^ current).bit_count()
            if distance <= threshold:
                found.extend(indices)
            pending.extend(child for edge, child in children.items() if distance - threshold <= edge <= distance + threshold)
        node = self.root
        while True:
            current, indices, children = node
            distance = (value ^ current).bit_count()
            if distance == 0:
                # Matching every identical hash to one representative preserves
                # components without quadratic storage for repeated frames.
                break
            if distance not in children:
                children[distance] = (value, [index], {})
                break
            node = children[distance]
        return found


def split_records(records: list[Record], seed: int, threshold: int):
    parents = list(range(len(records)))

    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    def union(a, b):
        parents[find(a)] = find(b)

    groups, exact, tree, links = {}, {}, HashTree(), []
    for i, record in enumerate(records):
        for lookup, key, reason in ((groups, record.group, "capture_group"), (exact, record.pixel_hash, "exact_duplicate")):
            if key in lookup:
                union(i, lookup[key])
                links.append({"a": i, "b": lookup[key], "reason": reason})
            else:
                lookup[key] = i
        for j in tree.near_and_add(record.perceptual_hash, i, threshold):
            union(i, j)
            links.append({"a": i, "b": j, "reason": "perceptual_similarity"})
    components = {}
    for i in range(len(records)):
        components.setdefault(find(i), []).append(i)
    ordered = list(components.values())
    random.Random(seed).shuffle(ordered)
    ordered.sort(key=len, reverse=True)
    counts = [0, 0, 0]
    assignment, component_ids = {}, {}
    targets = [len(records) * ratio for ratio in RATIOS]
    for number, indices in enumerate(ordered):
        # Squared deviation favors 80/10/10 while preserving entire components.
        chosen = min(range(3), key=lambda s: sum((counts[k] + (len(indices) if k == s else 0) - targets[k]) ** 2 for k in range(3)))
        counts[chosen] += len(indices)
        for i in indices:
            assignment[i] = SPLITS[chosen]
            component_ids[i] = f"group_{number:06d}"
    if any(assignment[link["a"]] != assignment[link["b"]] for link in links):
        raise AssertionError("Leakage audit failed")
    return assignment, component_ids, links


def write_report(output: Path, report: dict, records: list[Record], assignment=None):
    (output / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    cards, candidates = [], []
    # Include at least one example per available class, then per split.
    for class_id in range(len(CLASSES)):
        match = next((r for r in records if any(b[0] == class_id for b in r.boxes)), None)
        if match and match not in candidates:
            candidates.append(match)
    if assignment:
        for split in SPLITS:
            match = next((r for i, r in enumerate(records) if assignment[i] == split), None)
            if match and match not in candidates:
                candidates.append(match)
    candidates += [r for r in records if r not in candidates][:max(0, 12 - len(candidates))]
    samples = [(r.image, r.boxes, f"{r.source}/{r.relative_image}") for r in candidates]
    if not samples:
        samples = [(Path(item["image"]), [], "UNREGISTERED / NO VALID ANNOTATIONS: " + Path(item["image"]).name) for item in report["inventory"][:6]]
    for path, boxes, caption in samples:
        try:
            with Image.open(path) as original:
                image = ImageOps.contain(original.convert("RGB"), (640, 420))
            draw = ImageDraw.Draw(image)
            width, height = image.size
            for class_id, x, y, w, h in boxes:
                bounds = ((x - w / 2) * width, (y - h / 2) * height, (x + w / 2) * width, (y + h / 2) * height)
                color = ("#ff7070", "#50e0a0", "#ffd050")[class_id]
                draw.rectangle(bounds, outline=color, width=3)
                draw.text((max(0, bounds[0]), max(0, bounds[1] - 12)), CLASSES[class_id], fill=color, stroke_width=1, stroke_fill="black")
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG")
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
            cards.append(f'<figure><img alt="Annotated dataset sample" src="data:image/jpeg;base64,{encoded}"><figcaption>{html.escape(caption)}</figcaption></figure>')
        except (OSError, ValueError, Image.DecompressionBombError):
            cards.append(f"<p>Unreadable image: {html.escape(str(path))}</p>")
    rows = "".join(f"<tr><td>{html.escape(name)}</td><td>{stats['images']}</td><td>{stats['instances']}</td><td>{'MISSING' if stats['missing'] else 'LOW' if stats['underrepresented'] else 'available'}</td></tr>" for name, stats in report["summary"]["classes"].items())
    issues = "".join(f"<li>{html.escape(message)}</li>" for message in report["errors"] + report["warnings"])
    metadata = html.escape(json.dumps({k: v for k, v in report.items() if k != "inventory"}, indent=2))
    document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Civic dataset report</title>
<style>body{{font:16px system-ui;margin:32px;background:#111827;color:#e5e7eb}}table{{border-collapse:collapse}}td,th{{padding:12px;border:1px solid #64748b}}.gallery{{display:flex;flex-wrap:wrap}}figure{{margin:12px;max-width:640px}}img{{max-width:100%}}figcaption{{overflow-wrap:anywhere}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}a{{color:#93c5fd}}</style>
<h1>Civic dataset report</h1><p>Validated images: {len(records)}. Unregistered/demo images are excluded from class counts.</p>
<table><tr><th>Class</th><th>Images containing class</th><th>Object instances</th><th>Coverage</th></tr>{rows}</table>
<p>Coverage flags are preparation heuristics, not evidence of model accuracy.</p><ul>{issues}</ul>
<h2>Samples and ground-truth boxes</h2><div class="gallery">{''.join(cards)}</div>
<h2>Validation, split statistics and source attribution</h2><pre>{metadata}</pre></html>'''
    (output / "report.html").write_text(document, encoding="utf-8")


def prepare(manifest_path: Path, output: Path):
    config, records, report = inspect(manifest_path)
    if report["errors"]:
        raise ValueError("Source validation failed:\n" + "\n".join(report["errors"]))
    output = output.resolve()
    for source in config["sources"]:
        root = (manifest_path.resolve().parent / source["root"]).resolve()
        if output.is_relative_to(root) or root.is_relative_to(output):
            raise ValueError("Output must be separate from all source directories")
    if output.exists():
        raise ValueError(f"Output already exists; choose a new directory: {output}")
    assignment, component_ids, links = split_records(records, config.get("seed", 42), config.get("near_duplicate_hamming", 6))
    split_summary = {s: summarize([r for i, r in enumerate(records) if assignment[i] == s]) for s in SPLITS}
    for split, stats in split_summary.items():
        if not stats["images"]:
            report["warnings"].append(f"{split} is empty: more independent capture groups are needed")
        elif abs(stats["images"] / len(records) - RATIOS[SPLITS.index(split)]) > 0.05:
            report["warnings"].append(f"{split} differs from target by >5 percentage points to preserve groups")
        missing = [name for name, values in stats["classes"].items() if values["missing"]]
        if missing:
            report["warnings"].append(f"{split}: missing classes: {', '.join(missing)}")
    report.update({
        "splits": split_summary, "seed": config.get("seed", 42),
        "near_duplicate_hamming": config.get("near_duplicate_hamming", 6),
        "capture_components": len(set(component_ids.values())),
        "leakage_links": links, "leakage_audit": "passed for declared groups, exact pixels, and dHash threshold",
        "duplicates_policy": "Retained with attribution, grouped into same split; counts include retained duplicates",
        "ready_for_training": all(s["images"] and all(v["instances"] for v in s["classes"].values()) for s in split_summary.values()),
    })
    output.mkdir(parents=True, exist_ok=False)
    for split in SPLITS:
        (output / "images" / split).mkdir(parents=True)
        (output / "labels" / split).mkdir(parents=True)
    entries = []
    for i, record in enumerate(records):
        split = assignment[i]
        filename = f"{record.source}_{i:08d}{record.image.suffix.lower()}"
        destination = output / "images" / split / filename
        shutil.copy2(record.image, destination)
        label_path = output / "labels" / split / Path(filename).with_suffix(".txt")
        label_path.write_text("".join(f"{c} {x:.10g} {y:.10g} {w:.10g} {h:.10g}\n" for c, x, y, w, h in record.boxes), encoding="utf-8")
        entries.append({
            "image": destination.relative_to(output).as_posix(), "label": label_path.relative_to(output).as_posix(),
            "source_id": record.source, "original_image": record.relative_image,
            "original_label": str(record.label), "split": split, "capture_group": record.group,
            "component": component_ids[i], "pixel_sha256": record.pixel_hash,
            "file_sha256": hashlib.sha256(record.image.read_bytes()).hexdigest(),
            "dhash64": f"{record.perceptual_hash:016x}",
        })
    attribution = output / "attribution"
    attribution.mkdir()
    for source in config["sources"]:
        source_dir = attribution / source["id"]
        source_dir.mkdir()
        (source_dir / "source.json").write_text(json.dumps(source, indent=2), encoding="utf-8")
        root = (manifest_path.resolve().parent / source["root"]).resolve()
        for number, filename in enumerate(source.get("license_files", [])):
            shutil.copy2(under(root, filename), source_dir / f"{number}_{Path(filename).name}")
    (output / "source_manifest.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    (output / "split_manifest.json").write_text(json.dumps(entries, indent=2), encoding="utf-8")
    dataset_yaml = {"path": str(output), "train": "images/train", "val": "images/val", "test": "images/test", "nc": 3, "names": dict(enumerate(CLASSES))}
    (output / "data.yaml").write_text(yaml.safe_dump(dataset_yaml, sort_keys=False), encoding="utf-8")
    write_report(output, report, records, assignment)
    # Written last: an interrupted/failed output must not be treated as complete.
    (output / "PREPARATION_COMPLETE").write_text("Dataset prepared; inspect summary.json ready_for_training before training.\n", encoding="utf-8")
    return report
