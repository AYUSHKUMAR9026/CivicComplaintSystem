# Prepare the three-class street issue dataset

This stage validates, combines and splits **existing human-labeled images**. It
does not train, download a civic dataset, generate images, infer missing labels,
or modify the website/backend. The canonical classes are fixed:

| ID | Meaning |
| --- | --- |
| 0 | `pothole` |
| 1 | `garbage` (street litter or waste piles, according to your annotation policy) |
| 2 | `overflowing_bin` (a bin with visible overflowing waste) |

Define consistent annotation boundaries before combining sources. An ordinary
bin, a generic road defect, or every object called `trash` is not automatically
one of these targets. Explicit mapping records your decision; software cannot
verify that two source class names have the same visual meaning. Do not combine
partially labeled sources as if every target class had been exhaustively labeled.

## Current data inventory

The inspected repository contains `datasets/samples/bus.jpg` from the YOLO11
installation demo and no civic training annotations or source class definitions.
`datasets/raw/` is empty apart from its directory placeholder. The bus photo is
not registered as a source and is excluded from training and all class counts.
Currently all three classes have **0 labeled images and 0 objects**.

The actual configuration, `config/dataset_sources.json`, intentionally has an
empty `sources` list. Validation reports that data is missing and exits with code
2; preparation refuses to produce a fake combined dataset. The visual report
shows the existing demo as unregistered, with no invented boxes.

## 1. Place real downloaded datasets

Use a distinct directory for each original dataset/version:

```text
ai_service/datasets/raw/
  my_pothole_source/
    data.yaml
    LICENSE.txt
    README.roboflow.txt       # if supplied by the publisher
    train/images/*.jpg
    train/labels/*.txt
    valid/images/*.jpg
    valid/labels/*.txt
    test/images/*.jpg
    test/labels/*.txt
  my_garbage_source/
    ...
  my_overflowing_bin_source/
    ...
```

`images/train` and `labels/train` layouts also work: configure those directory
pairs explicitly. Nested directories within each pair are supported. Image and
label paths must match relative to their paired roots, with `.txt` replacing the
image extension. Keep the original `data.yaml`, attribution, license documents,
download/version URL and capture metadata. Original directories are read only
inputs to the tools; output uses a separate directory.

YOLO detection labels have one object per line:

```text
source_class_id x_center y_center width height
```

Coordinates are normalized to 0..1 relative to the full image. Width and height
must be positive and all box corners must lie inside the image (a 1e-6 rounding
tolerance is allowed). Segmentation polygons, pixel coordinates, COCO JSON and
Pascal VOC XML are not accepted by these scripts; export/convert to YOLO
**detection** format using the original source tool first. Existing source IDs
can be sparse; output IDs are always the canonical 0, 1 and 2 above.

## 2. Register each source and map its own IDs

Copy the structure in `config/dataset_sources.example.json` into
`config/dataset_sources.json` and replace every source placeholder. The example
is illustrative, not metadata for any downloaded dataset. Do not use the
example's class names/IDs without checking your actual source definitions.

Each source requires:

- A unique `id`, dataset title, original URL/version, license terms/identifier,
  license URL, and attribution text. Unknown or placeholder metadata blocks import.
- `root`, relative to the **manifest's directory**, or an absolute source path.
- `class_names`, the original numeric-ID-to-name dictionary. If `data_yaml` is
  set, its `names` must match exactly. Keep it set when upstream YAML is available.
- `class_map`, explicitly mapping **every declared source ID** to a canonical
  class name. There is no fallback to shared numeric IDs or guessed synonyms.
- `pairs`, listing each source's image/label directory pairs. Include all
  original splits you intend to re-split. Delete nonexistent pairs from the
  configuration rather than making placeholder data.
- `license_files`, listing actual license and attribution files relative to
  `root`; their original bytes will be copied into the output attribution folder.
- A capture grouping policy, described below.

For example, a pothole-only source could have:

```json
"class_names": {"4": "potholes"},
"class_map": {"4": "pothole"}
```

Another source might use `4` for garbage and must explicitly map it to `garbage`.
Neither ID nor spelling similarity establishes compatibility. Sources with
unrelated classes are rejected until you create a separately reviewed compatible
subset with correct metadata. There is no silent dropping of class labels.

Missing `.txt` labels are always errors. Empty `.txt` files are rejected unless
you explicitly set `allow_empty_labels: true` for a source with **verified
negative images**. The tool never treats an unlabeled photo as a negative.
Do not create empty labels merely to make validation pass.

License metadata is preserved, not legally evaluated. Confirm the source license
permits your intended use and combination; do not replace the original license
with the application's license. Include publisher attribution/readme files in
`license_files` too. Image exports are ignored by Git; keep backed-up source and
prepared copies in your approved dataset storage.

## 3. Prevent related captures from crossing splits

Choose one policy per source:

**Unknown capture history (safe default):**

```json
"grouping": {"mode": "whole_source"}
```

Every image in that source stays together. Small numbers of sources may then
produce empty validation/test splits. The tools warn instead of breaking a
capture group to meet percentages. A full split needs enough independent groups.

**Video frames, same road drive, repeated location/session, or augmentations:**

```json
"grouping": {"mode": "csv", "file": "groups.csv"}
```

Create the CSV in that source directory with exactly these headers:

```csv
image,group
train/images/frame_0001.jpg,cityA_drive_2026_01
train/images/frame_0100.jpg,cityA_drive_2026_01
valid/images/frame_0200.jpg,cityA_drive_2026_01
test/images/separate_drive.jpg,cityB_drive_2026_02
```

