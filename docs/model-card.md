# Model card: AURORA onboard anomaly model (anomaly-v1)

## What it is

An Isolation Forest (scikit-learn 1.9.1, 100 trees, 256 samples per tree, seed 42) that flags
moments when an astronaut's vital signs, taken together, look unlike that person's own normal.
It runs entirely in the browser: the trees are exported as JSON and scored by a TypeScript
re-implementation. No network, no cloud service and no paid API are involved, because on a Mars
mission the cloud is up to 22 minutes away.

## Inputs

Nine numbers per moment:

- seven per-signal deviations from the person's own baseline (heart rate, HRV, SpO2, systolic and
  diastolic pressure, temperature, respiratory rate), computed as the modified z-score of
  Iglewicz and Hoaglin with the sensor resolution as floor and clipped to ±10;
- the largest absolute deviation and the root mean square of the seven deviations.

If any signal is missing, no vector is built and the model is not called.

## Training data

Simulated only. Real astronaut records are privacy-protected, so the model is trained on healthy
days of three simulated crew members built from published adult ranges, each with their own
normal. See [data-card.md](data-card.md). Training uses healthy days only (novelty detection).

The personal normal is built from the first five mission days (20 readings), and a normal built
from so few readings varies from one draw to another. Each crew member therefore gets 30 baseline
draws for training, 10 for validation and 10 for testing, never shared between splits.

## Threshold and day rule

The threshold is the 99th percentile of anomaly scores on the healthy validation set, so about 1%
of single readings cross it by design. Threshold: 0.5888. A day is flagged only when at least two
of its four readings cross it, because one odd reading is more often noise than illness.

## Results on the held-out test set

| Pattern | Readings flagged | Days flagged (2 or more readings) |
|---|---|---|
| Healthy (false alarms) | 0.21% of 480 | 0% of 120 |
| Hypoxia | 100% | 100% of 30 |
| Fever | 100% | 100% |
| Tachycardia | 100% | 100% |
| Orthostatic drop | 100% | 100% |
| Hypertension | 98.3% | 100% |
| Mild hypoxia (half intensity) | 57.5% | 76.7% |
| Mild tachycardia | 58.3% | 70.0% |
| Mild fever | 62.5% | 66.7% |
| Mild orthostatic drop | 35.0% | 36.7% |
| Mild hypertension | 19.2% | 16.7% |

Across the seven mission scenarios of the simulator (21 days, three crew members), the only days
flagged are days 12 to 15 of the fever scenario for the crew member who has the fever. No healthy
crew member is flagged on any day (`anomalyMonitor.test.ts`).

### What changed from the first version

The first version used one baseline draw per crew member and reported 0.83% false alarms and
higher detection of mild changes. Running it over whole missions showed that this was optimistic:
with a different baseline draw, healthy crew members were flagged on up to half of the days.
Training and validating on many baseline draws gave a realistic threshold, and the two-reading day
rule removed the remaining false days. Detection of mild changes went down, and those numbers are
the honest ones. Strong changes are still caught on every day.

Before that, a version without the two aggregate features detected only 36% of tachycardia and
33% of hypertension readings; adding them fixed the strong cases.

## How it is used

- The model is one of three layers. Clinical rules (NEWS2) and the per-signal personal baseline
  catch large single-signal changes; the model adds multi-signal patterns. One layer covers the
  others' blind spots.
- An anomaly is shown with its three main drivers (the signals furthest from normal) and never
  as a diagnosis.
- The TypeScript scorer reproduces scikit-learn's `score_samples` to 10 decimal places on exported
  test vectors (see `isolationForest.test.ts`).

## Limitations

- Trained and evaluated on simulated data. Real-world accuracy is unknown and would need
  validation with real crew data under medical supervision.
- Anomalies were injected as fixed shifts; real illness evolves gradually and may look different.
- Mild changes are often missed, especially in blood pressure (see the table above). Clinical
  rules and the per-signal personal baseline cover part of that gap.
- Not a medical device. Not for clinical decisions.

## Intended and prohibited use

Intended: education, research prototyping, and demonstrating onboard, Earth-independent health
monitoring at the NASA Space Apps Challenge. Prohibited: diagnosis, treatment decisions, or any use
on real patients.

## Reproducing

```bash
cd apps/web && npx tsx scripts/export-training-data.ts ../../ml/data/dataset.json
cd ../../ml && python train.py data/dataset.json ../apps/web/public/models/anomaly-v1.json
python -m pytest test_train.py
```
