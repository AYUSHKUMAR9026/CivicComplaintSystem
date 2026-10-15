# Custom YOLO11 street issue training

This pipeline fine-tunes the **local pretrained `yolo11n.pt`** for exactly
`0: pothole`, `1: garbage`, `2: overflowing_bin`. Ultralytics replaces the COCO
detection head for these classes. No civic accuracy is claimed before training
and evaluation. The website/backend and existing inference model are unchanged.

Currently no labeled civic dataset exists in this repository, so preflight must
fail until real data is added. Follow [DATASETS.md](../DATASETS.md) first. Preserve
original labels, source/license attribution, capture groups and split manifests.
Inspect sample boxes and coverage before considering training.

## Windows PowerShell

Run from the **repository root** using the existing Python 3.11 environment:

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.train --help
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.train --data ai_service/datasets/prepared/data.yaml --check
```

The default mode is **preflight only**, even if you provide epoch settings or a
resume checkpoint. No model is loaded and no run directory is created by checks.
Only **when you decide to start training**, add `--train`:

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.train --train --data ai_service/datasets/prepared/data.yaml --epochs 50 --imgsz 640 --batch 8 --device auto --seed 42 --output ai_service/runs/street-issues-yolo11n-run01
```

| Argument | Default/behavior |
| --- | --- |
| `--data` | `ai_service/config/data.yaml`, pointing to the default prepared dataset |
| `--weights` | Local `ai_service/weights/yolo11n.pt` |
| `--epochs` | 50 total epochs, early stopping disabled |
| `--imgsz` | 640; adjust in multiples of 32 |
| `--batch` | 8 on CUDA; capped at 2 on CPU |
| `--device` | `auto`: CUDA device 0 when available, otherwise CPU |
| `--seed` | 42 |
| `--output` | New timestamped `ai_service/runs/street-issues-yolo11n-.../` directory |

Other device values are `cpu`, `cuda`, `0`, or `cuda:0`. Without CUDA, even an
explicit CUDA request visibly falls back to CPU. An invalid available GPU index
is an error. Multiple-GPU/distributed training is outside this initial pipeline.

Workers are zero for Windows compatibility, CPU threads are capped at 4, and
AMP/RAM caching are disabled. Full precision also avoids AMP probes downloading
ancillary models. These settings favor stability over speed. CPU training may
be very slow; for a smaller explicitly initiated run:

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.train --train --data ai_service/datasets/prepared/data.yaml --device cpu --batch 1 --imgsz 320 --epochs 5 --output ai_service/runs/street-issues-cpu-small
```

For GPU memory errors, try batch 4, 2, or 1 with a new output path, or resume a
saved interrupted run with a smaller batch. Hardware errors remain visible.
Existing outputs are never overwritten for a fresh run.

Python, NumPy, PyTorch and Ultralytics use the recorded seed with
`deterministic=True`. Versions, effective settings, initial-weight SHA-256 and
dataset content fingerprints are recorded. Reusing a seed improves reproducibility
but does not guarantee bit-identical results across hardware/library versions or
interrupted execution.

## Mandatory preflight and validation

Every training/resume invocation rechecks the dataset before model loading:

- Exact class names and IDs, local split paths, nonempty train/validation splits
  with all three classes, and the test split's integrity when it is specified.
- Readable images, missing/orphan annotations, malformed/duplicate YOLO boxes,
  invalid IDs/coordinates, annotation conflicts for identical pixels, and stems.
- Original prepared image hashes and complete split-manifest coverage when
  supplied, plus capture/component groups and exact/perceptual links crossing
  split boundaries. Without preparation metadata, capture history cannot be
  verified and a warning is emitted. Hashing can miss some crops/angles; retain
  genuine capture metadata and inspect your dataset preparation report.
- Local weight existence, safe output separation, and unchanged image/label/
  split/group fingerprints before resuming.

Directory or list-of-directory split entries are supported, using paired
`images/` and `labels/` folders in either standard layout. Relative YAML `path`
values resolve from the YAML directory. URL, ZIP and image-list split entries
are not accepted. YAML `download` instructions are rejected. Runtime training
uses a normalized local YAML without download instructions. No missing dataset
is automatically downloaded or substituted.

Missing labels always fail. Empty `.txt` labels require `--allow-empty-labels`
for **verified negatives**, on every check/train/resume command where needed.
Do not generate empty labels merely to pass validation. Missing initial weights
also fail; use the existing `python -m ai_service.scripts.download_assets`
command explicitly first if `yolo11n.pt` is absent.

Validation runs on the **validation split each epoch**, and Ultralytics validates
`best.pt` at completion. Test images are checked for integrity/leakage but are
not used for optimization, model selection, or repeated tuning. Keep them for
a later final evaluation. Low-coverage warnings are not accuracy estimates.

## Output files

After real training saves them, the named run directory contains:

```text
run.json                      # original options, versions, weight/data hashes
training_data.yaml            # normalized local paths
preflight-<timestamp>.json     # integrity/coverage checks per invocation
status.json                   # running/completed/interrupted/failed
training.log                  # Ultralytics logs
console.log                   # stdout/stderr; appended on resume
args.yaml                     # effective Ultralytics settings
results.csv                   # epoch losses and validation metrics
results.png                   # training curves
validation_metrics.json       # final best-model validation metrics
weights/best.pt               # selected using validation data
weights/last.pt               # latest completed epoch
weights/epoch*.pt             # periodic snapshots
...                           # sample, label and validation plots
```

Checkpoint saving every epoch uses more disk space but improves recovery.
Before the first completed epoch there may be no checkpoint. A killed process
may leave stale status; inspect checkpoints and logs. No weights/metrics are
fabricated when a run fails. Default outputs under `runs/` are ignored by Git.

## Resume an interrupted run

Keep the **whole run folder**, including `run.json` and `weights/last.pt`, with
the same dataset image/label/split/group content:

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.train --check --data ai_service/datasets/prepared/data.yaml --resume ai_service/runs/street-issues-yolo11n-run01/weights/last.pt
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.train --train --data ai_service/datasets/prepared/data.yaml --resume ai_service/runs/street-issues-yolo11n-run01/weights/last.pt --batch 2 --device auto
```

