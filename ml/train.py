"""Trains the onboard anomaly model and exports it for the browser.

    python train.py data/dataset.json ../apps/web/public/models/anomaly-v1.json

The model is an Isolation Forest trained only on healthy days (novelty detection). Its trees are
exported as plain JSON and scored in TypeScript, so the app needs no AI runtime and works offline.
The alarm threshold is the 99th percentile of healthy validation scores: about 1% false alarms
per reading. A day is flagged when at least two of its readings are anomalous.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

SEED = 42
N_ESTIMATORS = 100
MAX_SAMPLES = 256
TARGET_FALSE_ALARM = 0.01
# The app flags a day only when at least this many readings of that day are anomalous.
MIN_ANOMALOUS_READINGS = 2


def load(path: Path) -> tuple[list[str], list[dict[str, Any]]]:
    data = json.loads(path.read_text("utf-8"))
    if not data.get("simulated"):
        raise ValueError("Training data must be the labelled simulated dataset")
    return data["features"], data["rows"]


def matrix(rows: list[dict[str, Any]]) -> np.ndarray:
    return np.array([r["x"] for r in rows], dtype=np.float64)


def export_tree(estimator: Any) -> dict[str, list[float] | list[int]]:
    tree = estimator.tree_
    return {
        "left": tree.children_left.tolist(),
        "right": tree.children_right.tolist(),
        "feature": tree.feature.tolist(),
        "threshold": [float(t) for t in tree.threshold],
        "samples": tree.n_node_samples.tolist(),
    }


def day_metrics(rows: list[dict[str, Any]], flagged: np.ndarray) -> dict[str, Any]:
    """Applies the app's day rule and reports, per kind, the share of days flagged."""
    days: dict[str, dict[str, Any]] = {}
    for row, hit in zip(rows, flagged, strict=True):
        day = days.setdefault(row["day"], {"kind": row["kind"], "hits": 0})
        day["hits"] += int(hit)
    result: dict[str, Any] = {}
    for kind in sorted({d["kind"] for d in days.values()}):
        of_kind = [d for d in days.values() if d["kind"] == kind]
        rate = sum(d["hits"] >= MIN_ANOMALOUS_READINGS for d in of_kind) / len(of_kind)
        result[kind] = {"flaggedRate": round(rate, 4), "days": len(of_kind)}
    return result


def train(dataset: Path) -> dict[str, Any]:
    features, rows = load(dataset)
    by_split = {s: [r for r in rows if r["split"] == s] for s in ("train", "validation", "test")}
    model = IsolationForest(
        n_estimators=N_ESTIMATORS, max_samples=MAX_SAMPLES, contamination="auto", random_state=SEED
    )
    model.fit(matrix(by_split["train"]))

    # Higher means more anomalous, so the browser compares "score >= threshold".
    validation_scores = -model.score_samples(matrix(by_split["validation"]))
    threshold = float(np.quantile(validation_scores, 1 - TARGET_FALSE_ALARM))

    test = by_split["test"]
    test_scores = -model.score_samples(matrix(test))
    flagged = test_scores >= threshold
    metrics: dict[str, Any] = {"threshold": threshold, "byKind": {}}
    for kind in sorted({r["kind"] for r in test}):
        mask = np.array([r["kind"] == kind for r in test])
        rate = float(flagged[mask].mean())
        key = "falseAlarmRate" if kind == "healthy" else "detectionRate"
        metrics["byKind"][kind] = {key: round(rate, 4), "samples": int(mask.sum())}
    anomalous = np.array([r["label"] == 1 for r in test])
    metrics["overallDetectionRate"] = round(float(flagged[anomalous].mean()), 4)
    metrics["falseAlarmRate"] = round(float(flagged[~anomalous].mean()), 4)
    metrics["byDay"] = day_metrics(test, flagged)

    parity = [
        {"x": r["x"], "score": float(s)} for r, s in zip(test[:: max(len(test) // 60, 1)], test_scores[:: max(len(test) // 60, 1)], strict=True)
    ]
    return {
        "model": {
            "version": "anomaly-v1",
            "kind": "isolation-forest",
            "features": features,
            "maxSamples": int(model.max_samples_),
            "threshold": threshold,
            "trees": [export_tree(e) for e in model.estimators_],
            "trainedOn": "simulated healthy crew days only",
            "metrics": metrics,
        },
        "parity": parity,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 1
    result = train(Path(argv[1]))
    out = Path(argv[2])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result["model"], separators=(",", ":")), "utf-8")
    parity_path = Path(__file__).parent / "data" / "parity.json"
    parity_path.write_text(json.dumps(result["parity"]), "utf-8")
    print(json.dumps(result["model"]["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
