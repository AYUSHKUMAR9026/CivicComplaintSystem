"""Lightweight training guards; no test runs gradient updates or creates models."""
import json
import hashlib
import shutil
from types import SimpleNamespace
from zipfile import ZipFile

import pytest
import yaml

from ai_service.config.settings import SAMPLE
from ai_service.scripts.package_colab import package
from ai_service.scripts.train import build_parser, main
from ai_service.training import preflight, runner


@pytest.fixture
def dataset(tmp_path, monkeypatch):
    """Temporary plumbing labels, never civic training data.

    Patch only hash metadata to isolate CLI/preflight tests. A separate test
    reinstates real hashing and verifies that identical photos block training.
    """
    root = tmp_path / "dataset"
    for split in ("train", "val", "test"):
        (root / "images" / split).mkdir(parents=True)
        (root / "labels" / split).mkdir(parents=True)
        shutil.copy2(SAMPLE, root / "images" / split / "fixture.jpg")
        (root / "labels" / split / "fixture.txt").write_text(
            "0 0.2 0.2 0.1 0.1\n1 0.5 0.5 0.1 0.1\n2 0.8 0.8 0.1 0.1\n", encoding="utf-8")
    path = root / "data.yaml"
    data = {"path": ".", "train": "images/train", "val": "images/val", "test": "images/test",
            "nc": 3, "names": ["pothole", "garbage", "overflowing_bin"]}
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    hashes = {"train": 0, "val": (1 << 64) - 1, "test": (1 << 32) - 1}
    monkeypatch.setattr(preflight, "image_info", lambda p: (810, 1080, p.parent.name, hashes[p.parent.name]))
    return path, root, data


def fake_torch(cuda=False, count=1):
    return SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: cuda, device_count=lambda: count))


def test_defaults_and_cpu_safety():
    args = build_parser().parse_args([])
    options = runner.runtime_options(args, fake_torch())
    assert not args.train
    assert options["epochs"] == 50 and options["imgsz"] == 640
    assert options["batch"] == 2 and options["device"] == "cpu"
    assert options["workers"] == 0 and not options["amp"] and not options["cache"]
    assert options["seed"] == 42 and options["deterministic"] and options["val"]
    assert options["save"] and options["save_period"] == 1
    assert runner.runtime_options(args, fake_torch(True))["batch"] == 8


def test_custom_options_and_cuda_fallback():
    args = build_parser().parse_args(["--epochs", "3", "--imgsz", "320", "--batch", "1", "--seed", "9", "--device", "cuda:1"])
    options = runner.runtime_options(args, fake_torch(True, 2))
    assert (options["epochs"], options["imgsz"], options["batch"], options["seed"], options["device"]) == (3, 320, 1, 9, "1")
    assert runner.runtime_options(args, fake_torch(False))["device"] == "cpu"
    with pytest.raises(ValueError, match="unavailable"):
        runner.runtime_options(args, fake_torch(True, 1))


@pytest.mark.parametrize("arguments", [
    ["--epochs", "0"], ["--batch", "-1"], ["--seed", "-1"],
    ["--device", "cuda:bad"], ["--imgsz", "641"], ["--train", "--check"],
])
def test_invalid_cli(arguments):
    with pytest.raises(SystemExit) as exc:
        main(arguments)
    assert exc.value.code == 2


def test_preflight_normalizes_local_paths(dataset):
    path, root, _ = dataset
    normalized, report = preflight.validate_training_data(path)
    assert normalized["train"] == str(root / "images/train")
    assert "download" not in normalized
    assert report["summary"]["images"] == 3
    assert report["summary"]["objects"] == 9
    assert any("No split manifest" in text for text in report["warnings"])


@pytest.mark.parametrize("change, message", [
    (lambda d: d.update(names=["garbage", "pothole", "overflowing_bin"]), "names must"),
    (lambda d: d.update(nc=80), "nc must"),
    (lambda d: d.update(download="https://example.invalid/other.zip"), "download field"),
    (lambda d: d.update(val="https://example.invalid/images"), "not URLs"),
])
def test_yaml_guards(dataset, change, message):
    path, _, data = dataset
    change(data)
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        preflight.validate_training_data(path)


def test_missing_labels_and_class_coverage(dataset):
    path, root, _ = dataset
    (root / "labels/train/fixture.txt").unlink()
    with pytest.raises(ValueError, match="Missing or out-of-root annotation"):
        preflight.validate_training_data(path)
    (root / "labels/train/fixture.txt").write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")
    with pytest.raises(ValueError, match="train is missing object classes"):
        preflight.validate_training_data(path)


def test_real_duplicate_images_block_training(dataset, monkeypatch):
    from ai_service.dataset_tools.pipeline import image_info

    monkeypatch.setattr(preflight, "image_info", image_info)
    with pytest.raises(ValueError, match="Split leakage"):
        preflight.validate_training_data(dataset[0])


def test_fingerprint_changes_with_labels(dataset):
    path, root, _ = dataset
    first = preflight.validate_training_data(path)[1]["fingerprint"]
    label = root / "labels/train/fixture.txt"
    label.write_text(label.read_text().replace("0.2 0.2", "0.25 0.25"), encoding="utf-8")
    assert preflight.validate_training_data(path)[1]["fingerprint"] != first


