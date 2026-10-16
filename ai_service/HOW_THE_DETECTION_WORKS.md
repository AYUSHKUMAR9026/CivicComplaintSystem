# How Civic Eye Detects Street Problems

A short, plain-English summary of the AI part of the project.

## The short version

**We did not train our own model.** We used models that were already
trained by other people, picked the good ones by testing them, and
built safety rules around them so the system does not file wrong
complaints.

This is a normal engineering choice. Training a good detector needs
thousands of hand-labelled street photos, which we did not have.

## What we used instead

Two kinds of models:

**1. One model running on our own computer**

- `yolo11n.pt` (YOLO11 "nano"), downloaded ready-made.
- It was trained by Ultralytics on **COCO**, a public dataset of about
  200,000 photos covering 80 everyday objects (people, cars, bags...).
- We only use it to find **people**, because that is the one thing it
  is very reliable at.

**2. Six models running on Roboflow's servers**

We send the photo to Roboflow over the internet and get boxes back.
Each was trained and published by its author, not by us.

| What it finds | Model | Notes |
| --- | --- | --- |
| Potholes | `potholes-scbcq/1` | Uses the RDD2022 road-damage labels. Only code `D40` means pothole; `D00`/`D10`/`D20` are cracks |
| Potholes | `potholes-detection-j3w8s/1` | Best overall coverage in our test |
| Potholes | `kuwait-potholes/1` | Weaker, used as a second opinion only |
| Garbage | `garbage-d6vgh/1` | Its 15 classes have no names, only numbers |
| People | `humans-v0nq1/1` | Used as context, and to catch mistakes |
| Vehicles | `cars-blxk2/2` | Used as context only |

## How we chose them

We built a small test set of **20 real photos** in
`ai_service/datasets/samples/` — potholes, plain roads, garbage piles,
crowds of people, and one control photo.

We ran every model over all 20 photos and compared the results. This is
how we found, for example:

- `garbage-d6vgh/1` was better than `garbage-jciga/1`, which scored
  0.54 on a plain road photo with no garbage in it.
- `kuwait-potholes/1` missed the pothole control photo but fired on two
  **garbage** photos, so we do not trust it on its own.
- `humans-v0nq1/1` found people in every people photo and never fired
  on a road or pothole photo.

This is testing, not training. We did not change any model's weights.

## The safety rules we added

A wrong detection becomes a real complaint in a citizen's name, so most
of our work went here.

1. **Confidence floor** — a detection is ignored below 0.40, and cannot
   file a complaint below 0.50.
2. **Person gate** — garbage models often mistake people for rubbish
   (one scored 0.91 on a street photo). If a garbage box sits on top of
   a person, we throw it away.
3. **Second opinion rule** — `kuwait-potholes/1` cannot file a
   complaint alone. Another pothole model must agree first. Without
   this, a photo of a garbage pile was filed as a pothole at 0.70.
4. **People and cars are never complaints** — they are drawn on screen
   for context only. A pedestrian is not a civic defect.
5. **Human in the loop** — the citizen gets an 8-second countdown to
   cancel, a 5-minute cooldown per category, a limit of 5 reports per
   session, and duplicates within 50 metres are skipped.

## What is ready for future training

The tools to train a real custom model are written and tested, but have
never been run, because we have no labelled data yet:

- `ai_service/training/` — training runner and a Colab notebook.
- `ai_service/dataset_tools/` — checks and merges labelled datasets.
- Planned classes: `pothole`, `garbage`, `overflowing_bin`.
- Current data count: **0 images, 0 labelled objects**
  (see `DATASETS.md`).

## Honest limitations

- Accuracy is **not measured** as a percentage. We have no labelled
  test set, only 20 photos we looked at by hand.
- The models were trained on other countries' roads, so they may do
  worse on local streets.
- Every scan costs a paid API call to Roboflow.
- It needs internet. No connection means no detection.
