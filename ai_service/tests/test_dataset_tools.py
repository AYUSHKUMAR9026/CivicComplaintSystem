"""Temporary parser/pipeline fixtures, never added to the real training dataset."""
import json
import shutil
from pathlib import Path

import pytest
import yaml
from PIL import Image

from ai_service.dataset_tools.pipeline import (
    CLASSES, Record, image_info, inspect, parse_labels, prepare, split_records,
)

SAMPLE = Path(__file__).resolve().parents[1] / "datasets/samples/bus.jpg"


@pytest.fixture
def source(tmp_path):
    """Use the existing demo solely to test plumbing, with temporary test labels."""
    root = tmp_path / "source"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    shutil.copy2(SAMPLE, root / "images/example.jpg")
    (root / "labels/example.txt").write_text("7 0.5 0.5 0.2 0.2\n", encoding="utf-8")
    (root / "LICENSE.txt").write_text("Unit test fixture; not licensed for training", encoding="utf-8")
    (root / "data.yaml").write_text("names:\n  7: source_pothole\nnc: 1\n", encoding="utf-8")
    config = {
        "schema_version": 1, "seed": 42, "near_duplicate_hamming": 6,
        "sources": [{
            "id": "fixture", "root": "source", "name": "Unit test fixture",
            "url": "https://example.invalid/test-only", "license": "test-only",
            "license_url": "https://example.invalid/license", "attribution": "Temporary test only",
            "license_files": ["LICENSE.txt"], "data_yaml": "data.yaml",
            "class_names": {"7": "source_pothole"}, "class_map": {"7": "pothole"},
            "pairs": [{"images": "images", "labels": "labels"}],
            "grouping": {"mode": "whole_source"},
        }],
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    return path, root, config


@pytest.mark.parametrize("text, message", [
    ("0 0.5 0.5 0.2", "5 fields"),
    ("0.0 0.5 0.5 0.2 0.2", "integer_class_id"),
    ("8 0.5 0.5 0.2 0.2", "Unmapped"),
    ("0 nan 0.5 0.2 0.2", "finite"),
    ("0 0.5 0.5 0 0.2", "positive"),
    ("0 0.01 0.5 0.2 0.2", "outside"),
    ("0 12 12 5 5", "normalized"),
    ("", "verified negative"),
    ("0 0.5 0.5 0.2 0.2\n0 0.5 0.5 0.2 0.2", "Duplicate"),
])
def test_bad_labels(tmp_path, text, message):
    label = tmp_path / "test.txt"
    label.write_text(text, encoding="utf-8")
    _, errors = parse_labels(label, {"0": "garbage"}, False)
    assert any(message in error for error in errors)


def test_explicit_remap_and_verified_empty(tmp_path):
    label = tmp_path / "test.txt"
    label.write_text("9 0.5 0.5 0.2 0.2", encoding="utf-8")
    boxes, errors = parse_labels(label, {"9": "overflowing_bin"}, False)
    assert not errors and boxes[0][0] == 2
    label.write_text("", encoding="utf-8")
    assert parse_labels(label, {"9": "overflowing_bin"}, True) == ([], [])


def test_missing_image_and_annotation(source):
    manifest, root, _ = source
    (root / "labels/example.txt").unlink()
    (root / "labels/orphan.txt").write_text("7 0.5 0.5 0.2 0.2", encoding="utf-8")
    _, records, report = inspect(manifest)
    assert not records
    assert any("Missing annotation" in e for e in report["errors"])
    assert any("Missing image" in e for e in report["errors"])


@pytest.mark.parametrize("change, message", [
    (lambda s: s.update(class_map={"0": "pothole"}), "Map every"),
    (lambda s: s.update(class_names={"7": "wrong_name"}), "do not match"),
    (lambda s: s.update(license=""), "license"),
    (lambda s: s.update(license="unknown"), "license"),
    (lambda s: s.update(pairs=[{"images": "../outside", "labels": "labels"}]), "escapes"),
])
def test_source_metadata_guards(source, change, message):
    manifest, _, config = source
    change(config["sources"][0])
    manifest.write_text(json.dumps(config), encoding="utf-8")
    _, _, report = inspect(manifest)
    assert any(message in e for e in report["errors"])


def test_video_grouping_and_csv(source):
    manifest, root, config = source
    (root / "images/example.jpg").rename(root / "images/frame_001.jpg")
    (root / "labels/example.txt").rename(root / "labels/frame_001.txt")
    config["sources"][0]["grouping"] = {"mode": "independent_images"}
    manifest.write_text(json.dumps(config), encoding="utf-8")
    assert any("Possible video" in e for e in inspect(manifest)[2]["errors"])
    (root / "groups.csv").write_text("image,group\nimages/frame_001.jpg,city_drive_01\n", encoding="utf-8")
    config["sources"][0]["grouping"] = {"mode": "csv", "file": "groups.csv"}
    manifest.write_text(json.dumps(config), encoding="utf-8")
    _, records, report = inspect(manifest)
    assert not report["errors"]
    assert records[0].group == "capture:city_drive_01"


def record(i, *, group=None, digest=None, dhash=None):
    return Record(Path(f"fixture_{i}.jpg"), Path(f"fixture_{i}.txt"), "test", str(i),
                  [(i % 3, .5, .5, .2, .2)], group or f"independent:{i}",
                  digest or str(i), i if dhash is None else dhash, 100, 100)


def test_ratio_and_determinism():
    records = [record(i, dhash=i) for i in range(100)]
    assignment, _, links = split_records(records, 42, 0)
    assert [sum(s == split for s in assignment.values()) for split in ("train", "val", "test")] == [80, 10, 10]
    assert not links
    assert assignment == split_records(records, 42, 0)[0]


def test_transitive_near_duplicates_and_video_never_leak():
    # 0 -> 1 -> 3 are a transitive dHash chain at radius 1; 3/255 share a video.
    records = [record(0, dhash=0), record(1, dhash=1),
               record(2, dhash=3, group="video:A"), record(3, dhash=255, group="video:A"),
               record(4, dhash=(1 << 63), digest="0")]
    assignment, components, links = split_records(records, 42, 1)
    assert len(set(components.values())) == 1
    assert len(set(assignment.values())) == 1
    assert {link["reason"] for link in links} == {"exact_duplicate", "perceptual_similarity", "capture_group"}


def test_real_image_hash_and_no_overwrite(source, tmp_path):
    manifest, root, _ = source
    original = (root / "labels/example.txt").read_bytes()
    assert image_info(root / "images/example.jpg")[2:] == image_info(SAMPLE)[2:]
    output = tmp_path / "prepared"
    report = prepare(manifest, output)
    assert report["summary"]["classes"]["pothole"]["instances"] == 1
    assert not report["ready_for_training"]
    assert report["leakage_audit"].startswith("passed")
    data = yaml.safe_load((output / "data.yaml").read_text())
    assert list(data["names"].values()) == list(CLASSES)
    assert next((output / "labels/train").glob("*.txt")).read_text().startswith("0 ")
    assert (output / "attribution/fixture/0_LICENSE.txt").read_bytes() == (root / "LICENSE.txt").read_bytes()
    assert (output / "PREPARATION_COMPLETE").exists()
    assert "data:image/jpeg;base64," in (output / "report.html").read_text()
    assert (root / "labels/example.txt").read_bytes() == original
    with pytest.raises(ValueError, match="already exists"):
        prepare(manifest, output)
    with pytest.raises(ValueError, match="separate"):
        prepare(manifest, root / "bad_output")


def test_conflicting_identical_images_block_merge(source):
    manifest, root, _ = source
    shutil.copy2(root / "images/example.jpg", root / "images/conflict.jpg")
    (root / "labels/conflict.txt").write_text("7 0.4 0.4 0.2 0.2", encoding="utf-8")
    assert any("Conflicting annotations" in e for e in inspect(manifest)[2]["errors"])


def test_empty_manifest_blocks_preparation(tmp_path):
    manifest = tmp_path / "empty.json"
    manifest.write_text('{"schema_version":1,"sources":[]}', encoding="utf-8")
    _, records, report = inspect(manifest)
    assert records == []
    assert all(stats["missing"] for stats in report["summary"]["classes"].values())
    with pytest.raises(ValueError, match="No source datasets"):
        prepare(manifest, tmp_path / "output")
    assert not (tmp_path / "output").exists()


def test_different_sources_same_id_different_meaning(source, tmp_path):
    manifest, root, config = source
    other = tmp_path / "other"
    (other / "images").mkdir(parents=True)
    (other / "labels").mkdir()
    # A genuine crop of the existing demo, used only in temporary plumbing tests.
    with Image.open(SAMPLE) as image:
        image.crop((100, 100, 700, 900)).save(other / "images/crop.png")
    (other / "labels/crop.txt").write_text("7 0.5 0.5 0.2 0.2", encoding="utf-8")
    second = dict(config["sources"][0])
    second.update(id="other", root="other", name="Other test source", data_yaml=None,
                  class_names={"7": "source_garbage"}, class_map={"7": "garbage"}, license_files=[])
    config["sources"].append(second)
    manifest.write_text(json.dumps(config), encoding="utf-8")
    output = tmp_path / "combined"
    report = prepare(manifest, output)
    assert report["summary"]["images"] == 2
    assert report["summary"]["classes"]["pothole"]["instances"] == 1
    assert report["summary"]["classes"]["garbage"]["instances"] == 1
    labels = list((output / "labels").rglob("*.txt"))
    assert {label.read_text().split()[0] for label in labels} == {"0", "1"}


def test_real_near_duplicate_hashes(tmp_path):
    # Re-encoding/resizing a real demo is a test fixture, not new training data.
    path = tmp_path / "resized.png"
    with Image.open(SAMPLE) as image:
        image.resize((405, 540), Image.Resampling.LANCZOS).save(path)
    _, _, original_pixel, original_hash = image_info(SAMPLE)
    _, _, resized_pixel, resized_hash = image_info(path)
    assert original_pixel != resized_pixel
    assert (original_hash ^ resized_hash).bit_count() <= 6


def test_bad_image_and_ambiguous_stem(source):
    manifest, root, _ = source
    (root / "images/broken.jpg").write_bytes(b"not an image")
    (root / "labels/broken.txt").write_text("7 0.5 0.5 0.2 0.2", encoding="utf-8")
    with Image.open(SAMPLE) as image:
        image.save(root / "images/example.png")
    report = inspect(manifest)[2]
    assert any("cannot identify image" in e for e in report["errors"])
    assert any("Ambiguous filenames" in e for e in report["errors"])


def test_csv_requires_every_image(source):
    manifest, root, config = source
    (root / "groups.csv").write_text("image,group\n", encoding="utf-8")
    config["sources"][0]["grouping"] = {"mode": "csv", "file": "groups.csv"}
    manifest.write_text(json.dumps(config), encoding="utf-8")
    assert any("missing from grouping CSV" in e for e in inspect(manifest)[2]["errors"])