Resume preserves original **total** epochs, image size and seed: finishing a
50-epoch run does not add 50 more epochs. Different values for these arguments
are rejected. Ultralytics restores checkpoint optimizer/scheduler state. Batch
and hardware can change. A small trainer adapter reapplies validated local
data/output paths after Ultralytics restores its original checkpoint arguments.

You can copy a full run and identical prepared dataset to another machine;
update the dataset YAML's `path` to its new root. Fingerprints use content and
relative paths rather than machine-specific roots. Moving files within the
dataset or changing labels requires a new run.

A finalized `last.pt` is optimizer-stripped by Ultralytics and cannot resume;
`best.pt` is also not a resume checkpoint. To start a new fine-tuning run from
a finished model, use `--weights path/to/best.pt --train` with a new output.
Only load trusted checkpoints: PyTorch weight files contain serialized objects.

## Google Colab GPU workflow

Use [colab_train.ipynb](colab_train.ipynb). No local CUDA installation is needed;
GPU availability and session duration depend on your Colab runtime.

1. Prepare and inspect genuine data locally. Package training **source only**:

   ```powershell
   ai_service/.venv/Scripts/python.exe -m ai_service.scripts.package_colab
   ```

   This creates `ai_service/runs/colab-training-code.zip`, excluding environments,
   images, weights and `.env` files. Existing ZIPs are not overwritten. For an
   updated package use `--output ai_service/runs/colab-training-code-v2.zip`, then
   rename/upload that file as `colab-training-code.zip`.
2. ZIP the **contents** of the prepared directory (no outer `prepared/` folder):

   ```powershell
   Compress-Archive -Path ai_service/datasets/prepared/* -DestinationPath ai_service/runs/dataset.zip
   ```

   Include `data.yaml`, `images/`, `labels/`, all preparation manifests,
   `PREPARATION_COMPLETE`, and attribution/license files.
3. Create `MyDrive/street-issues/` in Google Drive. Upload
   `colab-training-code.zip`, `dataset.zip`, and your local `weights/yolo11n.pt`
   into it. Do not upload virtual environments, private configuration or API
   keys. Uploading images transfers them to Google; use authorized data.
4. Open the notebook in Colab with **File → Upload notebook**. Choose a GPU
   under **Runtime → Change runtime type** (menu wording may vary).
5. Run setup/install cells and mount Drive. Extraction rejects archive path
   traversal and symlinks, and uses new local directories. Resolve package
   conflicts in a fresh runtime before proceeding if installation/checks fail.
6. Run the relocation/preflight cell. It updates only the uploaded YAML's root
   to `/content/street_dataset`, preserving image labels and split manifests.
   Inspect CUDA availability, class coverage and validation warnings.
7. Choose a unique `RUN_NAME`. Change `START_TRAINING=False` to `True` and run
   that cell **when you intend to start the long run**. Keep resume disabled
   for a new run. Avoid Run all after enabling training.
8. Outputs are written to Drive at `street-issues/runs/<RUN_NAME>/`, preserving
   completed-epoch checkpoints across runtime loss. Drive writing can be slower.
9. After training, set `DOWNLOAD_BEST=True` in the download cell, or download
   `weights/best.pt` directly from Drive. Keep the full run for logs and metrics.
   Copy the resulting model to a distinct local filename, for example
   `ai_service/weights/street_issues_best.pt`. Website deployment is separate.

To resume after reconnecting, repeat setup/install/preflight with the same data
and `RUN_NAME`, skip new training, and enable **only** the resume cell. If setup
already ran in the current runtime, skip extraction instead of overwriting it.
The original epoch target comes from `run.json`. Work since the last saved
epoch is lost on interruption. This notebook makes no Roboflow calls and uses
no API key; it never downloads an unrelated benchmark dataset.

## Lightweight verification

```powershell
ai_service/.venv/Scripts/python.exe -m pytest ai_service/tests/test_training.py -q
```

Tests check arguments, safe CPU/CUDA settings, dataset guards, leakage,
fingerprints, resume policy, packaging and check-only behavior. Test fixtures
contain temporary plumbing labels and patched hashes; a separate check uses
real image hashing to reject cross-split duplicates. They are never production
training data. No test runs gradient updates or invents trained weights/metrics.

Actual optimization, CUDA training, interrupted optimizer restoration and hosted
Colab execution require real data and explicit initiation. They have not been
verified by these lightweight tests. Training is intentionally not started here.