Use image paths relative to the **source root**, including the original split.
Every registered image must appear exactly once. Group IDs are **global across
sources**: copies from the same drive/video in two downloads must use the same
group ID. Include all closely related frames in one group, even if timestamps
are far apart or they originally came from different splits. Group original
images and augmentations together. The tools never guess capture independence
from frame spacing.

**Confirmed unrelated still photos:**

```json
"grouping": {"mode": "independent_images"}
```

Use this only after reviewing capture history. Obvious `frame_123`, `video123`
or `clip123` filenames are rejected in this mode, but filenames cannot prove
independence. If uncertain, use the whole-source policy or supply capture groups.

Across **all sources**, the splitter joins these into indivisible components:

- Declared capture groups.
- Exact SHA-256 hashes of decoded RGB pixels, including dimensions (catches
  exact image content across file formats).
- 64-bit perceptual difference hashes within `near_duplicate_hamming` bits
  (default 6), indexed with a BK-tree.

Joining is transitive: if A resembles B and B resembles C, all three stay in the
same split. Duplicate images are **retained with their own attribution**, not
silently discarded; summary counts include these retained copies. Identical
pixels with conflicting remapped annotations block preparation for manual review.

Perceptual hashing is conservative but imperfect: it can group unrelated simple
images and miss heavy crops, mirrored views, overlays or changed camera angles.
The software guarantees separation for the declared groups and hash matches it
finds; correct capture metadata and manual similarity review are needed for
other relationships. Supply groups instead of relying on hashing for video.
The recorded links and component IDs support auditing and correcting the grouping.

## 4. Validate, combine and split

From the **repository root**, using the existing Python 3.11 environment:

```powershell
# Dependencies already exist in the initial environment; requirements now declare
# Pillow and PyYAML directly as well.
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.validate_dataset
```

The validator writes a timestamped `ai_service/runs/dataset-validation-.../`
directory with `summary.json` and a self-contained `report.html`. Open the HTML
file locally. It checks unreadable/rotated images, missing image/annotation pairs,
ambiguous stems, malformed lines, non-finite or unnormalized coordinates, invalid
corners, duplicate boxes, undeclared/unmapped IDs, source YAML disagreement,
license metadata and grouping coverage. Invalid inputs stop preparation.

Fix errors in a reviewed copy of the original dataset, then run:

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.prepare_dataset
```

Optional paths:

```powershell
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.validate_dataset --manifest ai_service/config/dataset_sources.json --output ai_service/runs/my-validation
ai_service/.venv/Scripts/python.exe -m ai_service.scripts.prepare_dataset --manifest ai_service/config/dataset_sources.json --output ai_service/datasets/prepared-v2
```

Outputs must be new directories; existing output and source files are never
overwritten. If a run fails after creating its output directory, it has no
`PREPARATION_COMPLETE` marker: inspect it and choose a new output directory for
the next attempt. The manifest seed defaults to 42. Whole components are assigned
deterministically toward an approximately **80/10/10 image-count split**; large
groups take precedence over exact percentages. This re-splits original source
train/valid/test data. If the publisher requires retaining an official test set,
do not include that set in a re-split manifest; arrange a separate evaluation set.

No class balance is guaranteed by group allocation. Read each split's class
counts and coverage warnings before training; add independent captures and
review group definitions if validation/test lack a class. Do not dissolve real
capture groups simply to improve the ratio or balance.

## 5. Review generated outputs

```text
ai_service/datasets/prepared/
  images/train/  images/val/  images/test/
  labels/train/  labels/val/  labels/test/
  data.yaml
  report.html
  summary.json
  source_manifest.json
  split_manifest.json
  attribution/<source_id>/source.json
  attribution/<source_id>/<original-license-files>
  PREPARATION_COMPLETE
```

The generated `data.yaml` uses an absolute dataset root and canonical names.
Regenerate it if moving the prepared dataset to another machine. The separate
`config/data.yaml` is a template pointing to the default prepared location; it
does not mean a dataset exists yet.

`report.html` embeds genuine sample thumbnails and their remapped ground-truth
boxes, including a sample for each available class and split where possible.
`summary.json` includes images containing each class, object instances, per-split
counts, attribution, warnings, and hash/capture leakage links. Images containing
multiple classes count once in each applicable class column.

Coverage flags:

- **Missing:** zero objects for that class.
- **Underrepresented:** fewer than 20 images containing that class, or fewer than
  20% as many object instances as the largest class. This is a configurable-in-code
  preparation heuristic, not a sufficient dataset size or an accuracy guarantee.

`ready_for_training` only indicates nonempty splits with each class present. It
does not certify annotation quality, dataset size, license compatibility, or model
accuracy. Review low-coverage flags even when that field is true. No model
training is invoked by any preparation command.

`split_manifest.json` connects each copied file to its source image/label,
capture group, split component, source-file SHA-256, decoded-pixel SHA-256 and
perceptual hash. Keep this and `source_manifest.json` with your dataset.

## Tests

```powershell
ai_service/.venv/Scripts/python.exe -m pytest ai_service/tests -q
```

Dataset tests use temporary test-only label strings and the existing bus demo
to exercise remapping and file operations. They are not real civic labels and
are never registered or retained as production training data. Split tests also
use in-memory hash fixtures. No training images or labels are fabricated for
the actual dataset.

## Verification on this repository

The initial inventory report is at
`runs/dataset-inventory-initial/report.html`, with machine-readable counts in
the adjacent `summary.json`. Validation found no registered sources and no valid
labeled images; preparation stopped before creating `datasets/prepared/`.
All three classes are missing. Genuine civic box overlays and actual train/val/
test counts must wait for downloaded, registered datasets.

The dataset unit/integration tests and existing model/API smoke tests were run
successfully. The HTML report's content and embedded image were checked locally;
interactive browser preview was unavailable because the browser tool failed
before connecting. No training was performed.
