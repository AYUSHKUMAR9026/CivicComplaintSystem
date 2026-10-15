# Local data only

`samples/bus.jpg` is downloaded from the official Ultralytics repository for the
Phase 1 smoke test. It is not civic training data. Check upstream asset terms
before redistribution. Images are intentionally ignored by Git.

`raw/` reserves space for future civic images. No dataset is collected, labeled,
or used for training in Phase 1. Keep private citizen images out of Git.

Place each genuine downloaded YOLO detection dataset under `raw/<source_id>/`,
including its original labels, class definitions, license and attribution files.
See [the dataset preparation workflow](../DATASETS.md) for explicit class mapping,
validation, capture grouping, combination and split/report commands. The demo
photo is excluded from that pipeline unless someone explicitly registers it;
it must not be labeled as a civic issue merely to populate the dataset.