def test_invalid_dataset_cannot_start_training(tmp_path, monkeypatch):
    called = []
    monkeypatch.setattr(runner, "runtime_options", lambda *a: called.append(True))
    with pytest.raises(SystemExit) as exc:
        main(["--train", "--data", str(tmp_path / "absent.yaml")])
    assert exc.value.code == 2 and not called


def test_check_only_creates_no_run_or_model(dataset, tmp_path, monkeypatch, capsys):
    # No fake weights are loaded. Preflight checks only the presence of a local file.
    output = tmp_path / "run"
    called = []
    original_options = runner.runtime_options
    monkeypatch.setattr(runner, "runtime_options", lambda args, torch, saved: original_options(args, fake_torch(), saved))
    import ultralytics

    monkeypatch.setattr(ultralytics, "YOLO", lambda *a, **k: called.append(True))
    from ai_service.config.settings import WEIGHTS

    main(["--check", "--data", str(dataset[0]), "--weights", str(WEIGHTS), "--output", str(output)])
    assert not output.exists() and not called
    assert "No training started" in capsys.readouterr().out


def test_resume_preserves_epoch_target_and_seed():
    args = build_parser().parse_args([])
    saved = {"epochs": 80, "imgsz": 320, "seed": 7, "batch": 4}
    options = runner.runtime_options(args, fake_torch(True), saved)
    assert (options["epochs"], options["imgsz"], options["seed"], options["batch"]) == (80, 320, 7, 4)
    args.epochs = 50
    with pytest.raises(ValueError, match="preserves original epochs"):
        runner.runtime_options(args, fake_torch(True), saved)


def test_resume_policy_overrides_stale_paths_but_not_optimizer():
    namespace = SimpleNamespace(data="old/data.yaml", save_dir="old/run", optimizer="SGD")
    runner.apply_resume_policy(namespace, {"data": "new/data.yaml", "save_dir": "new/run", "workers": 0, "amp": False})
    assert namespace.data == "new/data.yaml" and namespace.save_dir == "new/run"
    assert namespace.optimizer == "SGD" and namespace.workers == 0 and not namespace.amp


def test_resume_rejects_changed_dataset_before_model_load(dataset, tmp_path):
    output = tmp_path / "run"
    (output / "weights").mkdir(parents=True)
    (output / "weights/last.pt").touch()  # Never loaded: the fingerprint must fail first.
    (output / "run.json").write_text(json.dumps({"dataset_fingerprint": "different"}), encoding="utf-8")
    with pytest.raises(SystemExit) as exc:
        main(["--train", "--data", str(dataset[0]), "--resume", str(output / "weights/last.pt")])
    assert exc.value.code == 2
    assert not (output / "training_data.yaml").exists()


def test_colab_package_contains_only_code(tmp_path):
    output = tmp_path / "code.zip"
    assert package(output) > 5
    with ZipFile(output) as archive:
        names = archive.namelist()
    assert "ai_service/scripts/train.py" in names
    assert not any(".venv" in name or "/datasets/" in name or name.endswith(".pt") or ".env" in name for name in names)
    with pytest.raises(FileExistsError):
        package(output)


def test_installed_training_api_and_configuration():
    from ultralytics.cfg import get_cfg

    model_type, trainer_type, logger, settings, version = runner.backend_dependencies()
    assert callable(model_type) and callable(trainer_type)
    assert hasattr(logger, "addHandler") and "sync" in settings and version
    options = runner.runtime_options(build_parser().parse_args([]), fake_torch())
    config = get_cfg(overrides=options)
    assert config.val and config.save and config.imgsz == 640 and config.epochs == 50


def prepared_metadata(root):
    entries = []
    for split in ("train", "val", "test"):
        image = root / f"images/{split}/fixture.jpg"
        entries.append({"image": f"images/{split}/fixture.jpg", "label": f"labels/{split}/fixture.txt",
                        "split": split, "component": split, "capture_group": split,
                        "file_sha256": hashlib.sha256(image.read_bytes()).hexdigest(), "pixel_sha256": split})
    (root / "split_manifest.json").write_text(json.dumps(entries), encoding="utf-8")
    (root / "PREPARATION_COMPLETE").touch()
    return entries


def test_prepared_dataset_integrity(dataset):
    path, root, _ = dataset
    entries = prepared_metadata(root)
    assert not preflight.validate_training_data(path)[1]["errors"]
    entries[0]["file_sha256"] = "modified"
    (root / "split_manifest.json").write_text(json.dumps(entries), encoding="utf-8")
    with pytest.raises(ValueError, match="contents changed"):
        preflight.validate_training_data(path)


def test_prepared_capture_groups_cannot_cross_splits(dataset):
    path, root, _ = dataset
    entries = prepared_metadata(root)
    entries[0]["capture_group"] = entries[1]["capture_group"]
    (root / "split_manifest.json").write_text(json.dumps(entries), encoding="utf-8")
    with pytest.raises(ValueError, match="capture group crosses"):
        preflight.validate_training_data(path)
