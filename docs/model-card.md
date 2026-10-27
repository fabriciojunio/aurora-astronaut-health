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

## Threshold

The 99th percentile of anomaly scores on a separate healthy validation set, so about 1% false
alarms by design. Threshold: 0.5748.

## Results on the held-out test set

| Pattern | Samples | Detection rate |
|---|---|---|
| Healthy (false alarms) | 480 | 0.83% flagged |
| Hypoxia | 120 | 100% |
| Fever | 120 | 100% |
| Tachycardia | 120 | 100% |
| Orthostatic drop | 120 | 100% |
| Hypertension | 120 | 100% |
| Mild hypoxia (half intensity) | 120 | 90.8% |
| Mild tachycardia | 120 | 87.5% |
| Mild fever | 120 | 86.7% |
| Mild orthostatic drop | 120 | 63.3% |
| Mild hypertension | 120 | 30.0% |

Overall detection across all anomalous samples: 85.8%.

The first version, without the two aggregate features, detected only 36% of tachycardia and
33% of hypertension. Adding them fixed the strong cases; mild single-signal changes remain the
weak spot.

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
- Mild changes in a single signal are often missed (see the table above).
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
